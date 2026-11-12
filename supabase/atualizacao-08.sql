-- =====================================================================
--  START PLAY — atualização 08 (saúde do banco, cópias de segurança
--  e link do anunciante)
--
--  1. Avisos do Supabase (Security/Performance Advisor):
--     - funções com search_path fixo;
--     - sf_today e sf_is_admin fechadas para quem não entrou;
--     - regras de acesso calculadas uma vez por consulta (mais rápido);
--     - índices nas ligações com as telas.
--  2. O banco não estoura o limite do plano gratuito (500 MB):
--     - o registro interno do relógio (pg_cron) guarda só 2 dias;
--     - exibições mais antigas que o prazo escolhido (padrão 90 dias)
--       viram totais por dia e tela (o relatório continua somando tudo;
--       só o registro linha a linha fica limitado ao prazo).
--  3. Cópias de segurança: uma cópia automática por dia dos cadastros,
--     contratos, parcelas, recebimentos, anúncios e telas (guarda 14);
--     o painel baixa a cópia completa, com os totais de exibição.
--  4. Link do anunciante: página online com as exibições do cliente,
--     sem senha, por um endereço secreto que o painel gera e desliga.
--
--  Pode rodar mais de uma vez.
-- =====================================================================

-- 1) avisos do Supabase --------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['sf_news_guard()', 'sf_settings_check()', 'sf_screens_check()',
    'sf_parse_clima(jsonb, text)', 'sf_parse_cotacao(jsonb)', 'sf_parse_frankfurter(jsonb)',
    'sf_parse_jogos(jsonb)', 'sf_parse_tabela(jsonb)', 'sf_fmt_dur(interval)'] loop
    if to_regprocedure('public.' || f) is not null then
      execute format('alter function public.%s set search_path = public', f);
    end if;
  end loop;
end $$;

revoke all on function public.sf_today() from public, anon, authenticated;
grant execute on function public.sf_today() to service_role;
revoke all on function public.sf_is_admin() from public, anon;
grant execute on function public.sf_is_admin() to authenticated, service_role;

do $$
declare r record;
begin
  for r in select tablename, policyname, qual, with_check from pg_policies where schemaname = 'public' loop
    if r.qual ~ '^\(?(public\.)?sf_is_admin\(\)\)?$' then
      execute format('alter policy %I on public.%I using ((select public.sf_is_admin()))', r.policyname, r.tablename);
    end if;
    if r.with_check ~ '^\(?(public\.)?sf_is_admin\(\)\)?$' then
      execute format('alter policy %I on public.%I with check ((select public.sf_is_admin()))', r.policyname, r.tablename);
    end if;
  end loop;
end $$;
alter policy "admin ve a si mesmo" on public.admins using (user_id = (select auth.uid()));

create index if not exists alert_log_screen_idx on public.alert_log(screen_id);
create index if not exists schedule_exceptions_screen_idx on public.schedule_exceptions(screen_id);

-- 2) prazo do registro linha a linha e totais por dia ---------------------
alter table public.settings add column if not exists plays_keep_days smallint not null default 90;
alter table public.settings add column if not exists backup_at timestamptz;
alter table public.settings drop constraint if exists settings_keep_days_chk;
alter table public.settings add constraint settings_keep_days_chk check (plays_keep_days between 40 and 3660);

create table if not exists public.plays_day (
  day          date not null,
  screen_id    text not null references public.screens(id) on delete cascade,
  media_id     uuid,
  media_title  text,
  advertiser   text,
  client_id    uuid references public.clients(id) on delete set null,
  plays        integer not null default 0,
  seconds      bigint  not null default 0,
  interrupted  integer not null default 0,
  failed       integer not null default 0,
  offline      integer not null default 0,
  first_at     timestamptz,
  last_at      timestamptz
);
create unique index if not exists plays_day_uidx on public.plays_day
  (day, screen_id, coalesce(media_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(media_title, ''));
create index if not exists plays_day_client_idx on public.plays_day(client_id, day);
create index if not exists plays_day_media_idx on public.plays_day(media_id, day);
alter table public.plays_day enable row level security;
drop policy if exists "admin le totais" on public.plays_day;
create policy "admin le totais" on public.plays_day for select to authenticated using ((select public.sf_is_admin()));

create or replace function public.sf_tz()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select timezone from public.settings where id = 1), 'America/Cuiaba');
$$;
revoke all on function public.sf_tz() from public, anon, authenticated;

