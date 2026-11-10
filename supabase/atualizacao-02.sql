-- =====================================================================
--  Start Play — atualização 02: status ao vivo da TV e comandos remotos
--  Rodar uma vez no SQL Editor (pode repetir sem problema).
-- =====================================================================

alter table public.screens add column if not exists status     jsonb not null default '{}'::jsonb;
alter table public.screens add column if not exists status_at  timestamptz;
alter table public.screens add column if not exists command    text check (command is null or command in ('reload', 'identify'));

-- troca a função de sincronização (agora recebe o status do player e devolve comandos)
drop function if exists public.sf_sync(text, date, jsonb);

create or replace function public.sf_sync(p_screen text, p_today date,
                                          p_info jsonb default '{}'::jsonb,
                                          p_status jsonb default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  s public.screens;
  v_today date := coalesce(p_today, current_date);
  v_cmd text;
begin
  if p_screen is null or char_length(p_screen) < 8 or char_length(p_screen) > 64 then
    raise exception 'tela inválida';
  end if;
  if p_info is not null and pg_column_size(p_info) > 4000 then p_info := '{}'::jsonb; end if;
  if p_status is not null and pg_column_size(p_status) > 4000 then p_status := null; end if;
  if v_today not between current_date - 2 and current_date + 2 then v_today := current_date; end if;

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

  return json_build_object(
    'screen', json_build_object('id', s.id, 'name', s.name),
    'command', v_cmd,
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

revoke all on function public.sf_sync(text, date, jsonb, jsonb) from public;
grant execute on function public.sf_sync(text, date, jsonb, jsonb) to anon, authenticated;

-- remove "telas" criadas por robôs de busca
delete from public.screens
where name = 'Nova tela' and coalesce(info->>'ua', '') ~* '(bot|crawler|spider|preview|headless)';

select 'Atualização 02 aplicada' as resultado;
