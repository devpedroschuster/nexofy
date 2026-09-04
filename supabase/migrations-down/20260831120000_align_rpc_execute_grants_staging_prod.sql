-- Reverte 20260831120000_align_rpc_execute_grants_staging_prod.sql: restaura
-- EXECUTE para PUBLIC (cobre anon/authenticated por herança) nas RPCs cujo
-- grant foi revogado. Uso de emergência apenas — reintroduz a superfície
-- mais permissiva que a migration "up" fechou. Testar contra staging antes
-- de aplicar de verdade num incidente.

-- Grupo 1: RPCs do app autenticado (revogadas de public, anon).
GRANT EXECUTE ON FUNCTION public.cancelar_agendamento(bigint, bigint, date, uuid) TO public;
GRANT EXECUTE ON FUNCTION public.clear_estudio_override() TO public;
GRANT EXECUTE ON FUNCTION public.criar_lead_com_presenca(uuid, text, text, bigint, date) TO public;
GRANT EXECUTE ON FUNCTION public.excluir_aula_cascata(bigint, uuid) TO public;
GRANT EXECUTE ON FUNCTION public.latencia_webhook_pagamento_mes() TO public;
GRANT EXECUTE ON FUNCTION public.listar_estudios_admin(integer, integer, text) TO public;
GRANT EXECUTE ON FUNCTION public.matricular_aluno(bigint, integer, jsonb, date, date, numeric, date, text, uuid) TO public;
GRANT EXECUTE ON FUNCTION public.mensalidades_geradas_vs_esperado_mes() TO public;
GRANT EXECUTE ON FUNCTION public.obter_impersonation_ativa() TO public;
GRANT EXECUTE ON FUNCTION public.receita_total_paga() TO public;
GRANT EXECUTE ON FUNCTION public.renovar_plano_aluno(bigint, integer, date, date, numeric, uuid) TO public;
GRANT EXECUTE ON FUNCTION public.set_estudio_override(uuid) TO public;
GRANT EXECUTE ON FUNCTION public.verificar_disponibilidade_v2(bigint, date, uuid, bigint) TO public;
GRANT EXECUTE ON FUNCTION public.verificar_status_estudio() TO public;

-- Grupo 2: RPCs de service_role/trigger (revogadas de public, anon, authenticated).
GRANT EXECUTE ON FUNCTION public.criar_estudio_transacional(text, text, text, text, uuid, text, text) TO public;
GRANT EXECUTE ON FUNCTION public.inserir_mensalidades_regulares_idempotente(jsonb) TO public;
GRANT EXECUTE ON FUNCTION public.prevent_role_change() TO public;
GRANT EXECUTE ON FUNCTION public.substituir_repasses_mensalidade(uuid, bigint, uuid[], jsonb) TO public;
