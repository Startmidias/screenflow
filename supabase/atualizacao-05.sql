-- =====================================================================
--  START PLAY — atualização 05
--  Aviso de TV fora do ar (WhatsApp/e-mail), "ver a tela agora",
--  conteúdo entre os anúncios (clima, cotação, futebol) e criador de artes.
--  Tudo roda no próprio banco: pg_cron chama sf_tick() a cada minuto e o
--  pg_net faz as chamadas HTTP. Rodar uma vez no SQL Editor depois da 04
--  (pode repetir).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Extensões (no Supabase já vêm disponíveis; aqui só são ligadas)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Telas: comando "shot" (tirar a miniatura agora), conteúdo entre anúncios
-- e o estado do aviso de fora do ar
-- ---------------------------------------------------------------------
alter table public.screens drop constraint if exists screens_command_check;
alter table public.screens add  constraint screens_command_check
  check (command is null or command in ('reload', 'identify', 'shot'));
alter table public.screens add column if not exists extras jsonb not null
  default '{"enabled": false, "items": ["clima", "cotacao", "futebol"], "every": 3, "seconds": 10}';
alter table public.screens add column if not exists alert_down_at timestamptz;   -- aviso de queda enviado
alter table public.screens add column if not exists alert_since   timestamptz;   -- último contato antes da queda
alter table public.screens add column if not exists alert_sent_at timestamptz;   -- última mensagem (queda ou lembrete)

create or replace function public.sf_screens_check() returns trigger
language plpgsql as $$
declare
  t   jsonb := coalesce(new.ticker, '{}'::jsonb);
  x   jsonb := coalesce(new.extras, '{}'::jsonb);
  src jsonb;
  its jsonb;
