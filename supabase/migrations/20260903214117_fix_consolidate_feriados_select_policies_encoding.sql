-- PED-159 — reconciliação retroativa de drift de bookkeeping: esta migration
-- já estava aplicada em staging (qjmybxkfjkxttggdjxga) desde 2026-09-03,
-- rodada ad-hoc sem nunca virar arquivo no repo. Recuperado de
-- supabase_migrations.schema_migrations de staging (mesmo texto de
-- statements, sem alteração).
--
-- Contexto original: 20260903191000_consolidate_feriados_select_policies.sql
-- (PED-132) consolidou as SELECT policies duplicadas de `feriados`, mas em
-- staging sobrou pelo menos uma policy antiga com `qual = 'true'` (provável
-- efeito colateral de encoding/nome de policy não batendo no DROP POLICY
-- original). Esta migration varre por qualquer policy de SELECT remanescente
-- com qual literal 'true' e remove.
--
-- Verificado nesta sessão (PED-159): produção (tciiepqmnrrcjnqhspvw) já tem
-- hoje uma única SELECT policy em feriados ("tenant_select", qual =
-- estudio_id = estudio_id_atual() OR eh_super_admin()) — o loop não
-- encontra nenhuma policy com qual='true' lá, é no-op. Este arquivo fecha
-- o gap de bookkeeping do repo; idempotente e seguro reaplicar em
-- qualquer ambiente.
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
