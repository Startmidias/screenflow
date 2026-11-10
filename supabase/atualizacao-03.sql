-- =====================================================================
--  Start Play — atualização 03
--  Notícias na TV, horário de funcionamento, tela vertical, agenda dos
--  anúncios, clientes, financeiro, ajustes e prévia ao vivo no painel.
--  Rodar uma vez no SQL Editor (pode repetir sem problema).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Ajustes gerais (uma linha só)
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  id          smallint primary key default 1 check (id = 1),
  company     text not null default 'Start Play',
  phone       text not null default '(65) 99328-8233',
  email       text,
  doc         text,
  city        text default 'Cuiabá - MT',
  pix         text,
  promo_text  text not null default 'Anuncie aqui: (65) 99328-8233'
              check (char_length(promo_text) between 3 and 140),
  promo_every smallint not null default 4 check (promo_every between 1 and 20),
  timezone    text not null default 'America/Cuiaba',
  updated_at  timestamptz not null default now()
);
insert into public.settings(id) values (1) on conflict (id) do nothing;

create or replace function public.sf_settings_check() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'Fuso horário inválido: %', new.timezone;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists sf_settings_check on public.settings;
create trigger sf_settings_check before insert or update on public.settings
  for each row execute function public.sf_settings_check();

-- "hoje" no fuso configurado (a TV Box pode estar com o relógio errado)
create or replace function public.sf_today() returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone coalesce((select timezone from public.settings where id = 1), 'America/Cuiaba'))::date;
$$;

-- ---------------------------------------------------------------------
-- Fontes de notícias: lista fixa + cache compartilhado entre as telas
-- ---------------------------------------------------------------------
create table if not exists public.news_sources (
  id             text primary key check (id ~ '^[a-z0-9-]{2,30}$'),
  name           text not null,                 -- aparece na TV: "UOL • Título"
  section        text not null default 'Geral', -- categoria no painel
  url            text not null check (url ~ '^https://'),
  position       int  not null default 100,
  enabled        boolean not null default false,
  refresh_min    int  not null default 10 check (refresh_min between 5 and 180),
  skip_pattern   text,                          -- itens a ignorar (ex.: vídeos)
  note           text,
  validated_at   timestamptz,
  validation     jsonb,
  items          jsonb not null default '[]'::jsonb,  -- última coleta válida
  ok_at          timestamptz,                   -- quando foi a última coleta válida
  fetched_at     timestamptz,                   -- última tentativa
  fetching_until timestamptz,                   -- trava: uma coleta por vez
  last_error     text,
  last_ms        int,
  fails          int not null default 0
);

-- lista fixa (o painel só liga/desliga; endereços mudam só por atualização)
insert into public.news_sources(id, name, section, url, position, note) values
  ('uol',            'UOL',   'Geral',          'https://rss.uol.com.br/feed/noticias.xml', 10, null),
  ('g1',             'g1',    'Geral',          'https://g1.globo.com/rss/g1/', 20, null),
  ('folha',          'Folha', 'Em cima da hora','https://feeds.folha.uol.com.br/emcimadahora/rss091.xml', 30, null),
  ('r7',             'R7',    'Geral',          'https://www.r7.com/arc/outboundfeeds/rss/?outputType=xml', 40, 'Também traz vídeos e programas da Record.'),
  ('ge',             'ge',    'Esportes',       'https://ge.globo.com/rss/ge/', 50, null),
  ('folha-esporte',  'Folha', 'Esportes',       'https://feeds.folha.uol.com.br/esporte/rss091.xml', 55, null),
  ('g1-economia',    'g1',    'Economia',       'https://g1.globo.com/rss/g1/economia/', 60, null),
  ('folha-mercado',  'Folha', 'Economia',       'https://feeds.folha.uol.com.br/mercado/rss091.xml', 62, null),
  ('uol-economia',   'UOL',   'Economia',       'https://rss.uol.com.br/feed/economia.xml', 64, null),
  ('g1-mundo',       'g1',    'Mundo',          'https://g1.globo.com/rss/g1/mundo/', 70, null),
  ('folha-mundo',    'Folha', 'Mundo',          'https://feeds.folha.uol.com.br/mundo/rss091.xml', 72, null),
  ('g1-tecnologia',  'g1',    'Tecnologia',     'https://g1.globo.com/rss/g1/tecnologia/', 80, null),
  ('folha-tec',      'Folha', 'Tecnologia',     'https://feeds.folha.uol.com.br/tec/rss091.xml', 82, null),
  ('uol-tecnologia', 'UOL',   'Tecnologia',     'https://rss.uol.com.br/feed/tecnologia.xml', 84, null),
  ('g1-saude',       'g1',    'Saúde e ciência','https://g1.globo.com/rss/g1/ciencia-e-saude/', 90, null),
  ('g1-pop',         'g1',    'Entretenimento', 'https://g1.globo.com/rss/g1/pop-arte/', 95, null),
  ('g1-mt',          'g1',    'Mato Grosso',    'https://g1.globo.com/rss/g1/mt/mato-grosso/', 100, null)
