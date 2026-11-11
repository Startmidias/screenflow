-- =====================================================================
--  START PLAY — atualização 06
--  Cotação com fonte reserva: se a AwesomeAPI recusar (ex.: HTTP 429,
--  limite de pedidos por endereço), usa as taxas do Banco Central Europeu
--  (Frankfurter) por 6 horas. Rodar depois da 05 (pode repetir).
-- =====================================================================
alter table public.content_cache add column if not exists src text;          -- fonte do último pedido
alter table public.content_cache add column if not exists src_until timestamptz;

-- Frankfurter (taxas do BCE): /v1/AAAA-MM-DD..?base=BRL&symbols=USD,EUR
create or replace function public.sf_parse_frankfurter(j jsonb) returns jsonb
language sql immutable as $$
  with d as (select key::date as day, value as r from jsonb_each(j->'rates')),
  l as (select * from d order by day desc limit 1),
  p as (select * from d order by day desc offset 1 limit 1)
  select jsonb_build_object('src', 'frankfurter', 'items', coalesce(jsonb_agg(jsonb_build_object(
           'code', c.key,
           'name', case c.key when 'USD' then 'Dólar' when 'EUR' then 'Euro' when 'GBP' then 'Libra' else c.key end,
           'bid', round(1 / (c.value #>> '{}')::numeric, 4),
           'pct', case when (p.r->>c.key) is not null then round(((p.r->>c.key)::numeric / (c.value #>> '{}')::numeric - 1) * 100, 2) end,
           'at', l.day::text)
         order by array_position(array['USD','EUR','GBP','JPY','CHF','CAD','AUD','CNY'], c.key)), '[]'::jsonb))
    from l cross join jsonb_each(l.r) c left join p on true
   where (c.value #>> '{}')::numeric > 0;
$$;

create or replace function public.sf_content_tick(p_force boolean default false) returns int
language plpgsql security definer set search_path = public as $$
declare
  st     public.settings;
  cfg    jsonb;
  tz     text;
  want   text[] := '{}';
  k      text;
  c      public.content_cache;
  r      record;
  body   jsonb;
  parsed jsonb;
  every  interval;
  url    text;
  hdr    jsonb := jsonb_build_object('User-Agent', 'StartPlay/3.2 (+https://startmidias.github.io/screenflow/)', 'Accept', 'application/json');
  lg     text;
  n      int := 0;
  fx     text;
begin
  select * into st from public.settings where id = 1;
  cfg := coalesce(st.content, '{}'::jsonb);
  tz := coalesce(st.timezone, 'America/Cuiaba');

  -- o que alguma TV precisa
  if exists (select 1 from public.screens where name <> 'Nova tela' and (extras->>'enabled')::boolean and extras->'items' ? 'clima') then
    want := array_append(want, 'clima'); end if;
  if exists (select 1 from public.screens where name <> 'Nova tela' and (extras->>'enabled')::boolean and extras->'items' ? 'cotacao') then
    want := array_append(want, 'cotacao'); end if;
  if exists (select 1 from public.screens where name <> 'Nova tela' and (extras->>'enabled')::boolean and extras->'items' ? 'futebol') then
    for lg in select jsonb_array_elements_text(coalesce(cfg->'leagues', '["bra.1"]'::jsonb)) loop
      if lg ~ '^[a-z0-9._]{2,40}$' then want := array_append(want, 'jogos:' || lg); end if;
    end loop;
    want := array_append(want, 'tabela:bra.1');
  end if;

  foreach k in array want loop
    insert into public.content_cache(id) values (k) on conflict (id) do nothing;
    select * into c from public.content_cache where id = k;

    -- 1) resposta do pedido anterior chegou?
    if c.req_id is not null then
      select status_code, content, error_msg, timed_out into r from net._http_response where id = c.req_id;
      if found then
        parsed := null;
        begin
          if r.status_code between 200 and 299 then
            body := r.content::jsonb;
            parsed := case
              when k = 'clima'   then public.sf_parse_clima(body, tz)
              when k = 'cotacao' and c.src = 'frankfurter' then public.sf_parse_frankfurter(body)
              when k = 'cotacao' then public.sf_parse_cotacao(body)
              when k like 'jogos:%'  then public.sf_parse_jogos(body)
              when k like 'tabela:%' then public.sf_parse_tabela(body) end;
          end if;
        exception when others then parsed := null; r.error_msg := 'resposta inválida: ' || sqlerrm;
        end;
        if parsed is not null and parsed <> '{}'::jsonb then
          update public.content_cache set data = parsed, ok_at = now(), fetched_at = now(), last_error = null, req_id = null where id = k;
          n := n + 1;
        else
          update public.content_cache
             set fetched_at = now(), req_id = null,
                 last_error = left(coalesce(r.error_msg, case when r.timed_out then 'tempo esgotado' end, 'HTTP ' || r.status_code), 200)
           where id = k;
          -- cotação: se a AwesomeAPI recusar (ex.: HTTP 429), usa o Banco Central Europeu por 6 horas
          if k = 'cotacao' and coalesce(c.src, 'awesome') <> 'frankfurter' then
            update public.content_cache set src = 'frankfurter', src_until = now() + interval '6 hours', fetched_at = null where id = k;
          end if;
        end if;
        continue;
      elsif c.req_at < now() - interval '3 minutes' then
        update public.content_cache set req_id = null, fetched_at = now(), last_error = 'sem resposta' where id = k;
        continue;
      else
        continue;   -- ainda esperando
      end if;
    end if;

    -- 2) hora de buscar de novo?
    every := case
      when k = 'clima' then interval '30 minutes'
      when k = 'cotacao' then interval '10 minutes'
      when k like 'tabela:%' then interval '60 minutes'
      when k like 'jogos:%' and c.data is not null and exists (
             select 1 from jsonb_array_elements(c.data->'games') g where g->>'state' = 'in') then interval '2 minutes'
      else interval '10 minutes' end;
    if not p_force and c.fetched_at is not null and c.fetched_at > now() - every then continue; end if;

    if k = 'cotacao' then
      fx := case when c.src = 'frankfurter' and c.src_until > now() then 'frankfurter' else 'awesome' end;
      update public.content_cache set src = fx where id = k;
    end if;
    url := case
      when k = 'clima' then 'https://api.met.no/weatherapi/locationforecast/2.0/compact'
      when k = 'cotacao' and fx = 'frankfurter' then 'https://api.frankfurter.dev/v1/' || to_char(current_date - 8, 'YYYY-MM-DD') || '..'
      when k = 'cotacao' then 'https://economia.awesomeapi.com.br/json/last/' ||
           coalesce((select string_agg(x || '-BRL', ',') from jsonb_array_elements_text(coalesce(cfg->'coins', '["USD","EUR"]'::jsonb)) x
                      where x ~ '^[A-Z]{3}$'), 'USD-BRL')
      when k like 'jogos:%'  then 'https://site.api.espn.com/apis/site/v2/sports/soccer/' || substr(k, 7) || '/scoreboard'
      when k like 'tabela:%' then 'https://site.api.espn.com/apis/v2/sports/soccer/' || substr(k, 8) || '/standings' end;
    update public.content_cache
       set req_id = net.http_get(url := url,
             params := case when k = 'clima' then jsonb_build_object(
                         'lat', round(coalesce((cfg->>'lat')::numeric, -15.601), 3)::text,
                         'lon', round(coalesce((cfg->>'lon')::numeric, -56.097), 3)::text)
                       when k = 'cotacao' and fx = 'frankfurter' then jsonb_build_object('base', 'BRL', 'symbols',
                         coalesce((select string_agg(x, ',') from jsonb_array_elements_text(coalesce(cfg->'coins', '["USD","EUR"]'::jsonb)) x
                                    where x in ('USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'CNY')), 'USD'))
                       else '{}'::jsonb end,
             headers := hdr, timeout_milliseconds := 15000),
           req_at = now()
     where id = k;
  end loop;
  return n;
end $$;

revoke all on function public.sf_content_tick(boolean) from public, anon, authenticated;

notify pgrst, 'reload schema';
select 'Atualização 06 aplicada' as resultado;
