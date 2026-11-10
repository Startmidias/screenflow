-- =====================================================================
--  START PLAY — atualização 04 (segunda etapa)
--  Monitoramento das TVs, feriados e exceções, comprovante de exibição
--  (concluída / interrompida / falha, sem duplicar registros offline),
--  pagamentos parciais, versões dos anúncios, editorias e chamada comercial
--  por tela. Rodar uma vez no SQL Editor depois da 03 (pode repetir).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Ajustes: chamada comercial, tempos do rodapé e capacidade do ciclo
-- ---------------------------------------------------------------------
alter table public.settings add column if not exists news_seconds  smallint not null default 40;
alter table public.settings add column if not exists promo_seconds smallint not null default 10;
alter table public.settings add column if not exists loop_max      smallint not null default 300;
alter table public.settings drop constraint if exists settings_band_chk;
alter table public.settings add  constraint settings_band_chk
  check (news_seconds between 10 and 600 and promo_seconds between 4 and 60 and loop_max between 30 and 3600);
alter table public.settings alter column promo_text set default 'Anuncie aqui com a START PLAY • WhatsApp (65) 99328-8233';
alter table public.settings alter column company set default 'START PLAY';
update public.settings set promo_text = 'Anuncie aqui com a START PLAY • WhatsApp (65) 99328-8233'
 where promo_text = 'Anuncie aqui: (65) 99328-8233';
update public.settings set company = 'START PLAY' where company = 'Start Play';

-- ---------------------------------------------------------------------
-- Telas: chamada comercial própria e a programação mais recente enviada
-- (a "unidade" usa a coluna location: "Loja Centro · Recepção")
-- ---------------------------------------------------------------------
alter table public.screens add column if not exists promo_text  text;
alter table public.screens add column if not exists prog_latest text;
alter table public.screens drop constraint if exists screens_promo_text_chk;
alter table public.screens add  constraint screens_promo_text_chk
  check (promo_text is null or char_length(promo_text) between 3 and 140);

-- ---------------------------------------------------------------------
-- Feriados e exceções por data (tela específica ou todas)
-- ---------------------------------------------------------------------
create table if not exists public.schedule_exceptions (
  id         uuid primary key default gen_random_uuid(),
  day        date not null,
  screen_id  text references public.screens(id) on delete cascade,   -- vazio = todas as telas
  closed     boolean not null default true,                          -- feriado / não abre
  open_at    time,
  close_at   time,
  note       text,
  created_at timestamptz not null default now(),
  check (closed or (open_at is not null and close_at is not null and open_at <> close_at))
);
create index if not exists schedule_exceptions_day_idx on public.schedule_exceptions(day);
create unique index if not exists schedule_exceptions_uidx
  on public.schedule_exceptions(day, coalesce(screen_id, ''));

-- ---------------------------------------------------------------------
-- Histórico de conexão das TVs
-- ---------------------------------------------------------------------
create table if not exists public.screen_events (
  id        bigint generated always as identity primary key,
  screen_id text not null references public.screens(id) on delete cascade,
  at        timestamptz not null default now(),
  kind      text not null check (kind in ('back', 'boot', 'version', 'error', 'program')),
  since     timestamptz,           -- "back": desde quando estava sem contato
  detail    text
);
create index if not exists screen_events_idx on public.screen_events(screen_id, at desc);

-- ---------------------------------------------------------------------
-- Clientes: inserções contratadas; anúncios: inserções desejadas
-- ---------------------------------------------------------------------
alter table public.clients add column if not exists daily_insertions int;
alter table public.clients drop constraint if exists clients_daily_chk;
alter table public.clients add  constraint clients_daily_chk check (daily_insertions is null or daily_insertions between 1 and 5000);
alter table public.media add column if not exists target_daily int;
alter table public.media drop constraint if exists media_target_chk;
alter table public.media add  constraint media_target_chk check (target_daily is null or target_daily between 1 and 5000);