on conflict (id) do update
  set name = excluded.name, section = excluded.section, url = excluded.url,
      position = excluded.position, note = excluded.note;

-- filtros da lista fixa (conferidos na validação de 10/11/2026):
-- g1/ge trazem "especial publicitário" (anúncio de outras empresas);
-- o R7 traz itens de controle do próprio site, além de vídeos e programas.
update public.news_sources set skip_pattern = '/especial-publicitario/'
 where id in ('g1','ge','g1-economia','g1-mundo','g1-tecnologia','g1-saude','g1-pop','g1-mt');
update public.news_sources
   set skip_pattern = '/validacao/|^(última atualização|ultima atualizacao|validação)|^\d{1,2} [a-z]+ \d{4}$'
 where id = 'r7';

-- só habilita fonte que passou na validação
create or replace function public.sf_news_guard() returns trigger
language plpgsql as $$
begin
  if new.enabled and not old.enabled and coalesce(new.validation->>'ok', 'false') <> 'true' then
    raise exception 'Valide a fonte "%" antes de habilitar.', new.name || ' · ' || new.section;
  end if;
  return new;
end $$;
drop trigger if exists sf_news_guard on public.news_sources;
create trigger sf_news_guard before update on public.news_sources
  for each row execute function public.sf_news_guard();

-- ---------------------------------------------------------------------
-- Telas: orientação, horário de funcionamento, faixa de notícias, "Anuncie aqui"
-- ---------------------------------------------------------------------
alter table public.screens add column if not exists orientation text not null default 'landscape';
alter table public.screens add column if not exists hours_on    boolean not null default false;
alter table public.screens add column if not exists open_at     time not null default '08:00';
alter table public.screens add column if not exists close_at    time not null default '22:00';
alter table public.screens add column if not exists open_days   smallint[] not null default '{0,1,2,3,4,5,6}';
-- a faixa começa DESLIGADA em todas as telas (inclusive as já cadastradas)
alter table public.screens add column if not exists ticker      jsonb not null
  default '{"enabled": false, "sources": ["uol"], "speed": 3}'::jsonb;
alter table public.screens add column if not exists promo       boolean not null default true;

alter table public.screens drop constraint if exists screens_orientation_chk;
alter table public.screens add  constraint screens_orientation_chk
  check (orientation in ('landscape', 'portrait', 'portrait_ccw'));
alter table public.screens drop constraint if exists screens_days_chk;
alter table public.screens add  constraint screens_days_chk
  check (open_days <@ array[0,1,2,3,4,5,6]::smallint[] and cardinality(open_days) >= 1);
alter table public.screens drop constraint if exists screens_hours_chk;
alter table public.screens add  constraint screens_hours_chk check (open_at <> close_at);

-- deixa a configuração da faixa sempre num formato que a TV entende
create or replace function public.sf_screens_check() returns trigger
language plpgsql as $$
declare
  t   jsonb := coalesce(new.ticker, '{}'::jsonb);
  src jsonb;
