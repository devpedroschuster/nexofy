-- PED-83/PED-84: alinha os grants de EXECUTE das functions SECURITY DEFINER
-- entre staging (qjmybxkfjkxttggdjxga) e produção (tciiepqmnrrcjnqhspvw).
--
-- Contexto: a auditoria da PED-83 corrigiu os 5 helpers internos
-- (eh_admin_do_estudio_atual, eh_super_admin, estudio_ativo_via_override,
-- estudio_id_atual, meu_estudio_id) nos dois ambientes, mas ao reverificar
-- direto em pg_proc.proacl (e não só via advisor) staging continuava bem mais
-- permissiva que produção nas demais RPCs: todas com grant em PUBLIC
-- (`=X/postgres`, herdado por anon) e grant direto em anon, enquanto produção
-- só tem postgres/authenticated/service_role.
--
-- Produção é a referência aqui (é o ambiente mais restrito e o que reflete o
-- que o app realmente precisa). Staging mais permissiva que produção é pior
-- que um lint: mascara falso-negativo — uma chamada que passa em staging e só
-- é bloqueada em produção.
--
-- Este é exatamente o modo de falha descrito na PED-84: grants perdidos
-- silenciosamente por DROP FUNCTION + CREATE FUNCTION (que reseta o ACL pro
-- default do Postgres: EXECUTE pra PUBLIC). Por isso revoga de `public` E de
-- `anon` — revogar de um grantee que nunca teve o grant é no-op no Postgres,
-- então rodar em produção (já correta) é seguro e idempotente.

-- 1. RPCs chamadas pelo app autenticado: produção tem authenticated +
--    service_role, sem PUBLIC/anon. Cada uma faz a própria checagem de
--    estudio_id/role internamente (auditado na PED-83), mas anon nunca tem
--    motivo pra chamá-las — auth.uid() é null.
revoke execute on function public.cancelar_agendamento(bigint, bigint, date, uuid) from public, anon;
revoke execute on function public.clear_estudio_override() from public, anon;
revoke execute on function public.criar_lead_com_presenca(uuid, text, text, bigint, date) from public, anon;
revoke execute on function public.excluir_aula_cascata(bigint, uuid) from public, anon;
revoke execute on function public.latencia_webhook_pagamento_mes() from public, anon;
revoke execute on function public.listar_estudios_admin(integer, integer, text) from public, anon;
revoke execute on function public.matricular_aluno(bigint, integer, jsonb, date, date, numeric, date, text, uuid) from public, anon;
revoke execute on function public.mensalidades_geradas_vs_esperado_mes() from public, anon;
revoke execute on function public.obter_impersonation_ativa() from public, anon;
revoke execute on function public.receita_total_paga() from public, anon;
revoke execute on function public.renovar_plano_aluno(bigint, integer, date, date, numeric, uuid) from public, anon;
revoke execute on function public.set_estudio_override(uuid) from public, anon;
revoke execute on function public.verificar_disponibilidade_v2(bigint, date, uuid, bigint) from public, anon;
revoke execute on function public.verificar_status_estudio() from public, anon;

-- 2. Functions que em produção são só postgres + service_role: chamadas
--    exclusivamente por edge functions com a service_role key
--    (criar-estudio / criar-meu-estudio, gerar-mensalidades,
--    _shared/repasses.ts) ou usadas como trigger (prevent_role_change).
--    Nenhum cliente do browser as chama diretamente, nem em staging.
revoke execute on function public.criar_estudio_transacional(text, text, text, text, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.inserir_mensalidades_regulares_idempotente(jsonb) from public, anon, authenticated;
revoke execute on function public.prevent_role_change() from public, anon, authenticated;
revoke execute on function public.substituir_repasses_mensalidade(uuid, bigint, uuid[], jsonb) from public, anon, authenticated;

-- 3. RPCs públicas por design (landing page do estúdio, usuário deslogado):
--    estudio_publico, modalidades_publicas e planos_publicos MANTÊM anon de
--    propósito. Listadas aqui só para deixar explícito que a ausência delas
--    acima é intencional, não esquecimento.