-- ---------------------------------------------------------------------
-- Comprovante de exibição: o que o player realmente reproduziu
-- ---------------------------------------------------------------------
alter table public.plays add column if not exists event_id        uuid;
alter table public.plays add column if not exists status          text not null default 'ok';
alter table public.plays add column if not exists planned_seconds int;
alter table public.plays add column if not exists client_id       uuid references public.clients(id) on delete set null;
alter table public.plays add column if not exists media_title     text;
alter table public.plays add column if not exists advertiser      text;
alter table public.plays add column if not exists detail          text;
alter table public.plays add column if not exists offline         boolean not null default false;
alter table public.plays add column if not exists received_at     timestamptz not null default now();
alter table public.plays drop constraint if exists plays_status_chk;
alter table public.plays add  constraint plays_status_chk check (status in ('ok', 'interrupted', 'failed'));
create unique index if not exists plays_event_uidx on public.plays(event_id);
create index if not exists plays_client_idx on public.plays(client_id, played_at);

-- o comprovante continua existindo mesmo se o anúncio for apagado depois
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.plays'::regclass and contype = 'f'
     and conkey = array[(select attnum from pg_attribute where attrelid = 'public.plays'::regclass and attname = 'media_id')];
  if c is not null and (select confdeltype from pg_constraint where conname = c and conrelid = 'public.plays'::regclass) <> 'n' then
    execute format('alter table public.plays drop constraint %I', c);
    alter table public.plays add constraint plays_media_id_fkey foreign key (media_id) references public.media(id) on delete set null;
  end if;
end $$;
alter table public.plays alter column media_id drop not null;

-- guarda título, anunciante e cliente do anúncio no momento da exibição
create or replace function public.sf_plays_fill() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.media_id is not null and (new.media_title is null or new.client_id is null or new.advertiser is null) then
    select coalesce(new.media_title, m.title), coalesce(new.advertiser, m.advertiser), coalesce(new.client_id, m.client_id)
      into new.media_title, new.advertiser, new.client_id
      from public.media m where m.id = new.media_id;
  end if;
  return new;
end $$;
drop trigger if exists sf_plays_fill on public.plays;
create trigger sf_plays_fill before insert on public.plays for each row execute function public.sf_plays_fill();

update public.plays p set media_title = m.title, advertiser = m.advertiser, client_id = m.client_id
  from public.media m where m.id = p.media_id and p.media_title is null;

