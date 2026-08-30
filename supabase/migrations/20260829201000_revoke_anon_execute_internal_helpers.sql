-- PED-83: get_advisors (anon_security_definer_function_executable) mostra que
-- eh_admin_do_estudio_atual, eh_super_admin, estudio_ativo_via_override e
-- estudio_id_atual voltaram a ter EXECUTE liberado para anon em produção,
-- mesmo depois de supabase/migration-history/20260812225200_revoke_unnecessary_execute_grants.sql
-- já ter revogado isso (provável causa: alguma redefinição posterior via DROP
-- FUNCTION + CREATE FUNCTION em vez de CREATE OR REPLACE, que reseta grants
-- pro default do Postgres). São helpers internos puros (leitura, sem
-- side-effect, resolvem tenant/role a partir de auth.uid()) que nunca
-- deveriam ser chamados por anon (que não tem auth.uid()).
--
-- Testado (pg_proc.proacl) em staging E produção antes de escrever isto: os
-- dois ambientes divergem em COMO o anon ganhou acesso — produção tem grant
-- direto pra anon (`anon=X/...`), staging tem grant pra PUBLIC (`=X/...`,
-- que anon herda por ser um role comum). Por isso revoga de `public` E de
-- `anon` explicitamente nas duas — revogar de um grantee que nunca teve o
-- grant é no-op silencioso no Postgres, então é seguro rodar em ambos os
-- ambientes sem checar qual mecanismo cada um usa.
--
-- meu_estudio_id() incluída também: só produção já estava correta (nem
-- PUBLIC nem anon têm grant lá); staging tinha os dois grants redundantes
-- (achado incidental durante a verificação desta migration, não estava na
-- lista original da PED-83, mas o mesmo helper interno pede o mesmo tratamento).
--
-- authenticated e service_role continuam com EXECUTE nas 5 (grant direto,
-- não depende de PUBLIC) — o app usa essas functions autenticado, ex. pra
-- resolver o estúdio atual no bootstrap da UI.
revoke execute on function public.eh_admin_do_estudio_atual() from public, anon;
revoke execute on function public.eh_super_admin() from public, anon;
revoke execute on function public.estudio_ativo_via_override() from public, anon;
revoke execute on function public.estudio_id_atual() from public, anon;
revoke execute on function public.meu_estudio_id() from public, anon;
