-- PED-159 — reconciliação retroativa de drift de bookkeeping: esta migration
-- já estava aplicada em staging (qjmybxkfjkxttggdjxga) desde 2026-08-29,
-- rodada ad-hoc (via apply_migration/SQL Editor) sem nunca virar arquivo no
-- repo. Recuperado de supabase_migrations.schema_migrations de staging
-- (mesmo texto de statements, sem alteração).
--
-- Contexto original: complementa 20260829201000_revoke_anon_execute_internal_helpers.sql
-- — aquela migration já revogava de `public, anon` explicitamente, mas esta
-- reforça o mesmo revoke (idempotente: revogar de quem não tem o grant é
-- no-op no Postgres). Verificado nesta sessão (PED-159) que produção
-- (tciiepqmnrrcjnqhspvw) já está no estado correto (grants só a
-- postgres/authenticated/service_role, sem anon/PUBLIC) — este arquivo só
-- fecha o gap de bookkeeping do repo, sem mudança de comportamento
-- pendente em nenhum ambiente.
revoke execute on function public.eh_admin_do_estudio_atual() from public, anon;
revoke execute on function public.eh_super_admin() from public, anon;
revoke execute on function public.estudio_ativo_via_override() from public, anon;
revoke execute on function public.estudio_id_atual() from public, anon;
revoke execute on function public.meu_estudio_id() from public, anon;