-- exibições mais velhas que o prazo viram totais por dia (o que já foi resumido some do registro linha a linha)
create or replace function public.sf_plays_rollup()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare tz text := public.sf_tz(); keep int; cutoff timestamptz; n int;
begin
  select coalesce(plays_keep_days, 90) into keep from public.settings where id = 1;
  keep := greatest(40, coalesce(keep, 90));
  cutoff := (((now() at time zone tz)::date - keep)::timestamp) at time zone tz;
  with old as (
    delete from public.plays where played_at < cutoff
    returning played_at, screen_id, media_id, media_title, advertiser, client_id, status, seconds, offline
  ), agg as (
    select (played_at at time zone tz)::date as day, screen_id, media_id, media_title,
           max(advertiser) as advertiser,
           (array_agg(client_id) filter (where client_id is not null))[1] as client_id,
           count(*) filter (where status = 'ok') as plays,
           coalesce(sum(seconds) filter (where status = 'ok'), 0) as seconds,
           count(*) filter (where status = 'interrupted') as interrupted,
           count(*) filter (where status = 'failed') as failed,
           count(*) filter (where offline) as offline,
           min(played_at) as first_at, max(played_at) as last_at
      from old group by 1, 2, 3, 4
  )
  insert into public.plays_day as d (day, screen_id, media_id, media_title, advertiser, client_id,
                                     plays, seconds, interrupted, failed, offline, first_at, last_at)
  select day, screen_id, media_id, media_title, advertiser, client_id, plays, seconds, interrupted, failed, offline, first_at, last_at
    from agg
  on conflict (day, screen_id, coalesce(media_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(media_title, ''))
  do update set plays = d.plays + excluded.plays, seconds = d.seconds + excluded.seconds,
                interrupted = d.interrupted + excluded.interrupted, failed = d.failed + excluded.failed,
                offline = d.offline + excluded.offline,
                first_at = least(d.first_at, excluded.first_at), last_at = greatest(d.last_at, excluded.last_at),
                client_id = coalesce(d.client_id, excluded.client_id), advertiser = coalesce(d.advertiser, excluded.advertiser);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.sf_plays_rollup() from public, anon, authenticated;

-- relatório: exibições recentes (linha a linha) + totais por dia (antigas)
create or replace function public.sf_report(p_from timestamptz, p_to timestamptz, p_client uuid default null,
                                            p_screen text default null, p_media uuid default null)
returns table(media_id uuid, title text, advertiser text, client_id uuid, screen_id text, screen_name text,
              screen_location text, plays bigint, seconds bigint, interrupted bigint, failed bigint, offline bigint,
              first_at timestamptz, last_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select x.media_id, max(x.title), max(x.advertiser), (array_agg(x.client_id) filter (where x.client_id is not null))[1],
         x.screen_id, max(x.screen_name), max(x.screen_location),
         sum(x.ok)::bigint, sum(x.secs)::bigint, sum(x.intr)::bigint, sum(x.fail)::bigint, sum(x.offl)::bigint,
         min(x.first_at), max(x.last_at)
    from (select p.media_id, coalesce(m.title, p.media_title, '(anúncio apagado)') as title,
                 coalesce(m.advertiser, p.advertiser) as advertiser, coalesce(p.client_id, m.client_id) as client_id,
                 s.id as screen_id, s.name as screen_name, s.location as screen_location,
                 (p.status = 'ok')::int as ok, case when p.status = 'ok' then coalesce(p.seconds, 0) else 0 end as secs,
                 (p.status = 'interrupted')::int as intr, (p.status = 'failed')::int as fail, p.offline::int as offl,
                 p.played_at as first_at, p.played_at as last_at
            from public.plays p
            left join public.media m on m.id = p.media_id
            join public.screens s on s.id = p.screen_id
           where public.sf_is_admin()
             and p.played_at >= p_from and p.played_at < p_to
             and (p_client is null or coalesce(p.client_id, m.client_id) = p_client)
             and (p_screen is null or p.screen_id = p_screen)
             and (p_media  is null or p.media_id = p_media)
          union all
          select d.media_id, coalesce(m.title, d.media_title, '(anúncio apagado)'),
                 coalesce(m.advertiser, d.advertiser), coalesce(d.client_id, m.client_id),
                 s.id, s.name, s.location,
                 d.plays, d.seconds, d.interrupted, d.failed, d.offline, d.first_at, d.last_at
            from public.plays_day d
            left join public.media m on m.id = d.media_id
            join public.screens s on s.id = d.screen_id
           where public.sf_is_admin()
             and (d.day::timestamp at time zone public.sf_tz()) >= p_from
             and ((d.day + 1)::timestamp at time zone public.sf_tz()) <= p_to
             and (p_client is null or coalesce(d.client_id, m.client_id) = p_client)
             and (p_screen is null or d.screen_id = p_screen)
             and (p_media  is null or d.media_id = p_media)) x
   group by x.media_id, x.title, x.screen_id
   order by max(x.title), max(x.screen_name);
$$;

create or replace function public.sf_plays_daily(p_from timestamptz, p_to timestamptz, p_client uuid default null,
                                                 p_screen text default null, p_media uuid default null)
returns table(day date, plays bigint, seconds bigint, interrupted bigint, failed bigint)
language sql
stable
security definer
set search_path = public
as $$
  select x.day, sum(x.plays)::bigint, sum(x.seconds)::bigint, sum(x.interrupted)::bigint, sum(x.failed)::bigint
    from (select (p.played_at at time zone public.sf_tz())::date as day,
                 (p.status = 'ok')::int as plays,
                 case when p.status = 'ok' then coalesce(p.seconds, 0) else 0 end as seconds,
                 (p.status = 'interrupted')::int as interrupted,
                 (p.status = 'failed')::int as failed
            from public.plays p
            left join public.media m on m.id = p.media_id
           where public.sf_is_admin()
             and p.played_at >= p_from and p.played_at < p_to
             and (p_client is null or coalesce(p.client_id, m.client_id) = p_client)
             and (p_screen is null or p.screen_id = p_screen)
             and (p_media  is null or p.media_id = p_media)
          union all
          select d.day, d.plays, d.seconds, d.interrupted, d.failed
            from public.plays_day d
            left join public.media m on m.id = d.media_id
           where public.sf_is_admin()
             and (d.day::timestamp at time zone public.sf_tz()) >= p_from
             and ((d.day + 1)::timestamp at time zone public.sf_tz()) <= p_to
             and (p_client is null or coalesce(d.client_id, m.client_id) = p_client)
             and (p_screen is null or d.screen_id = p_screen)
             and (p_media  is null or d.media_id = p_media)) x
   group by x.day order by x.day;
$$;

-- 3) cópias de segurança ---------------------------------------------------
create table if not exists public.backups (
  id     bigint generated always as identity primary key,
  at     timestamptz not null default now(),
  kind   text not null default 'auto',
  bytes  integer,
  data   jsonb not null
);
alter table public.backups enable row level security;   -- só pelas funções abaixo

-- p_totais: inclui os totais de exibição por dia (cópia completa baixada pelo painel)
create or replace function public.sf_backup_data(p_totais boolean default false)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'formato', 'startplay-copia-1',
    'gerada_em', now(),
    'ajustes',   (select to_jsonb(s) from public.settings s where id = 1),
    'avisos',    (select to_jsonb(a) from public.alert_settings a limit 1),
    'clientes',  coalesce((select jsonb_agg(to_jsonb(c) order by c.name) from public.clients c), '[]'::jsonb),
    'parcelas',  coalesce((select jsonb_agg(to_jsonb(p) order by p.due_date) from public.payments p), '[]'::jsonb),
    'recebimentos', coalesce((select jsonb_agg(to_jsonb(r) order by r.paid_on) from public.receipts r), '[]'::jsonb),
    'anuncios',  coalesce((select jsonb_agg(to_jsonb(m) order by m.position) from public.media m), '[]'::jsonb),
    'telas',     coalesce((select jsonb_agg(to_jsonb(s) - 'command' order by s.created_at) from public.screens s), '[]'::jsonb),
    'excecoes',  coalesce((select jsonb_agg(to_jsonb(e) order by e.day) from public.schedule_exceptions e), '[]'::jsonb),
    'fontes_ligadas', coalesce((select jsonb_agg(n.id order by n.position) from public.news_sources n where n.enabled), '[]'::jsonb),
    'totais_por_dia', case when p_totais then coalesce((
      select jsonb_agg(jsonb_build_object('dia', t.day, 'tela', t.screen_id, 'anuncio', t.media_id, 'titulo', t.media_title,
                                          'cliente', t.client_id, 'exibicoes', t.plays, 'segundos', t.seconds,
                                          'interrompidas', t.interrupted, 'falhas', t.failed) order by t.day, t.screen_id)
        from (select (p.played_at at time zone public.sf_tz())::date as day, p.screen_id, p.media_id,
                     max(p.media_title) as media_title, (array_agg(p.client_id) filter (where p.client_id is not null))[1] as client_id,
                     count(*) filter (where p.status = 'ok') as plays,
                     coalesce(sum(p.seconds) filter (where p.status = 'ok'), 0) as seconds,
                     count(*) filter (where p.status = 'interrupted') as interrupted,
                     count(*) filter (where p.status = 'failed') as failed
                from public.plays p group by 1, 2, 3
              union all
              select d.day, d.screen_id, d.media_id, d.media_title, d.client_id, d.plays, d.seconds, d.interrupted, d.failed
                from public.plays_day d) t), '[]'::jsonb) end
  );