begin
  if jsonb_typeof(t) <> 'object' then t := '{}'::jsonb; end if;
  src := case when jsonb_typeof(t->'sources') = 'array' then t->'sources' else '["uol"]'::jsonb end;
  select coalesce(jsonb_agg(v order by v), '[]'::jsonb) into src
  from (select distinct value #>> '{}' as v
        from jsonb_array_elements(src)
        where jsonb_typeof(value) = 'string' and (value #>> '{}') ~ '^[a-z0-9-]{2,30}$'
        limit 30) q;
  new.ticker := jsonb_build_object(
    'enabled', coalesce(t->'enabled' = 'true'::jsonb, false),
    'sources', src,
    'speed',   case when (t->>'speed') ~ '^[1-5]$' then (t->>'speed')::int else 3 end);

  -- conteúdo entre os anúncios: só os tipos conhecidos, números dentro de limites
  if jsonb_typeof(x) <> 'object' then x := '{}'::jsonb; end if;
  its := case when jsonb_typeof(x->'items') = 'array' then x->'items' else '["clima","cotacao","futebol"]'::jsonb end;
  select coalesce(jsonb_agg(v order by o), '[]'::jsonb) into its
  from (select distinct on (value #>> '{}') value #>> '{}' as v, o
        from jsonb_array_elements(its) with ordinality as e(value, o)
        where (value #>> '{}') in ('clima', 'cotacao', 'futebol')) q;
  new.extras := jsonb_build_object(
    'enabled', coalesce(x->'enabled' = 'true'::jsonb, false),
    'items',   its,
    'every',   case when (x->>'every') ~ '^[0-9]{1,2}$' then greatest(1, least(20, (x->>'every')::int)) else 3 end,
    'seconds', case when (x->>'seconds') ~ '^[0-9]{1,2}$' then greatest(6, least(30, (x->>'seconds')::int)) else 10 end);
  return new;
end $$;
drop trigger if exists sf_screens_check on public.screens;
create trigger sf_screens_check before insert or update of ticker, extras on public.screens
  for each row execute function public.sf_screens_check();
update public.screens set extras = extras;   -- normaliza as que já existem

alter table public.screen_events drop constraint if exists screen_events_kind_check;
alter table public.screen_events add  constraint screen_events_kind_check
  check (kind in ('back', 'boot', 'version', 'error', 'program', 'alert'));

-- ---------------------------------------------------------------------
-- Ajustes do conteúdo entre anúncios (cidade do clima, moedas, campeonatos)
-- ---------------------------------------------------------------------
alter table public.settings add column if not exists content jsonb not null
  default '{"city": "Cuiabá", "lat": -15.601, "lon": -56.097, "coins": ["USD", "EUR"], "leagues": ["bra.1", "bra.2"]}';

-- ---------------------------------------------------------------------
-- Criador de artes: os dados da arte ficam no anúncio (para editar depois)
-- ---------------------------------------------------------------------
alter table public.media add column if not exists design jsonb;
alter table public.media drop constraint if exists media_design_chk;
alter table public.media add  constraint media_design_chk
  check (design is null or (jsonb_typeof(design) = 'object' and pg_column_size(design) < 20000));

-- ---------------------------------------------------------------------
-- Expediente no banco (mesma regra do agenda.js do player e do painel)
-- ---------------------------------------------------------------------
create or replace function public.sf_window(s public.screens, d date,
  out closed boolean, out allday boolean, out f int, out t int)
language plpgsql stable security definer set search_path = public as $$
declare e public.schedule_exceptions;
begin
  closed := false; allday := false; f := null; t := null;
  select * into e from public.schedule_exceptions x
   where x.day = d and (x.screen_id = s.id or x.screen_id is null)
   order by (x.screen_id is null) limit 1;
  if found then
    if e.closed then closed := true; return; end if;
    f := extract(hour from e.open_at)::int * 60 + extract(minute from e.open_at)::int;
    t := extract(hour from e.close_at)::int * 60 + extract(minute from e.close_at)::int;
    if f is null or t is null or f = t then allday := true; end if;
    return;
  end if;
  if not s.hours_on then allday := true; return; end if;
  if cardinality(s.open_days) > 0 and not (extract(dow from d)::smallint = any(s.open_days)) then closed := true; return; end if;
  f := extract(hour from s.open_at)::int * 60 + extract(minute from s.open_at)::int;
  t := extract(hour from s.close_at)::int * 60 + extract(minute from s.close_at)::int;
  if f = t then allday := true; end if;
end $$;

-- desde quando a tela está no expediente atual (null = fora do expediente)
create or replace function public.sf_open_since(s public.screens, p_at timestamptz default now())
returns timestamptz
language plpgsql stable security definer set search_path = public as $$
declare
  tz   text := coalesce((select timezone from public.settings where id = 1), 'America/Cuiaba');
  loc  timestamp := p_at at time zone tz;
  d    date := loc::date;
  m    int := extract(hour from loc)::int * 60 + extract(minute from loc)::int;
  w    record;
  y    record;
  k    int := 0;
begin
  select * into w from public.sf_window(s, d);
  if w.allday then
    -- dia todo: começou à meia-noite, ou antes se os dias anteriores também eram "dia todo"
    loop
      exit when k >= 7;
      select * into y from public.sf_window(s, d - (k + 1));
      exit when not y.allday;
      k := k + 1;
    end loop;
    return ((d - k)::timestamp) at time zone tz;
  end if;
  if not w.closed and ((w.f < w.t and m >= w.f and m < w.t) or (w.f > w.t and m >= w.f)) then
    return (d::timestamp + make_interval(mins => w.f)) at time zone tz;
  end if;
  select * into y from public.sf_window(s, d - 1);
  if not y.closed and not y.allday and y.f > y.t and m < y.t then
    return ((d - 1)::timestamp + make_interval(mins => y.f)) at time zone tz;
  end if;
  return null;
end $$;

create or replace function public.sf_is_open(s public.screens, p_at timestamptz default now())
returns boolean language sql stable security definer set search_path = public as $$
  select public.sf_open_since(s, p_at) is not null;
$$;

-- ---------------------------------------------------------------------
-- Avisos de TV fora do ar
-- ---------------------------------------------------------------------
create table if not exists public.alert_settings (
  id          int primary key default 1 check (id = 1),
  wa_on       boolean not null default false,
  wa_phone    text,
  wa_key      text,
  mail_on     boolean not null default false,
  mail_to     text,
  mail_key    text,
  mail_from   text not null default 'START PLAY <onboarding@resend.dev>',
  after_min   int not null default 10 check (after_min between 3 and 240),
  notify_back boolean not null default true,
  updated_at  timestamptz not null default now(),
  check (wa_phone is null or wa_phone ~ '^\+[0-9]{10,15}$'),
  check (mail_to is null or mail_to ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
insert into public.alert_settings(id, wa_phone)
select 1, case when regexp_replace(coalesce(phone, ''), '\D', '', 'g') ~ '^[0-9]{10,11}$'
               then '+55' || regexp_replace(phone, '\D', '', 'g') end
  from public.settings where id = 1
on conflict (id) do nothing;
insert into public.alert_settings(id) values (1) on conflict (id) do nothing;

create table if not exists public.alert_log (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  screen_id text references public.screens(id) on delete set null,
  kind      text not null check (kind in ('down', 'back', 'reminder', 'test')),
  channel   text not null check (channel in ('whatsapp', 'email')),
  message   text not null,
  req_id    bigint
);
create index if not exists alert_log_at_idx on public.alert_log(at desc);

-- envia a mensagem pelos canais ligados (assíncrono: a resposta chega em net._http_response)
create or replace function public.sf_notify(p_kind text, p_screen text, p_msg text, p_subject text default null)
returns int
language plpgsql security definer set search_path = public as $$
declare
  a public.alert_settings;
  rid bigint;
  n int := 0;
begin
  select * into a from public.alert_settings where id = 1;
  if not found then return 0; end if;
  if a.wa_on and a.wa_phone is not null and coalesce(a.wa_key, '') <> '' then
    rid := net.http_get(
      url := 'https://api.callmebot.com/whatsapp.php',
      params := jsonb_build_object('phone', a.wa_phone, 'text', p_msg, 'apikey', a.wa_key),
      timeout_milliseconds := 20000);
    insert into public.alert_log(screen_id, kind, channel, message, req_id) values (p_screen, p_kind, 'whatsapp', p_msg, rid);
    n := n + 1;
  end if;
  if a.mail_on and a.mail_to is not null and coalesce(a.mail_key, '') <> '' then
    rid := net.http_post(
      url := 'https://api.resend.com/emails',
      body := jsonb_build_object('from', a.mail_from, 'to', jsonb_build_array(a.mail_to),
                                 'subject', coalesce(p_subject, 'START PLAY'), 'text', p_msg),
      headers := jsonb_build_object('Authorization', 'Bearer ' || a.mail_key, 'Content-Type', 'application/json'),
      timeout_milliseconds := 20000);
    insert into public.alert_log(screen_id, kind, channel, message, req_id) values (p_screen, p_kind, 'email', p_msg, rid);
    n := n + 1;
  end if;
  return n;
end $$;

create or replace function public.sf_fmt_dur(i interval) returns text
language sql immutable as $$
  select case
    when i < interval '1 hour' then greatest(1, floor(extract(epoch from i) / 60))::int || ' min'
    when i < interval '1 day'  then floor(extract(epoch from i) / 3600)::int || ' h ' || lpad((floor(extract(epoch from i) / 60)::int % 60)::text, 2, '0') || ' min'
    else floor(extract(epoch from i) / 86400)::int || ' dia(s) e ' || (floor(extract(epoch from i) / 3600)::int % 24) || ' h'
  end;
$$;

drop function if exists public.sf_alert_tick();
create or replace function public.sf_alert_tick(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public as $$
declare
  a    public.alert_settings;
  tz   text := coalesce((select timezone from public.settings where id = 1), 'America/Cuiaba');
  s    public.screens;
  thr  interval;
  since timestamptz;
  who  text;
  msg  text;
  n    int := 0;
  sent int;
begin
  select * into a from public.alert_settings where id = 1;
  if not found or not ((a.wa_on and coalesce(a.wa_key, '') <> '') or (a.mail_on and coalesce(a.mail_key, '') <> '')) then
    return 0;   -- nenhum canal configurado: nada a fazer
  end if;
  thr := make_interval(mins => a.after_min);
  for s in select * from public.screens where name <> 'Nova tela' and last_seen is not null order by id loop
    who := '*' || s.name || '*' || coalesce(' (' || nullif(s.location, '') || ')', '');
    if s.last_seen < p_now - thr then
      since := public.sf_open_since(s, p_now);
      if since is not null and since <= p_now - thr then
        if s.alert_down_at is null then
          msg := '⚠️ START PLAY: a TV ' || who || ' está sem sinal desde ' ||
                 to_char(s.last_seen at time zone tz, 'HH24:MI "de" DD/MM') || '.' || chr(10) ||
                 'Confira se o TV Box está ligado e conectado ao Wi-Fi. Se estiver ligado, ele continua passando os anúncios guardados e envia os registros quando voltar.';
          sent := public.sf_notify('down', s.id, msg, 'TV ' || s.name || ' sem sinal');
          if sent > 0 then
            update public.screens set alert_down_at = p_now, alert_since = s.last_seen, alert_sent_at = p_now where id = s.id;
            insert into public.screen_events(screen_id, kind, detail) values (s.id, 'alert', 'aviso enviado: sem sinal');
            n := n + 1;
          end if;
        elsif since > s.alert_sent_at then
          -- novo expediente e a TV continua fora: um lembrete por expediente
          msg := '⚠️ START PLAY: a TV ' || who || ' continua sem sinal (desde ' ||
                 to_char(coalesce(s.alert_since, s.last_seen) at time zone tz, 'HH24:MI "de" DD/MM') || ').';
          sent := public.sf_notify('reminder', s.id, msg, 'TV ' || s.name || ' continua sem sinal');
          if sent > 0 then
            update public.screens set alert_sent_at = p_now where id = s.id;
            n := n + 1;
          end if;
        end if;
      end if;
    elsif s.alert_down_at is not null then
      if a.notify_back then
        msg := '✅ START PLAY: a TV ' || who || ' voltou a se conectar às ' ||
               to_char(s.last_seen at time zone tz, 'HH24:MI') || ' (ficou ' ||
               public.sf_fmt_dur(s.last_seen - coalesce(s.alert_since, s.alert_down_at)) || ' sem sinal).';
        perform public.sf_notify('back', s.id, msg, 'TV ' || s.name || ' voltou');
      end if;
      update public.screens set alert_down_at = null, alert_since = null, alert_sent_at = null where id = s.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- botão "Enviar teste" do painel
create or replace function public.sf_alert_test() returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.sf_is_admin() then raise exception 'sem permissão'; end if;
  n := public.sf_notify('test', null,
         '✅ START PLAY: aviso de teste. Quando uma TV ficar sem sinal no horário de funcionamento, você recebe uma mensagem como esta.',
         'START PLAY: aviso de teste');
  return coalesce((select jsonb_agg(jsonb_build_object('channel', channel, 'req', req_id))
                     from (select channel, req_id from public.alert_log where kind = 'test' order by id desc limit n) q), '[]'::jsonb);
end $$;

-- resultado dos envios (lê a resposta guardada pelo pg_net)
create or replace function public.sf_alert_history(p_limit int default 30)
returns table(at timestamptz, screen_name text, kind text, channel text, message text, status int, ok boolean, error text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sf_is_admin() then raise exception 'sem permissão'; end if;
  return query
  select l.at, s.name, l.kind, l.channel, l.message, r.status_code,
         case when r.id is null then null
              when r.status_code between 200 and 299 and coalesce(r.content, '') !~* '(apikey is invalid|invalid apikey|error|not (been )?activated|blocked)' then true
              else false end,
         case when r.id is null then null
              else left(coalesce(r.error_msg, nullif(regexp_replace(coalesce(r.content, ''), '<[^>]+>', ' ', 'g'), '')), 240) end
    from public.alert_log l
    left join public.screens s on s.id = l.screen_id
    left join net._http_response r on r.id = l.req_id
   order by l.id desc
   limit least(greatest(p_limit, 1), 200);
end $$;

-- ---------------------------------------------------------------------
-- "Ver a tela agora": miniatura enviada pela TV
-- ---------------------------------------------------------------------
create table if not exists public.screen_shots (
  id        bigint generated always as identity primary key,
  screen_id text not null references public.screens(id) on delete cascade,
  at        timestamptz not null default now(),
  img       text not null,
  w         int,
  h         int,
  what      text
);
create index if not exists screen_shots_idx on public.screen_shots(screen_id, at desc);

create or replace function public.sf_shot(p_screen text, p_img text, p_w int default null, p_h int default null, p_what text default null)
returns boolean
language plpgsql security definer set search_path = public as $$
declare last timestamptz;
begin
  if not exists (select 1 from public.screens where id = p_screen and name <> 'Nova tela') then return false; end if;
  if p_img is null or length(p_img) > 200000
     or p_img !~ '^data:image/(webp|jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$' then
    raise exception 'imagem inválida';
  end if;
  select max(at) into last from public.screen_shots where screen_id = p_screen;
  if last is not null and last > now() - interval '45 seconds' then return false; end if;   -- uma por vez
  insert into public.screen_shots(screen_id, img, w, h, what)
  values (p_screen, p_img, least(greatest(p_w, 1), 4000), least(greatest(p_h, 1), 4000), left(p_what, 160));
  -- guarda as últimas 48 de cada TV (umas 4 horas) e nada com mais de 3 dias
  delete from public.screen_shots
   where screen_id = p_screen
     and (at < now() - interval '3 days'
          or id not in (select id from public.screen_shots where screen_id = p_screen order by at desc limit 48));
  return true;
end $$;
revoke all on function public.sf_shot(text, text, int, int, text) from public;
-- a última miniatura de cada TV (para o painel)
create or replace function public.sf_shots_latest()
returns table(screen_id text, at timestamptz, img text, w int, h int, what text)
language sql stable security definer set search_path = public as $$
  select distinct on (x.screen_id) x.screen_id, x.at, x.img, x.w, x.h, x.what
    from public.screen_shots x
   where public.sf_is_admin()
   order by x.screen_id, x.at desc;
$$;
revoke all on function public.sf_shots_latest() from public, anon;
grant execute on function public.sf_shots_latest() to authenticated;
grant execute on function public.sf_shot(text, text, int, int, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Conteúdo entre os anúncios: coleta no servidor, uma vez para todas as TVs
-- ---------------------------------------------------------------------
create table if not exists public.content_cache (
  id         text primary key,          -- clima · cotacao · jogos:bra.1 · tabela:bra.1 …
  data       jsonb,
  ok_at      timestamptz,
  fetched_at timestamptz,
  last_error text,
  req_id     bigint,
  req_at     timestamptz
);

-- clima (MET Norway, locationforecast/compact)
create or replace function public.sf_parse_clima(j jsonb, tz text) returns jsonb
language sql stable as $$
  with ts as (
    select (e->>'time')::timestamptz as t,
           ((e->>'time')::timestamptz at time zone tz) as lt,
           (e #>> '{data,instant,details,air_temperature}')::numeric as temp,
           (e #>> '{data,instant,details,relative_humidity}')::numeric as hum,
           coalesce(e #>> '{data,next_1_hours,summary,symbol_code}', e #>> '{data,next_6_hours,summary,symbol_code}') as sym1,
           coalesce(e #>> '{data,next_6_hours,summary,symbol_code}', e #>> '{data,next_12_hours,summary,symbol_code}') as sym6,
           o
      from jsonb_array_elements(j #> '{properties,timeseries}') with ordinality as x(e, o)
  ), days as (
    select lt::date as d, min(temp) as tmin, max(temp) as tmax,
           (array_agg(sym6 order by abs(extract(hour from lt) - 12)) filter (where sym6 is not null))[1] as sym
      from ts group by 1
  )
  select jsonb_build_object(
    'updated', j #>> '{properties,meta,updated_at}',
    'now', (select jsonb_build_object('t', round(temp), 'hum', round(hum), 'sym', sym1, 'at', t) from ts order by o limit 1),
    'days', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'min', round(tmin), 'max', round(tmax), 'sym', sym) order by d), '[]'::jsonb)
               from (select * from days where d >= (now() at time zone tz)::date order by d limit 4) q))
  where jsonb_typeof(j #> '{properties,timeseries}') = 'array';
$$;

-- cotação (AwesomeAPI: /json/last/USD-BRL,EUR-BRL…)
create or replace function public.sf_parse_cotacao(j jsonb) returns jsonb
language sql immutable as $$
  select jsonb_build_object('items', coalesce(jsonb_agg(jsonb_build_object(
           'code', v->>'code', 'name', split_part(v->>'name', '/', 1),
           'bid', (v->>'bid')::numeric, 'pct', round((v->>'pctChange')::numeric, 2),
           'at', v->>'create_date') order by array_position(array['USD','EUR','GBP','ARS','BTC','ETH'], v->>'code')), '[]'::jsonb))
    from jsonb_each(j) as e(k, v)
   where jsonb_typeof(v) = 'object' and (v->>'bid') ~ '^[0-9.]+$';
$$;

-- jogos do dia/rodada (placar público da ESPN)
create or replace function public.sf_parse_jogos(j jsonb) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'league', coalesce(j #>> '{leagues,0,name}', ''),
    'slug',   coalesce(j #>> '{leagues,0,slug}', ''),
    'day',    j #>> '{day,date}',
    'games',  coalesce((select jsonb_agg(g order by g->>'at') from (
       select jsonb_build_object(
         'at', e->>'date',
         'state', e #>> '{status,type,state}',
         'clock', e #>> '{status,displayClock}',
         'status', e #>> '{status,type,name}',
         'home', (select jsonb_build_object('name', c #>> '{team,shortDisplayName}', 'abbr', c #>> '{team,abbreviation}', 'score', c->>'score', 'color', c #>> '{team,color}')
                    from jsonb_array_elements(e #> '{competitions,0,competitors}') c where c->>'homeAway' = 'home'),
         'away', (select jsonb_build_object('name', c #>> '{team,shortDisplayName}', 'abbr', c #>> '{team,abbreviation}', 'score', c->>'score', 'color', c #>> '{team,color}')
                    from jsonb_array_elements(e #> '{competitions,0,competitors}') c where c->>'homeAway' = 'away')) as g
         from jsonb_array_elements(coalesce(j->'events', '[]'::jsonb)) e
        limit 12) q), '[]'::jsonb));
$$;

-- classificação (ESPN standings)
create or replace function public.sf_parse_tabela(j jsonb) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'league', coalesce(j #>> '{children,0,name}', j->>'name', ''),
    'rows', coalesce((select jsonb_agg(r order by (r->>'pos')::int) from (
       select jsonb_build_object(
         'pos',  (select (s->>'value')::numeric::int from jsonb_array_elements(x->'stats') s where s->>'name' = 'rank'),
         'name', x #>> '{team,shortDisplayName}', 'abbr', x #>> '{team,abbreviation}',
         'pts',  (select (s->>'value')::numeric::int from jsonb_array_elements(x->'stats') s where s->>'name' = 'points'),
         'pj',   (select (s->>'value')::numeric::int from jsonb_array_elements(x->'stats') s where s->>'name' = 'gamesPlayed'),
         'v',    (select (s->>'value')::numeric::int from jsonb_array_elements(x->'stats') s where s->>'name' = 'wins'),
         'sg',   (select (s->>'value')::numeric::int from jsonb_array_elements(x->'stats') s where s->>'name' = 'pointDifferential')) as r
         from jsonb_array_elements(j #> '{children,0,standings,entries}') x) q
       where (r->>'pos')::int <= 20), '[]'::jsonb));
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

    url := case
      when k = 'clima' then 'https://api.met.no/weatherapi/locationforecast/2.0/compact'
      when k = 'cotacao' then 'https://economia.awesomeapi.com.br/json/last/' ||
           coalesce((select string_agg(x || '-BRL', ',') from jsonb_array_elements_text(coalesce(cfg->'coins', '["USD","EUR"]'::jsonb)) x
                      where x ~ '^[A-Z]{3}$'), 'USD-BRL')
      when k like 'jogos:%'  then 'https://site.api.espn.com/apis/site/v2/sports/soccer/' || substr(k, 7) || '/scoreboard'
      when k like 'tabela:%' then 'https://site.api.espn.com/apis/v2/sports/soccer/' || substr(k, 8) || '/standings' end;
    update public.content_cache
       set req_id = net.http_get(url := url,
             params := case when k = 'clima' then jsonb_build_object(
                         'lat', round(coalesce((cfg->>'lat')::numeric, -15.601), 3)::text,
                         'lon', round(coalesce((cfg->>'lon')::numeric, -56.097), 3)::text) else '{}'::jsonb end,
             headers := hdr, timeout_milliseconds := 15000),
           req_at = now()
     where id = k;
  end loop;
  return n;
end $$;

-- botão "Atualizar agora" em Ajustes
create or replace function public.sf_content_status(p_refresh boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.sf_is_admin() then raise exception 'sem permissão'; end if;
  if p_refresh then
    update public.content_cache set fetched_at = null where req_id is null;
    perform public.sf_content_tick(true);
  end if;
  return coalesce((select jsonb_object_agg(id, jsonb_build_object('ok_at', ok_at, 'error', last_error, 'waiting', req_id is not null, 'data', data))
                     from public.content_cache), '{}'::jsonb);
end $$;

-- o que roda a cada minuto
create or replace function public.sf_tick() returns void
language plpgsql security definer set search_path = public as $$
begin
  begin perform public.sf_alert_tick();   exception when others then raise warning 'alertas: %', sqlerrm; end;
  begin perform public.sf_content_tick(); exception when others then raise warning 'conteúdo: %', sqlerrm; end;
end $$;

-- ---------------------------------------------------------------------
-- O que a TV recebe: + conteúdo entre anúncios
-- ---------------------------------------------------------------------
create or replace function public.sf_payload(s public.screens, p_ahead boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := public.sf_today();
  st public.settings;
  v_items jsonb;
  v_scr jsonb;
  v_exc jsonb;
  v_content jsonb;
begin
  select * into st from public.settings where id = 1;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id, 'title', m.title, 'kind', m.kind, 'url', m.url, 'duration', m.duration_sec,
           'days', to_jsonb(m.days), 'from', to_char(m.time_from, 'HH24:MI'), 'to', to_char(m.time_to, 'HH24:MI'),
           'starts_on', m.starts_on, 'ends_on', m.ends_on)
         order by m.position, m.created_at), '[]'::jsonb)
    into v_items
    from public.media m
   where m.active
     and s.name <> 'Nova tela'
     and (m.ends_on   is null or m.ends_on >= v_today)
     and (m.starts_on is null or m.starts_on <= v_today + case when p_ahead then 7 else 0 end)
     and (m.screen_ids is null or cardinality(m.screen_ids) = 0 or s.id = any(m.screen_ids));

  select coalesce(jsonb_agg(jsonb_build_object('day', e.day, 'closed', e.closed,
           'open', to_char(e.open_at, 'HH24:MI'), 'close', to_char(e.close_at, 'HH24:MI'),
           'own', e.screen_id is not null, 'note', e.note) order by e.day), '[]'::jsonb)
    into v_exc
    from public.schedule_exceptions e
   where (e.screen_id is null or e.screen_id = s.id)
     and e.day between v_today - 1 and v_today + 30;

  v_scr := jsonb_build_object(
      'id', s.id, 'name', s.name, 'unit', s.location, 'added', s.name <> 'Nova tela',
      'orientation', s.orientation,
      'hours', jsonb_build_object('on', s.hours_on, 'open', to_char(s.open_at, 'HH24:MI'),
                                  'close', to_char(s.close_at, 'HH24:MI'), 'days', to_jsonb(s.open_days)),
      'ticker', s.ticker,
      'promo', s.promo,
      'promo_text', coalesce(s.promo_text, st.promo_text),
      'extras', s.extras);

  -- dados prontos para os cartões (só o que esta tela usa e que não está velho)
  if (s.extras->>'enabled')::boolean then
    select jsonb_object_agg(c.id, c.data || jsonb_build_object('ok_at', c.ok_at)) into v_content
      from public.content_cache c
     where c.data is not null and c.ok_at > now() - interval '1 day'
       and ((c.id = 'clima' and s.extras->'items' ? 'clima')
         or (c.id = 'cotacao' and s.extras->'items' ? 'cotacao')
         or ((c.id like 'jogos:%' or c.id like 'tabela:%') and s.extras->'items' ? 'futebol'));
  end if;

  return jsonb_build_object(
    'screen', v_scr,
    'settings', jsonb_build_object('tz', st.timezone, 'promo_text', st.promo_text, 'company', st.company,
                                   'phone', st.phone, 'news_seconds', st.news_seconds,
                                   'promo_seconds', st.promo_seconds, 'promo_every', st.promo_every,
                                   'city', coalesce(st.content->>'city', 'Cuiabá')),
    'exceptions', v_exc,
    'news', (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'name', n.name, 'section', n.section) order by n.position), '[]'::jsonb)
               from public.news_sources n
              where n.enabled and n.id in (select jsonb_array_elements_text(s.ticker->'sources'))),
    'content', coalesce(v_content, '{}'::jsonb),
    'items', v_items,
    'prog', left(md5(v_items::text || v_scr::text || v_exc::text), 12),
    'server_time', now());
end $$;
revoke all on function public.sf_payload(public.screens, boolean) from public, anon, authenticated;

-- prévia do painel: recebe todos os dados prontos (para ver os cartões antes de salvar)
create or replace function public.sf_preview(p_screen text) returns json
language plpgsql stable security definer set search_path = public as $$
declare s public.screens;
begin
  if not public.sf_is_admin() then raise exception 'sem permissão'; end if;
  select * into s from public.screens where id = p_screen;
  if not found then raise exception 'tela não encontrada'; end if;
  return (public.sf_payload(s, true) || jsonb_build_object('content', coalesce((
            select jsonb_object_agg(c.id, c.data || jsonb_build_object('ok_at', c.ok_at))
              from public.content_cache c where c.data is not null and c.ok_at > now() - interval '1 day'), '{}'::jsonb)))::json;
end $$;
revoke all on function public.sf_preview(text) from public, anon;
grant execute on function public.sf_preview(text) to authenticated;

-- ---------------------------------------------------------------------
-- Segurança
-- ---------------------------------------------------------------------
alter table public.alert_settings enable row level security;
alter table public.alert_log      enable row level security;
alter table public.screen_shots   enable row level security;
alter table public.content_cache  enable row level security;

drop policy if exists "admin gerencia avisos" on public.alert_settings;
create policy "admin gerencia avisos" on public.alert_settings
  for all to authenticated using (public.sf_is_admin()) with check (public.sf_is_admin());
drop policy if exists "admin le avisos enviados" on public.alert_log;
create policy "admin le avisos enviados" on public.alert_log
  for select to authenticated using (public.sf_is_admin());
drop policy if exists "admin ve miniaturas" on public.screen_shots;
create policy "admin ve miniaturas" on public.screen_shots
  for select to authenticated using (public.sf_is_admin());
drop policy if exists "admin le conteudo" on public.content_cache;
create policy "admin le conteudo" on public.content_cache
  for select to authenticated using (public.sf_is_admin());
revoke all on public.alert_settings, public.alert_log, public.screen_shots, public.content_cache from anon;
revoke insert, update, delete on public.alert_log, public.screen_shots, public.content_cache from authenticated;

revoke all on function public.sf_notify(text, text, text, text) from public, anon, authenticated;
revoke all on function public.sf_alert_tick(timestamptz) from public, anon, authenticated;
revoke all on function public.sf_content_tick(boolean) from public, anon, authenticated;
revoke all on function public.sf_tick() from public, anon, authenticated;
revoke all on function public.sf_window(public.screens, date) from public, anon;
revoke all on function public.sf_open_since(public.screens, timestamptz) from public, anon;
revoke all on function public.sf_is_open(public.screens, timestamptz) from public, anon;
revoke all on function public.sf_alert_test() from public, anon;
grant execute on function public.sf_alert_test() to authenticated;
revoke all on function public.sf_alert_history(int) from public, anon;
grant execute on function public.sf_alert_history(int) to authenticated;
revoke all on function public.sf_content_status(boolean) from public, anon;
grant execute on function public.sf_content_status(boolean) to authenticated;

-- ---------------------------------------------------------------------
-- Agenda: sf_tick a cada minuto
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('startplay-tick', '* * * * *', 'select public.sf_tick()');
  end if;
end $$;

notify pgrst, 'reload schema';

select 'Atualização 05 aplicada' as resultado,
       (select count(*) from pg_extension where extname in ('pg_net', 'pg_cron')) as extensoes,
       (select count(*) from pg_namespace where nspname = 'cron') as agenda;
