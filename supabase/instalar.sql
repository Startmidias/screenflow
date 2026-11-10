-- =====================================================================
--  ScreenFlow v2 — banco de dados
--  Como usar: Supabase > SQL Editor > New query > cole tudo > Run.
--  Pode rodar de novo sem problema (não apaga nada).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Administrador: o PRIMEIRO usuário criado vira o dono do painel.
-- Quem se cadastrar depois não enxerga nem altera nada.
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.sf_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create or replace function public.sf_has_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins);
$$;

create or replace function public.sf_first_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admins) then
    insert into public.admins(user_id) values (new.id);
  end if;
  return new;
end $$;

drop trigger if exists sf_first_admin on auth.users;
create trigger sf_first_admin after insert on auth.users
  for each row execute function public.sf_first_admin();

-- se já existia usuário antes deste script, o mais antigo vira admin
insert into public.admins(user_id)
select id from auth.users
where not exists (select 1 from public.admins)
order by created_at limit 1;

-- ---------------------------------------------------------------------
-- Telas (cada TV Box se registra sozinha quando liga)
-- ---------------------------------------------------------------------
create table if not exists public.screens (
  id         text primary key check (char_length(id) between 8 and 64),
  name       text not null default 'Nova tela' check (char_length(name) between 1 and 80),
  location   text check (location is null or char_length(location) <= 120),
  info       jsonb not null default '{}'::jsonb,
  last_seen  timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Anúncios (imagem ou vídeo)
-- ---------------------------------------------------------------------
create table if not exists public.media (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 1 and 120),
  advertiser   text check (advertiser is null or char_length(advertiser) <= 120),
  kind         text not null check (kind in ('image', 'video')),
  path         text not null,
  url          text not null,
  duration_sec int  not null default 10 check (duration_sec between 3 and 600),
  position     int  not null default 0,
  active       boolean not null default true,
  starts_on    date,
  ends_on      date,
  screen_ids   text[],            -- vazio = passa em todas as telas
  size_bytes   bigint,
  created_at   timestamptz not null default now(),
  constraint media_dates_ok check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index if not exists media_position_idx on public.media(position, created_at);

-- ---------------------------------------------------------------------
-- Comprovante de exibição (cada vez que um anúncio passa numa tela)
-- ---------------------------------------------------------------------
create table if not exists public.plays (
  id        bigint generated always as identity primary key,
  screen_id text not null references public.screens(id) on delete cascade,
  media_id  uuid not null references public.media(id) on delete cascade,
  played_at timestamptz not null default now(),
  seconds   int check (seconds between 0 and 3600)
);
create index if not exists plays_media_idx  on public.plays(media_id, played_at);
create index if not exists plays_screen_idx on public.plays(screen_id, played_at);
create index if not exists plays_time_idx   on public.plays(played_at);

-- ---------------------------------------------------------------------
-- Segurança: ninguém de fora lê ou grava tabelas diretamente.
-- A TV só usa as funções sf_sync e sf_log; o painel exige login de admin.
-- ---------------------------------------------------------------------
alter table public.admins  enable row level security;
alter table public.screens enable row level security;
alter table public.media   enable row level security;
alter table public.plays   enable row level security;

drop policy if exists "admin ve a si mesmo" on public.admins;
create policy "admin ve a si mesmo" on public.admins
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "admin gerencia telas" on public.screens;
create policy "admin gerencia telas" on public.screens
  for all to authenticated using (public.sf_is_admin()) with check (public.sf_is_admin());

drop policy if exists "admin gerencia midias" on public.media;
create policy "admin gerencia midias" on public.media
  for all to authenticated using (public.sf_is_admin()) with check (public.sf_is_admin());

drop policy if exists "admin le exibicoes" on public.plays;
create policy "admin le exibicoes" on public.plays
  for select to authenticated using (public.sf_is_admin());

drop policy if exists "admin apaga exibicoes" on public.plays;
create policy "admin apaga exibicoes" on public.plays
  for delete to authenticated using (public.sf_is_admin());

-- ---------------------------------------------------------------------
-- Funções usadas pela TV (player)
-- ---------------------------------------------------------------------

-- A TV chama a cada minuto: registra que está ligada e recebe a lista do dia.
create or replace function public.sf_sync(p_screen text, p_today date, p_info jsonb default '{}'::jsonb)
returns json
language plpgsql security definer set search_path = public as $$
declare
  s public.screens;
  v_today date := coalesce(p_today, current_date);
begin
  if p_screen is null or char_length(p_screen) < 8 or char_length(p_screen) > 64 then
    raise exception 'tela inválida';
  end if;
  if p_info is not null and pg_column_size(p_info) > 4000 then
    p_info := '{}'::jsonb;
  end if;
  -- não aceita datas absurdas vindas do aparelho
  if v_today not between current_date - 2 and current_date + 2 then
    v_today := current_date;
  end if;

  insert into public.screens(id, info, last_seen)
  values (p_screen, coalesce(p_info, '{}'::jsonb), now())
  on conflict (id) do update
    set last_seen = now(),
        info = case when excluded.info = '{}'::jsonb then public.screens.info else excluded.info end
  returning * into s;

  return json_build_object(
    'screen', json_build_object('id', s.id, 'name', s.name),
    'items', coalesce((
      select json_agg(json_build_object(
               'id', m.id, 'title', m.title, 'kind', m.kind,
               'url', m.url, 'duration', m.duration_sec)
             order by m.position, m.created_at)
      from public.media m
      where m.active
        and (m.starts_on is null or m.starts_on <= v_today)
        and (m.ends_on   is null or m.ends_on   >= v_today)
        and (m.screen_ids is null or cardinality(m.screen_ids) = 0 or s.id = any(m.screen_ids))
    ), '[]'::json),
    'server_time', now()
  );
end $$;

-- A TV avisa que um anúncio passou (para o comprovante).
create or replace function public.sf_log(p_screen text, p_media uuid, p_seconds int default null)
returns void
language sql security definer set search_path = public as $$
  insert into public.plays(screen_id, media_id, seconds)
  select p_screen, p_media, least(greatest(coalesce(p_seconds, 0), 0), 3600)
  where exists (select 1 from public.screens
                where id = p_screen and last_seen > now() - interval '15 minutes')
    and exists (select 1 from public.media where id = p_media);
$$;

-- Relatório para o painel (só admin).
create or replace function public.sf_report(p_from timestamptz, p_to timestamptz)
returns table(media_id uuid, title text, advertiser text, screen_id text, screen_name text,
              plays bigint, seconds bigint, first_at timestamptz, last_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, m.title, m.advertiser, s.id, s.name,
         count(*), coalesce(sum(p.seconds), 0), min(p.played_at), max(p.played_at)
  from public.plays p
  join public.media m   on m.id = p.media_id
  join public.screens s on s.id = p.screen_id
  where public.sf_is_admin()
    and p.played_at >= p_from and p.played_at < p_to
  group by m.id, m.title, m.advertiser, s.id, s.name
  order by m.title, s.name;
$$;

revoke all on function public.sf_sync(text, date, jsonb)              from public;
revoke all on function public.sf_log(text, uuid, int)                 from public;
revoke all on function public.sf_report(timestamptz, timestamptz)     from public;
revoke all on function public.sf_is_admin()                           from public;
revoke all on function public.sf_has_admin()                          from public;
revoke all on function public.sf_first_admin()                        from public;
grant execute on function public.sf_sync(text, date, jsonb)          to anon, authenticated;
grant execute on function public.sf_log(text, uuid, int)             to anon, authenticated;
grant execute on function public.sf_has_admin()                      to anon, authenticated;
grant execute on function public.sf_is_admin()                       to authenticated;
grant execute on function public.sf_report(timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------
-- Armazenamento dos arquivos (fotos e vídeos), até 50 MB cada
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('midia', 'midia', true, 52428800,
        array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "sf admin envia midia"   on storage.objects;
drop policy if exists "sf admin altera midia"  on storage.objects;
drop policy if exists "sf admin apaga midia"   on storage.objects;
create policy "sf admin envia midia" on storage.objects
  for insert to authenticated with check (bucket_id = 'midia' and public.sf_is_admin());
create policy "sf admin altera midia" on storage.objects
  for update to authenticated using (bucket_id = 'midia' and public.sf_is_admin());
create policy "sf admin apaga midia" on storage.objects
  for delete to authenticated using (bucket_id = 'midia' and public.sf_is_admin());

select 'ScreenFlow instalado com sucesso' as resultado;