$$;
revoke all on function public.sf_backup_data(boolean) from public, anon, authenticated;

create or replace function public.sf_backup_take()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare d jsonb := public.sf_backup_data(false); new_id bigint;
begin
  insert into public.backups(kind, bytes, data) values ('auto', octet_length(d::text), d) returning id into new_id;
  delete from public.backups where kind = 'auto'
     and id not in (select id from public.backups where kind = 'auto' order by at desc limit 14);
  return new_id;
end $$;
revoke all on function public.sf_backup_take() from public, anon, authenticated;

-- painel: cópia completa agora (marca a data da última cópia baixada)
create or replace function public.sf_backup_full()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.sf_is_admin() then raise exception 'sem permissão'; end if;
  update public.settings set backup_at = now() where id = 1;
  return public.sf_backup_data(true);
end $$;

create or replace function public.sf_backup_list()
returns table(id bigint, at timestamptz, kind text, bytes integer)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.at, b.kind, b.bytes from public.backups b where public.sf_is_admin() order by b.at desc;
$$;

create or replace function public.sf_backup_get(p_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select b.data from public.backups b where b.id = p_id and public.sf_is_admin();
$$;

-- espaço usado (Ajustes do painel)
create or replace function public.sf_storage_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare files jsonb := '{}'::jsonb;
begin
  if not public.sf_is_admin() then raise exception 'sem permissão'; end if;
  begin
    execute $q$select jsonb_build_object('n', count(*), 'bytes', coalesce(sum((metadata->>'size')::bigint), 0))
                 from storage.objects where bucket_id = 'midia'$q$ into files;
  exception when others then files := '{}'::jsonb;
  end;
  return jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'db_limit', 500 * 1024 * 1024,
    'files', files,
    'files_limit', 1024 * 1024 * 1024,
    'plays', (select count(*) from public.plays),
    'plays_oldest', (select min(played_at) from public.plays),
    'days_rows', (select count(*) from public.plays_day),
    'days_oldest', (select min(day) from public.plays_day),
    'keep_days', (select plays_keep_days from public.settings where id = 1),
    'backup_at', (select backup_at from public.settings where id = 1),
    'auto_last', (select max(at) from public.backups where kind = 'auto'));