-- ---------------------------------------------------------------------
-- Recebimentos (permite pagamento parcial; a parcela soma os recebimentos)
-- ---------------------------------------------------------------------
create table if not exists public.receipts (
  id         uuid primary key default gen_random_uuid(),
  payment_id uuid references public.payments(id) on delete set null,
  client_id  uuid not null references public.clients(id) on delete cascade,
  paid_on    date not null default current_date,
  amount     numeric(12,2) not null check (amount > 0),
  method     text,
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists receipts_payment_idx on public.receipts(payment_id);
create index if not exists receipts_client_idx  on public.receipts(client_id, paid_on);

create or replace function public.sf_receipts_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  foreach pid in array array[case when tg_op <> 'INSERT' then old.payment_id end,
                             case when tg_op <> 'DELETE' then new.payment_id end] loop
    if pid is not null then
      update public.payments p
         set paid_amount = nullif(x.total, 0),
             paid_at     = case when x.total > 0 and x.total >= p.amount then x.last else null end
        from (select coalesce(sum(amount), 0) as total, max(paid_on) as last
                from public.receipts where payment_id = pid) x
       where p.id = pid;
    end if;
  end loop;
  return null;
end $$;
drop trigger if exists sf_receipts_sync on public.receipts;
create trigger sf_receipts_sync after insert or update or delete on public.receipts
  for each row execute function public.sf_receipts_sync();

-- parcelas pagas antes desta atualização viram recebimentos
insert into public.receipts(payment_id, client_id, paid_on, amount, method)
select p.id, p.client_id, p.paid_at, coalesce(p.paid_amount, p.amount), p.method
  from public.payments p
 where p.paid_at is not null and coalesce(p.paid_amount, p.amount) > 0
   and not exists (select 1 from public.receipts r where r.payment_id = p.id);

-- refazer parcelas não apaga parcela que já recebeu algum valor
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

  delete from public.payments
   where client_id = c.id and paid_at is null and coalesce(paid_amount, 0) = 0 and due_date >= v_today;
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
-- Versões dos anúncios (permite restaurar a última versão publicada)
-- ---------------------------------------------------------------------
create table if not exists public.media_versions (
  id       bigint generated always as identity primary key,
  media_id uuid not null references public.media(id) on delete cascade,
  saved_at timestamptz not null default now(),
  data     jsonb not null
);
create index if not exists media_versions_idx on public.media_versions(media_id, saved_at desc);

create or replace function public.sf_media_version() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (to_jsonb(old) - 'position') is distinct from (to_jsonb(new) - 'position') then
    insert into public.media_versions(media_id, data) values (old.id, to_jsonb(old));
    delete from public.media_versions
     where media_id = old.id
       and id not in (select id from public.media_versions where media_id = old.id order by saved_at desc, id desc limit 20);
  end if;
  return null;
end $$;
drop trigger if exists sf_media_version on public.media;
create trigger sf_media_version after update on public.media
  for each row execute function public.sf_media_version();

-- ---------------------------------------------------------------------
-- Editorias de notícias (feeds que os portais realmente oferecem)
-- ---------------------------------------------------------------------
insert into public.news_sources(id, name, section, url, position, note, skip_pattern) values
  ('g1-brasil',       'g1',    'Brasil', 'https://g1.globo.com/rss/g1/brasil/', 32, null, '/especial-publicitario/'),
  ('folha-cotidiano', 'Folha', 'Brasil', 'https://feeds.folha.uol.com.br/cotidiano/rss091.xml', 34, 'Cotidiano', null),
  ('folha-poder',     'Folha', 'Brasil', 'https://feeds.folha.uol.com.br/poder/rss091.xml', 36, 'Política', null)
on conflict (id) do update set name = excluded.name, section = excluded.section, url = excluded.url,
  position = excluded.position, note = excluded.note, skip_pattern = excluded.skip_pattern;
update public.news_sources set section = 'Últimas notícias' where id in ('uol', 'g1', 'folha', 'r7');
update public.news_sources set note = 'Em cima da hora' where id = 'folha';

-- ---------------------------------------------------------------------
-- O que a TV recebe
-- ---------------------------------------------------------------------
drop function if exists public.sf_payload(public.screens);
create or replace function public.sf_payload(s public.screens, p_ahead boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := public.sf_today();
  st public.settings;
  v_items jsonb;
  v_scr jsonb;
  v_exc jsonb;
begin
  select * into st from public.settings where id = 1;
  -- com p_ahead a TV também recebe anúncios que começam nos próximos 7 dias
  -- (baixa antes e respeita a vigência sozinha se a internet cair)
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id, 'title', m.title, 'kind', m.kind, 'url', m.url, 'duration', m.duration_sec,
           'days', to_jsonb(m.days), 'from', to_char(m.time_from, 'HH24:MI'), 'to', to_char(m.time_to, 'HH24:MI'),
           'starts_on', m.starts_on, 'ends_on', m.ends_on)
         order by m.position, m.created_at), '[]'::jsonb)
    into v_items
    from public.media m
   where m.active
     and s.name <> 'Nova tela'          -- TV ainda não pareada só mostra o código de pareamento
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
      'promo_text', coalesce(s.promo_text, st.promo_text));

  return jsonb_build_object(
    'screen', v_scr,
    'settings', jsonb_build_object('tz', st.timezone, 'promo_text', st.promo_text, 'company', st.company,
                                   'phone', st.phone, 'news_seconds', st.news_seconds,
                                   'promo_seconds', st.promo_seconds, 'promo_every', st.promo_every),
    'exceptions', v_exc,
    'news', (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'name', n.name, 'section', n.section) order by n.position), '[]'::jsonb)
               from public.news_sources n
              where n.enabled and n.id in (select jsonb_array_elements_text(s.ticker->'sources'))),
    'items', v_items,
    'prog', left(md5(v_items::text || v_scr::text || v_exc::text), 12),
    'server_time', now());
