-- =====================================================================
--  START PLAY — atualização 07 (revisão de segurança e limpeza)
--
--  1. Funções internas deixam de ser chamáveis pela internet:
--     - funções de gatilho (só o banco usa);
--     - sf_log (registro antigo, trocado pelo sf_log_batch no player 2.x);
--     - leitores de clima/cotação/futebol e cálculos de expediente
--       (usados só por dentro do banco).
--  2. Limpeza automática, uma vez por hora:
--     - aparelhos que abriram o player mas nunca foram pareados nem
--       tocaram nada, sem contato há 30 dias;
--     - avisos de TV fora do ar com mais de 180 dias.
--
--  Pode rodar mais de uma vez. Não mexe em anúncios, telas pareadas,
--  exibições (comprovantes) nem no financeiro.
-- =====================================================================

-- 1) permissões ----------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'sf_first_admin()', 'sf_media_version()', 'sf_news_guard()', 'sf_plays_fill()',
    'sf_receipts_sync()', 'sf_screens_check()', 'sf_settings_check()',
    'sf_log(text, uuid, integer)',
    'sf_parse_clima(jsonb, text)', 'sf_parse_cotacao(jsonb)', 'sf_parse_frankfurter(jsonb)',
    'sf_parse_jogos(jsonb)', 'sf_parse_tabela(jsonb)', 'sf_fmt_dur(interval)',
    'sf_is_open(public.screens, timestamptz)', 'sf_open_since(public.screens, timestamptz)',
    'sf_window(public.screens, date)'
  ] loop
    if to_regprocedure('public.' || f) is not null then
      execute format('revoke all on function public.%s from public, anon, authenticated', f);
      execute format('grant execute on function public.%s to service_role', f);
    end if;
  end loop;
end $$;

-- 2) limpeza ---------------------------------------------------------------
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
     and not exists (select 1 from public.plays p where p.screen_id = s.id);
  get diagnostics k = row_count; n := n + k;

  delete from public.alert_log where at < now() - interval '180 days';
  get diagnostics k = row_count; n := n + k;
  return n;
end $$;

revoke all on function public.sf_cleanup() from public, anon, authenticated;
grant execute on function public.sf_cleanup() to service_role;

create or replace function public.sf_tick()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  begin perform public.sf_alert_tick();   exception when others then raise warning 'alertas: %', sqlerrm; end;
  begin perform public.sf_content_tick(); exception when others then raise warning 'conteúdo: %', sqlerrm; end;
  if extract(minute from now()) = 7 then
    begin perform public.sf_cleanup(); exception when others then raise warning 'limpeza: %', sqlerrm; end;
  end if;
end $$;

revoke all on function public.sf_tick() from public, anon, authenticated;
grant execute on function public.sf_tick() to service_role;

select 'START PLAY: atualização 07 aplicada' as resultado;