end $$;

-- 4) link do anunciante -----------------------------------------------------
alter table public.clients add column if not exists portal_token uuid;
create unique index if not exists clients_portal_token_uidx on public.clients(portal_token) where portal_token is not null;

-- p_action: 'get' (cria se não existe), 'new' (troca: o link antigo para de funcionar), 'off' (desliga)
create or replace function public.sf_portal_link(p_client uuid, p_action text default 'get')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare t uuid;
begin
  if not public.sf_is_admin() then raise exception 'sem permissão'; end if;
  if p_action = 'off' then
    update public.clients set portal_token = null where id = p_client; return null;
  elsif p_action = 'new' then
    update public.clients set portal_token = gen_random_uuid() where id = p_client returning portal_token into t;
  else
    update public.clients set portal_token = coalesce(portal_token, gen_random_uuid()) where id = p_client returning portal_token into t;
  end if;
  if t is null then raise exception 'cliente não encontrado'; end if;
  return t;
end $$;

-- página do anunciante (sem login): só os dados deste cliente
create or replace function public.sf_portal(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c public.clients; tz text := public.sf_tz(); today date; t0 timestamptz; d30 date;
  titles text[]; ads jsonb; daily jsonb; scr jsonb; shots jsonb; st public.settings;
begin
  if p_token is null then return null; end if;
  select * into c from public.clients where portal_token = p_token;
  if c.id is null then return null; end if;
  select * into st from public.settings where id = 1;
  today := (now() at time zone tz)::date;
  d30 := today - 29;
  t0 := (d30::timestamp) at time zone tz;
  select coalesce(array_agg(title), '{}') into titles from public.media where client_id = c.id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'title', m.title, 'kind', m.kind, 'url', m.url, 'seconds', m.duration_sec,
           'starts_on', m.starts_on, 'ends_on', m.ends_on, 'days', m.days,
           'from', to_char(m.time_from, 'HH24:MI'), 'to', to_char(m.time_to, 'HH24:MI'),
           'status', case when not m.active then 'pausado'
                          when m.starts_on > today then 'agendado'
                          when m.ends_on < today then 'encerrado' else 'no_ar' end,
           'screens', coalesce((select jsonb_agg(coalesce(s.location || ' · ', '') || s.name order by s.location, s.name)
                                  from public.screens s where s.name <> 'Nova tela'
                                   and (m.screen_ids is null or cardinality(m.screen_ids) = 0 or s.id = any(m.screen_ids))), '[]'::jsonb))
           order by m.active desc, m.position), '[]'::jsonb)
    into ads from public.media m where m.client_id = c.id;

  -- exibições por dia nos últimos 30 dias (registro linha a linha + totais por dia)
  select coalesce(jsonb_agg(jsonb_build_object('day', g.day::date, 'plays', coalesce(x.plays, 0), 'seconds', coalesce(x.seconds, 0)) order by g.day), '[]'::jsonb)
    into daily
    from generate_series(d30, today, interval '1 day') as g(day)
    left join (
      select y.day, sum(y.plays) as plays, sum(y.seconds) as seconds from (
        select (p.played_at at time zone tz)::date as day, count(*) as plays, coalesce(sum(p.seconds), 0) as seconds
          from public.plays p left join public.media m on m.id = p.media_id
         where p.played_at >= t0 and p.status = 'ok' and coalesce(p.client_id, m.client_id) = c.id
         group by 1
        union all
        select d.day, d.plays, d.seconds from public.plays_day d left join public.media m on m.id = d.media_id
         where d.day >= d30 and coalesce(d.client_id, m.client_id) = c.id) y
      group by y.day) x on x.day = g.day::date;

  -- telas: onde passou nos 30 dias e se está ligada agora
  select coalesce(jsonb_agg(jsonb_build_object(
           'name', coalesce(s.location || ' · ', '') || s.name,
           'plays', coalesce(z.plays, 0),
           'online', s.last_seen > now() - interval '3 minutes',
           'now', case when s.last_seen > now() - interval '3 minutes' and (s.status->>'now') = any(titles) then s.status->>'now' end)
           order by coalesce(z.plays, 0) desc, s.name), '[]'::jsonb)
    into scr
    from public.screens s
    left join (
      select y.screen_id, sum(y.plays) as plays from (
        select p.screen_id, count(*) as plays from public.plays p left join public.media m on m.id = p.media_id
         where p.played_at >= t0 and p.status = 'ok' and coalesce(p.client_id, m.client_id) = c.id group by 1
        union all
        select d.screen_id, d.plays from public.plays_day d left join public.media m on m.id = d.media_id
         where d.day >= d30 and coalesce(d.client_id, m.client_id) = c.id) y
      group by y.screen_id) z on z.screen_id = s.id
   where s.name <> 'Nova tela'
     and (z.plays > 0 or exists (select 1 from public.media m where m.client_id = c.id and m.active
                                  and (m.screen_ids is null or cardinality(m.screen_ids) = 0 or s.id = any(m.screen_ids))));

  -- fotos da tela mostrando a arte deste cliente (as mais recentes)
  select coalesce(jsonb_agg(jsonb_build_object('at', q.at, 'img', q.img, 'w', q.w, 'h', q.h, 'what', q.what, 'screen', q.screen) order by q.at desc), '[]'::jsonb)
    into shots
    from (select sh.at, sh.img, sh.w, sh.h, sh.what, coalesce(s.location || ' · ', '') || s.name as screen
            from public.screen_shots sh join public.screens s on s.id = sh.screen_id
           where sh.what = any(titles) and sh.at > now() - interval '3 days'
           order by sh.at desc limit 4) q;

  return jsonb_build_object(
    'client', c.name,
    'active', c.active,
    'contract', jsonb_build_object('ads', c.ads_qty, 'seconds', c.ad_seconds, 'daily', c.daily_insertions,
                                   'screens', c.screens_qty, 'start', c.start_date,
                                   'end', (c.start_date + make_interval(months => c.contract_months) - interval '1 day')::date),
    'company', jsonb_build_object('name', st.company, 'phone', st.phone, 'city', st.city),
    'today', today, 'tz', tz,
    'ads', ads, 'daily', daily, 'screens', scr, 'shots', shots,
    'updated_at', now());