begin
  if jsonb_typeof(t) <> 'object' then t := '{}'::jsonb; end if;
  src := case when jsonb_typeof(t->'sources') = 'array' then t->'sources' else '["uol"]'::jsonb end;
  select coalesce(jsonb_agg(x order by x), '[]'::jsonb) into src
  from (select distinct value #>> '{}' as x
        from jsonb_array_elements(src)
        where jsonb_typeof(value) = 'string' and (value #>> '{}') ~ '^[a-z0-9-]{2,30}$'
        limit 30) q;
  new.ticker := jsonb_build_object(
    'enabled', coalesce(t->'enabled' = 'true'::jsonb, false),
    'sources', src,
    'speed',   case when (t->>'speed') ~ '^[1-5]$' then (t->>'speed')::int else 3 end);
  return new;
end $$;
drop trigger if exists sf_screens_check on public.screens;
create trigger sf_screens_check before insert or update of ticker on public.screens
  for each row execute function public.sf_screens_check();

-- ---------------------------------------------------------------------
-- Clientes e financeiro
-- ---------------------------------------------------------------------
create table if not exists public.clients (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(name) between 1 and 120),
  contact         text,
  phone           text,
  email           text,
  doc             text,
  address         text,
  ads_qty         int not null default 1  check (ads_qty between 0 and 100),
  ad_seconds      int not null default 15 check (ad_seconds between 3 and 600),
  screens_qty     int check (screens_qty is null or screens_qty between 1 and 1000),
  monthly_value   numeric(12,2) not null default 0 check (monthly_value >= 0),
  start_date      date not null default current_date,
  contract_months int not null default 1  check (contract_months between 1 and 120),
  due_day         smallint not null default 10 check (due_day between 1 and 28),
  pay_method      text,
  notes           text,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

create table if not exists public.payments (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  ref_month   date not null,
  due_date    date not null,
  amount      numeric(12,2) not null check (amount >= 0),
  paid_at     date,
  paid_amount numeric(12,2) check (paid_amount is null or paid_amount >= 0),
  method      text,
  note        text,
  created_at  timestamptz not null default now(),
  unique (client_id, ref_month)
);
create index if not exists payments_due_idx    on public.payments(due_date);
create index if not exists payments_client_idx on public.payments(client_id);

-- gera (ou refaz) as parcelas de um cliente a partir do contrato.
-- Parcelas pagas e parcelas vencidas em aberto ficam como estão.
create or replace function public.sf_client_schedule(p_client uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  c public.clients;
  d date;
  v_today date := public.sf_today();
  n int := 0;
begin
  if not public.sf_is_admin() then raise exception 'sem permissão'; end if;
  select * into c from public.clients where id = p_client;
  if not found then raise exception 'cliente não encontrado'; end if;

  delete from public.payments where client_id = c.id and paid_at is null and due_date >= v_today;
  if not c.active then return 0; end if;

  d := make_date(extract(year from c.start_date)::int, extract(month from c.start_date)::int, c.due_day);
  if d < c.start_date then d := (d + interval '1 month')::date; end if;
  for i in 0 .. c.contract_months - 1 loop
    insert into public.payments(client_id, ref_month, due_date, amount)
    values (c.id, date_trunc('month', d + make_interval(months => i))::date,
            (d + make_interval(months => i))::date, c.monthly_value)
    on conflict (client_id, ref_month) do nothing;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Anúncios: dias da semana, horário e cliente
-- ---------------------------------------------------------------------
alter table public.media add column if not exists days      smallint[];   -- vazio = todos os dias
alter table public.media add column if not exists time_from time;         -- vazio = o dia todo
alter table public.media add column if not exists time_to   time;
alter table public.media add column if not exists client_id uuid references public.clients(id) on delete set null;
create index if not exists media_client_idx on public.media(client_id);

alter table public.media drop constraint if exists media_days_chk;
alter table public.media add  constraint media_days_chk
  check (days is null or (days <@ array[0,1,2,3,4,5,6]::smallint[] and cardinality(days) between 1 and 7));
alter table public.media drop constraint if exists media_time_chk;
alter table public.media add  constraint media_time_chk
  check ((time_from is null) = (time_to is null) and (time_from is null or time_from <> time_to));

-- ---------------------------------------------------------------------
-- Segurança das tabelas novas
-- ---------------------------------------------------------------------
alter table public.settings     enable row level security;
alter table public.news_sources enable row level security;
alter table public.clients      enable row level security;
alter table public.payments     enable row level security;

drop policy if exists "admin le ajustes" on public.settings;
create policy "admin le ajustes" on public.settings
  for select to authenticated using (public.sf_is_admin());
drop policy if exists "admin altera ajustes" on public.settings;
create policy "admin altera ajustes" on public.settings
  for update to authenticated using (public.sf_is_admin()) with check (public.sf_is_admin());

drop policy if exists "admin le fontes" on public.news_sources;
create policy "admin le fontes" on public.news_sources
  for select to authenticated using (public.sf_is_admin());
drop policy if exists "admin liga fontes" on public.news_sources;
create policy "admin liga fontes" on public.news_sources
  for update to authenticated using (public.sf_is_admin()) with check (public.sf_is_admin());
-- o painel só consegue mudar "ligada/desligada"; o endereço é fixo
revoke insert, update, delete on public.news_sources from anon, authenticated;
grant select on public.news_sources to authenticated;
grant update (enabled) on public.news_sources to authenticated;
revoke all on public.news_sources from anon;
revoke all on public.settings from anon;
revoke insert, delete on public.settings from authenticated;

drop policy if exists "admin gerencia clientes" on public.clients;
create policy "admin gerencia clientes" on public.clients
  for all to authenticated using (public.sf_is_admin()) with check (public.sf_is_admin());
drop policy if exists "admin gerencia parcelas" on public.payments;
create policy "admin gerencia parcelas" on public.payments
  for all to authenticated using (public.sf_is_admin()) with check (public.sf_is_admin());
revoke all on public.clients, public.payments from anon;

-- ---------------------------------------------------------------------
-- O que a TV recebe (usado pela TV e pela prévia do painel)
-- ---------------------------------------------------------------------
create or replace function public.sf_payload(s public.screens) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'screen', jsonb_build_object(
      'id', s.id, 'name', s.name, 'added', s.name <> 'Nova tela',
      'orientation', s.orientation,
      'hours', jsonb_build_object('on', s.hours_on, 'open', to_char(s.open_at, 'HH24:MI'),
                                  'close', to_char(s.close_at, 'HH24:MI'), 'days', to_jsonb(s.open_days)),
      'ticker', s.ticker,
      'promo', s.promo),
    'settings', (select jsonb_build_object('tz', st.timezone, 'promo_text', st.promo_text,
                                           'promo_every', st.promo_every, 'company', st.company,
                                           'phone', st.phone)
                 from public.settings st where st.id = 1),
    'news', (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'name', n.name) order by n.position), '[]'::jsonb)
             from public.news_sources n
             where n.enabled and n.id in (select jsonb_array_elements_text(s.ticker->'sources'))),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'title', m.title, 'kind', m.kind, 'url', m.url, 'duration', m.duration_sec,
               'days', to_jsonb(m.days), 'from', to_char(m.time_from, 'HH24:MI'), 'to', to_char(m.time_to, 'HH24:MI'))
             order by m.position, m.created_at)
      from public.media m
      where m.active
        and (m.starts_on is null or m.starts_on <= public.sf_today())
        and (m.ends_on   is null or m.ends_on   >= public.sf_today())
        and (m.screen_ids is null or cardinality(m.screen_ids) = 0 or s.id = any(m.screen_ids))
    ), '[]'::jsonb),
    'server_time', now());
