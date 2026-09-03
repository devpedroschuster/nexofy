-- PED-132: consolida as policies permissivas duplicadas de SELECT em
-- public.feriados (achado do Performance Advisor: multiple_permissive_policies).
--
-- Investigação mostrou que isso não é só duplicação de custo: a policy
-- "Leitura pública feriados" (qual=true) deixa QUALQUER usuário autenticado
-- ler feriados de QUALQUER estúdio — o mesmo vazamento cross-tenant já
-- corrigido uma vez em
-- supabase/migration-history/20260812230257_fix_feriados_cross_tenant_leak.sql,
-- que reapareceu em produção fora de uma migration versionada (drift manual,
-- fora do controle de versão). "tenant_select"
-- (estudio_id = estudio_id_atual() OR eh_super_admin()) já cobre o acesso
-- legítimo — feriados.estudio_id nunca é null (webapp/src/services/feriadosService.js
-- sempre grava e filtra por estudioId), então não há caso de feriado "global"
-- que dependa da policy ampla.
--
-- O nome da policy em produção/staging está com encoding corrompido
-- ("p├║blica" em vez de "pública" — bytes de "ú" double-encoded, sinal de
-- que essa policy foi recriada fora de uma migration normal). Por isso o
-- drop abaixo não usa o nome literal: identifica dinamicamente qualquer
-- policy de SELECT em public.feriados com qual = 'true' e remove pelo nome
-- real armazenado, independente da corrupção de encoding.
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'feriados'
      and cmd = 'SELECT'
      and qual = 'true'
  loop
    execute format('drop policy %I on public.feriados', pol.policyname);
  end loop;
end $$;