end $$;
revoke all on function public.sf_payload(public.screens, boolean) from public, anon, authenticated;

create or replace function public.sf_sync(p_screen text, p_today date,
                                          p_info jsonb default '{}'::jsonb,
                                          p_status jsonb default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  s    public.screens;
  prev public.screens;
  v_cmd text;
  v_out jsonb;
  v_new boolean;
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

  select * into prev from public.screens where id = p_screen;

  insert into public.screens(id, info, last_seen, status, status_at)
  values (p_screen, coalesce(p_info, '{}'::jsonb), now(), coalesce(p_status, '{}'::jsonb),
          case when p_status is null then null else now() end)
  on conflict (id) do update
    set last_seen = now(),
        info      = case when excluded.info = '{}'::jsonb then public.screens.info else excluded.info end,
        status    = coalesce(p_status, public.screens.status),
        status_at = case when p_status is null then public.screens.status_at else now() end
  returning * into s;

  -- histórico de conexão
  if prev.id is not null and s.name <> 'Nova tela' then
    if prev.last_seen < now() - interval '3 minutes' then
      insert into public.screen_events(screen_id, kind, since, detail)
      values (s.id, 'back', prev.last_seen, 'voltou a se conectar');
    end if;
    if p_status is not null then
      if coalesce(prev.status->>'v', '') <> '' and (p_status->>'v') is distinct from (prev.status->>'v') then
        insert into public.screen_events(screen_id, kind, detail)
        values (s.id, 'version', (prev.status->>'v') || ' → ' || coalesce(p_status->>'v', '?'));
      elsif (p_status->>'boots') ~ '^\d{1,9}$' and (prev.status->>'boots') ~ '^\d{1,9}$'
            and (p_status->>'boots')::int > (prev.status->>'boots')::int then
        insert into public.screen_events(screen_id, kind, detail) values (s.id, 'boot', 'player reiniciou');
      end if;
      if coalesce(p_status->>'lastErrAt', '') <> '' and (p_status->>'lastErrAt') is distinct from (prev.status->>'lastErrAt') then
        insert into public.screen_events(screen_id, kind, detail) values (s.id, 'error', left(p_status->>'lastErr', 240));
      end if;
      if coalesce(p_status->>'prog', '') <> '' and (p_status->>'prog') is distinct from (prev.status->>'prog') then
        insert into public.screen_events(screen_id, kind, detail) values (s.id, 'program', 'programação ' || (p_status->>'prog') || ' em uso');
      end if;
    end if;
    if random() < 0.02 then
      delete from public.screen_events where at < now() - interval '90 days';
    end if;
  end if;

  v_cmd := s.command;
  v_new := coalesce(p_status->>'v', '') ~ '^([3-9]|[1-9][0-9])\.';
  v_out := public.sf_payload(s, v_new);
  update public.screens
     set command = null, prog_latest = v_out->>'prog'
   where id = s.id and (command is not null or prog_latest is distinct from v_out->>'prog');

  return (v_out || jsonb_build_object('command', v_cmd))::json;
end $$;
revoke all on function public.sf_sync(text, date, jsonb, jsonb) from public;
grant execute on function public.sf_sync(text, date, jsonb, jsonb) to anon, authenticated;

create or replace function public.sf_preview(p_screen text) returns json
language plpgsql stable security definer set search_path = public as $$
declare s public.screens;
begin
  if not public.sf_is_admin() then raise exception 'sem permissão'; end if;
  select * into s from public.screens where id = p_screen;
  if not found then raise exception 'tela não encontrada'; end if;
  return public.sf_payload(s, true)::json;
end $$;
revoke all on function public.sf_preview(text) from public, anon;
grant execute on function public.sf_preview(text) to authenticated;

-- A TV envia o que reproduziu (também os registros feitos sem internet).
-- Cada registro tem um id gerado na TV: reenviar não conta duas vezes.
create or replace function public.sf_log_batch(p_screen text, p_events jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not exists (select 1 from public.screens where id = p_screen) then return 0; end if;
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 500 then
    raise exception 'lote inválido';
  end if;
  -- primeiro filtra o que tem formato válido; só depois converte (materialized garante a ordem)
  with raw as materialized (
    select e
      from jsonb_array_elements(p_events) e
     where jsonb_typeof(e) = 'object'
       and (e->>'id')    ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and (e->>'media') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and (e->>'at')    ~  '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$'
       and coalesce(e->>'sec', '0') ~ '^\d{1,6}$'
  ), ev as (
    select (e->>'id')::uuid as event_id,
           (e->>'media')::uuid as media_id,
           least(coalesce((e->>'sec')::int, 0), 3600) as secs,
           case when (e->>'plan') ~ '^\d{1,5}$' then (e->>'plan')::int end as planned,
           case when e->>'st' in ('ok', 'interrupted', 'failed') then e->>'st' else 'ok' end as st,
           least((e->>'at')::timestamptz, now()) as at,
           left(e->>'why', 200) as why,
           coalesce(e->>'off', '') = 'true' as off
      from raw
  ), ins as (
    insert into public.plays(event_id, screen_id, media_id, played_at, seconds, planned_seconds, status, detail, offline)
    select ev.event_id, p_screen, m.id, ev.at, ev.secs, ev.planned, ev.st, ev.why, ev.off
      from ev join public.media m on m.id = ev.media_id
     where ev.at > now() - interval '35 days'
    on conflict (event_id) do nothing
    returning 1)
  select count(*) into n from ins;
  return n;
end $$;
revoke all on function public.sf_log_batch(text, jsonb) from public;
grant execute on function public.sf_log_batch(text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Relatórios (só admin)
-- ---------------------------------------------------------------------
drop function if exists public.sf_report(timestamptz, timestamptz);
drop function if exists public.sf_report(timestamptz, timestamptz, uuid, text, uuid);
create function public.sf_report(p_from timestamptz, p_to timestamptz, p_client uuid default null,
                                 p_screen text default null, p_media uuid default null)
returns table(media_id uuid, title text, advertiser text, client_id uuid,
              screen_id text, screen_name text, screen_location text,
              plays bigint, seconds bigint, interrupted bigint, failed bigint, offline bigint,
              first_at timestamptz, last_at timestamptz)
language sql stable security definer set search_path = public as $$
  select x.media_id, max(x.title), max(x.advertiser), (array_agg(x.client_id) filter (where x.client_id is not null))[1],
         x.screen_id, max(x.screen_name), max(x.screen_location),
         count(*) filter (where x.status = 'ok'),
         coalesce(sum(x.seconds) filter (where x.status = 'ok'), 0),
         count(*) filter (where x.status = 'interrupted'),
         count(*) filter (where x.status = 'failed'),
         count(*) filter (where x.offline),
         min(x.played_at), max(x.played_at)
    from (select p.media_id, coalesce(m.title, p.media_title, '(anúncio apagado)') as title,
                 coalesce(m.advertiser, p.advertiser) as advertiser, coalesce(p.client_id, m.client_id) as client_id,
                 s.id as screen_id, s.name as screen_name, s.location as screen_location,
                 p.status, p.seconds, p.offline, p.played_at
            from public.plays p
            left join public.media m on m.id = p.media_id
            join public.screens s on s.id = p.screen_id
           where public.sf_is_admin()
             and p.played_at >= p_from and p.played_at < p_to
             and (p_client is null or coalesce(p.client_id, m.client_id) = p_client)
             and (p_screen is null or p.screen_id = p_screen)
             and (p_media  is null or p.media_id = p_media)) x
   group by x.media_id, x.title, x.screen_id
   order by max(x.title), max(x.screen_name);
$$;
revoke all on function public.sf_report(timestamptz, timestamptz, uuid, text, uuid) from public, anon;
grant execute on function public.sf_report(timestamptz, timestamptz, uuid, text, uuid) to authenticated;

drop function if exists public.sf_plays_daily(timestamptz, timestamptz, uuid[]);
create or replace function public.sf_plays_daily(p_from timestamptz, p_to timestamptz, p_client uuid default null,
                                                 p_screen text default null, p_media uuid default null)
returns table(day date, plays bigint, seconds bigint, interrupted bigint, failed bigint)
language sql stable security definer set search_path = public as $$
  select (p.played_at at time zone coalesce((select timezone from public.settings where id = 1), 'America/Cuiaba'))::date,
         count(*) filter (where p.status = 'ok'),
         coalesce(sum(p.seconds) filter (where p.status = 'ok'), 0),
         count(*) filter (where p.status = 'interrupted'),
         count(*) filter (where p.status = 'failed')
    from public.plays p
    left join public.media m on m.id = p.media_id
   where public.sf_is_admin()
     and p.played_at >= p_from and p.played_at < p_to
     and (p_client is null or coalesce(p.client_id, m.client_id) = p_client)
     and (p_screen is null or p.screen_id = p_screen)
     and (p_media  is null or p.media_id = p_media)
   group by 1 order by 1;
$$;
revoke all on function public.sf_plays_daily(timestamptz, timestamptz, uuid, text, uuid) from public, anon;
grant execute on function public.sf_plays_daily(timestamptz, timestamptz, uuid, text, uuid) to authenticated;

-- registro detalhado (data, hora, tela, anúncio, duração e resultado)
create or replace function public.sf_play_log(p_from timestamptz, p_to timestamptz, p_client uuid default null,
                                              p_screen text default null, p_media uuid default null,
                                              p_limit int default 500, p_offset int default 0)
returns table(played_at timestamptz, screen_name text, screen_location text, title text, advertiser text,
              seconds int, planned_seconds int, status text, detail text, offline boolean)
language sql stable security definer set search_path = public as $$
  select p.played_at, s.name, s.location, coalesce(m.title, p.media_title, '(anúncio apagado)'),
         coalesce(m.advertiser, p.advertiser), p.seconds, p.planned_seconds, p.status, p.detail, p.offline
    from public.plays p
    left join public.media m on m.id = p.media_id
    join public.screens s on s.id = p.screen_id
   where public.sf_is_admin()
     and p.played_at >= p_from and p.played_at < p_to
     and (p_client is null or coalesce(p.client_id, m.client_id) = p_client)
     and (p_screen is null or p.screen_id = p_screen)
     and (p_media  is null or p.media_id = p_media)
   order by p.played_at desc
   limit least(greatest(p_limit, 1), 20000) offset greatest(p_offset, 0);
$$;
revoke all on function public.sf_play_log(timestamptz, timestamptz, uuid, text, uuid, int, int) from public, anon;
grant execute on function public.sf_play_log(timestamptz, timestamptz, uuid, text, uuid, int, int) to authenticated;

-- ---------------------------------------------------------------------
-- Segurança das tabelas novas
-- ---------------------------------------------------------------------
alter table public.schedule_exceptions enable row level security;
alter table public.screen_events       enable row level security;
alter table public.receipts            enable row level security;
alter table public.media_versions      enable row level security;

drop policy if exists "admin gerencia excecoes" on public.schedule_exceptions;
create policy "admin gerencia excecoes" on public.schedule_exceptions
  for all to authenticated using (public.sf_is_admin()) with check (public.sf_is_admin());
drop policy if exists "admin le historico" on public.screen_events;
create policy "admin le historico" on public.screen_events
  for select to authenticated using (public.sf_is_admin());
drop policy if exists "admin gerencia recebimentos" on public.receipts;
create policy "admin gerencia recebimentos" on public.receipts
  for all to authenticated using (public.sf_is_admin()) with check (public.sf_is_admin());
drop policy if exists "admin le versoes" on public.media_versions;
create policy "admin le versoes" on public.media_versions
  for select to authenticated using (public.sf_is_admin());
revoke all on public.schedule_exceptions, public.screen_events, public.receipts, public.media_versions from anon;
revoke insert, update, delete on public.screen_events, public.media_versions from authenticated;

notify pgrst, 'reload schema';

select 'Atualização 04 aplicada' as resultado;