end $$;
revoke all on function public.sf_portal(uuid) from public;
grant execute on function public.sf_portal(uuid) to anon, authenticated, service_role;

-- 5) rotina de hora em hora --------------------------------------------------
create or replace function public.sf_cleanup()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n int := 0; k int;
begin
  -- player aberto uma vez (teste, outro aparelho, robô) e nunca pareado
  delete from public.screens s
   where s.name = 'Nova tela'
     and coalesce(s.last_seen, s.created_at) < now() - interval '30 days'
     and not exists (select 1 from public.plays p where p.screen_id = s.id)
     and not exists (select 1 from public.plays_day d where d.screen_id = s.id);
  get diagnostics k = row_count; n := n + k;

  delete from public.alert_log where at < now() - interval '180 days';
  get diagnostics k = row_count; n := n + k;

  -- registro interno do relógio do banco (1.440 linhas por dia)
  if to_regclass('cron.job_run_details') is not null then
    begin
      execute $q$delete from cron.job_run_details where end_time < now() - interval '2 days'$q$;
      get diagnostics k = row_count; n := n + k;
    exception when others then raise warning 'limpeza do cron: %', sqlerrm;
    end;
  end if;

  -- exibições antigas viram totais por dia
  n := n + public.sf_plays_rollup();

  -- uma cópia automática por dia
  if not exists (select 1 from public.backups where kind = 'auto' and at > now() - interval '20 hours') then
    perform public.sf_backup_take(); n := n + 1;
  end if;
  return n;
end $$;
revoke all on function public.sf_cleanup() from public, anon, authenticated;
grant execute on function public.sf_cleanup() to service_role;

-- permissões das funções novas do painel
do $$
declare f text;
begin
  foreach f in array array['sf_backup_full()', 'sf_backup_list()', 'sf_backup_get(bigint)',
                           'sf_storage_status()', 'sf_portal_link(uuid, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

-- já faz a primeira cópia e a primeira arrumação
select public.sf_cleanup();

select 'START PLAY: atualização 08 aplicada' as resultado;