$$;
revoke all on function public.sf_payload(public.screens) from public, anon, authenticated;

create or replace function public.sf_sync(p_screen text, p_today date,
                                          p_info jsonb default '{}'::jsonb,
                                          p_status jsonb default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  s public.screens;
  v_cmd text;
begin
  if p_screen is null or char_length(p_screen) < 8 or char_length(p_screen) > 64 then
    raise exception 'tela inválida';
  end if;
  if p_info is not null and pg_column_size(p_info) > 4000 then p_info := '{}'::jsonb; end if;
  if p_status is not null and pg_column_size(p_status) > 4000 then p_status := null; end if;

  -- robôs de busca que abrem o endereço do player não viram "tela"
  if coalesce(p_info->>'ua', '') ~* '(bot|crawler|spider|preview|headless)' then
    return json_build_object('screen', json_build_object('id', p_screen, 'name', 'Robô'),
                             'items', '[]'::json, 'server_time', now());
  end if;

  insert into public.screens(id, info, last_seen, status, status_at)
  values (p_screen, coalesce(p_info, '{}'::jsonb), now(), coalesce(p_status, '{}'::jsonb),
          case when p_status is null then null else now() end)
  on conflict (id) do update
    set last_seen = now(),
        info      = case when excluded.info = '{}'::jsonb then public.screens.info else excluded.info end,
        status    = coalesce(p_status, public.screens.status),
        status_at = case when p_status is null then public.screens.status_at else now() end
  returning * into s;

  v_cmd := s.command;
  if v_cmd is not null then
    update public.screens set command = null where id = s.id;
  end if;

  return (public.sf_payload(s) || jsonb_build_object('command', v_cmd))::json;
end $$;
revoke all on function public.sf_sync(text, date, jsonb, jsonb) from public;
grant execute on function public.sf_sync(text, date, jsonb, jsonb) to anon, authenticated;

-- prévia do painel: mesma resposta da TV, sem registrar nada (só admin)
create or replace function public.sf_preview(p_screen text) returns json
language plpgsql stable security definer set search_path = public as $$
declare s public.screens;
begin
  if not public.sf_is_admin() then raise exception 'sem permissão'; end if;
  select * into s from public.screens where id = p_screen;
  if not found then raise exception 'tela não encontrada'; end if;
  return public.sf_payload(s)::json;
end $$;
revoke all on function public.sf_preview(text) from public, anon;
grant execute on function public.sf_preview(text) to authenticated;

-- ---------------------------------------------------------------------
-- Relatórios
-- ---------------------------------------------------------------------
drop function if exists public.sf_report(timestamptz, timestamptz);
create function public.sf_report(p_from timestamptz, p_to timestamptz)
returns table(media_id uuid, title text, advertiser text, client_id uuid,
              screen_id text, screen_name text, screen_location text,
              plays bigint, seconds bigint, first_at timestamptz, last_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, m.title, m.advertiser, m.client_id, s.id, s.name, s.location,
         count(*), coalesce(sum(p.seconds), 0), min(p.played_at), max(p.played_at)
  from public.plays p
  join public.media m   on m.id = p.media_id
  join public.screens s on s.id = p.screen_id
  where public.sf_is_admin()
    and p.played_at >= p_from and p.played_at < p_to
  group by m.id, m.title, m.advertiser, m.client_id, s.id, s.name, s.location
  order by m.title, s.name;
$$;
revoke all on function public.sf_report(timestamptz, timestamptz) from public, anon;
grant execute on function public.sf_report(timestamptz, timestamptz) to authenticated;

-- exibições por dia (no fuso configurado), opcionalmente só de alguns anúncios
create or replace function public.sf_plays_daily(p_from timestamptz, p_to timestamptz, p_media uuid[] default null)
returns table(day date, plays bigint, seconds bigint)
language sql stable security definer set search_path = public as $$
  select (p.played_at at time zone coalesce((select timezone from public.settings where id = 1), 'America/Cuiaba'))::date,
         count(*), coalesce(sum(p.seconds), 0)
  from public.plays p
  where public.sf_is_admin()
    and p.played_at >= p_from and p.played_at < p_to
    and (p_media is null or p.media_id = any(p_media))
  group by 1 order by 1;
$$;
revoke all on function public.sf_plays_daily(timestamptz, timestamptz, uuid[]) from public, anon;
grant execute on function public.sf_plays_daily(timestamptz, timestamptz, uuid[]) to authenticated;

revoke all on function public.sf_client_schedule(uuid) from public, anon;
grant execute on function public.sf_client_schedule(uuid) to authenticated;
revoke all on function public.sf_today() from public;
grant execute on function public.sf_today() to anon, authenticated;

-- ---------------------------------------------------------------------
-- Coletor de notícias (Edge Function "noticias", com a chave de serviço)
-- ---------------------------------------------------------------------
-- reserva as fontes que precisam ser atualizadas (uma coleta por vez,
-- mesmo com muitas TVs pedindo ao mesmo tempo)
create or replace function public.sf_news_claim(p_ids text[], p_force boolean default false)
returns setof public.news_sources
language sql security definer set search_path = public as $$
  update public.news_sources
     set fetching_until = now() + interval '40 seconds'
   where id = any(p_ids)
     and (p_force or enabled)
     and (p_force or fetched_at is null or fetched_at < now() - make_interval(mins => refresh_min))
     and (fetching_until is null or fetching_until < now())
  returning *;
$$;

create or replace function public.sf_news_store(p_id text, p_ok boolean, p_items jsonb,
                                                p_error text default null, p_ms int default null)
returns void
language sql security definer set search_path = public as $$
  update public.news_sources
     set fetched_at     = now(),
         fetching_until = null,
         last_ms        = p_ms,
         items          = case when p_ok then coalesce(p_items, '[]'::jsonb) else items end,
         ok_at          = case when p_ok then now() else ok_at end,
         last_error     = case when p_ok then null else left(p_error, 300) end,
         fails          = case when p_ok then 0 else fails + 1 end
   where id = p_id;
$$;

create or replace function public.sf_news_validation(p_id text, p_result jsonb)
returns void
language sql security definer set search_path = public as $$
  update public.news_sources set validated_at = now(), validation = p_result where id = p_id;
$$;

revoke all on function public.sf_news_claim(text[], boolean)              from public, anon, authenticated;
revoke all on function public.sf_news_store(text, boolean, jsonb, text, int) from public, anon, authenticated;
revoke all on function public.sf_news_validation(text, jsonb)             from public, anon, authenticated;
grant execute on function public.sf_news_claim(text[], boolean)              to service_role;
grant execute on function public.sf_news_store(text, boolean, jsonb, text, int) to service_role;
grant execute on function public.sf_news_validation(text, jsonb)             to service_role;
grant select on public.news_sources to service_role;

notify pgrst, 'reload schema';

select 'Atualização 03 aplicada' as resultado;
