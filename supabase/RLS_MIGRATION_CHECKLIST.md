# Checklist de migration de RLS (PED-20)

Toda migration que cria, altera ou remove uma **RLS policy**, ou qualquer função usada dentro de uma policy (`estudio_id_atual()`, `eh_admin_do_estudio_atual()`, `eh_super_admin()`, etc.), segue este checklist antes de ser aplicada em produção.

## Por que isso existe

Isolamento multi-tenant neste projeto depende inteiramente de RLS: toda tabela de tenant é filtrada por `estudio_id = estudio_id_atual()` (ou equivalente), e `estudio_id_atual()` resolve a partir de `auth.uid()`. Um erro de lógica numa policy — ou numa function `SECURITY DEFINER` chamada por ela — vaza dados de um estúdio para outro. Já aconteceu neste projeto (ver `supabase/migration-history/20260812125914_fix_cross_tenant_rls_leak.sql` e as duas partes seguintes) e é a categoria de bug mais cara de deixar passar.

## O checklist

1. **Escreva a migration normalmente** em `supabase/migrations/`, aplique local ou em staging (`qjmybxkfjkxttggdjxga`) primeiro — nunca direto em produção (`tciiepqmnrrcjnqhspvw`).
2. **Rode a simulação de 2 tenants** (script abaixo) contra o ambiente onde a migration acabou de ser aplicada. Precisa de pelo menos 2 `estudio_id` diferentes com pelo menos 1 linha cada na(s) tabela(s) afetada(s) pela policy — use dados de staging ou o estúdio de teste QA (`supabase/migration-history/20260819023144_criar_estudio_teste_qa_asaas.sql`).
3. **Confirme isolamento**: cada tenant simulado só pode ver/alterar as próprias linhas. Qualquer linha do "outro" tenant aparecendo no resultado é reprovação — não aplicar em produção até corrigir.
4. **Rode os advisors de segurança** (`get_advisors` / `supabase inspect db` — ou via MCP) depois de aplicar, procurando por `rls_enabled_no_policy` e por policies novas sem `USING`/`WITH CHECK`.
5. **Só então** aplique em produção, e rode a mesma simulação lá também (produção pode ter dados/roles que staging não tem).

## Script de simulação (SQL Editor / `execute_sql`)

Isolamento em Postgres via RLS depende do papel (`role`) da conexão e do JWT simulado — é isso que o Supabase injeta de verdade em cada request via PostgREST. Para reproduzir fielmente:

```sql
-- 1. Descubra 2 usuários de estúdios DIFERENTES para o teste
--    (troque pela tabela/coluna relevante para a policy que você está testando)
select em.user_id, em.estudio_id, em.role
from estudio_membros em
order by em.estudio_id
limit 10;

-- 2. Simule o Tenant A (troque <uuid-tenant-a> pelo user_id do passo 1)
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<uuid-tenant-a>", "role": "authenticated"}';

select estudio_id_atual();               -- confirme que resolveu para o estúdio A
select * from <tabela_da_policy>;        -- só deve trazer linhas do estúdio A
-- tente também um UPDATE/DELETE numa linha do estúdio B (deve afetar 0 linhas):
-- update <tabela_da_policy> set ... where id = '<id-de-uma-linha-do-estudio-b>';
rollback;                                -- nunca commit numa sessão de teste

-- 3. Repita para o Tenant B (troque <uuid-tenant-b>)
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<uuid-tenant-b>", "role": "authenticated"}';

select estudio_id_atual();               -- confirme que resolveu para o estúdio B
select * from <tabela_da_policy>;        -- só deve trazer linhas do estúdio B
rollback;

-- 4. Simule também o anon (usuário deslogado) — não deve ver nenhuma linha de tenant:
begin;
set local role anon;
select * from <tabela_da_policy>;        -- deve vir vazio (ou só o que é explicitamente público)
rollback;
```

Notas:
- `set local` (não `set` puro) garante que o papel/claims voltam ao normal no fim da transação — sempre feche com `rollback` numa sessão de teste, nunca `commit`.
- `request.jwt.claims` é a mesma GUC que o PostgREST/Supabase preenche a partir do JWT real; é assim que `auth.uid()` (e por consequência `estudio_id_atual()`) enxerga "quem está logado" mesmo rodando SQL direto.
- Se a tabela/função usa `auth.jwt() ->> 'algum_claim'` além de `auth.uid()`, inclua esse claim no JSON de `request.jwt.claims` também.
- Para funções `SECURITY DEFINER` chamadas por `anon`/`authenticated` sem guarda interna (`eh_super_admin()` etc.), o teste do passo 4 é obrigatório — é a categoria de bug do advisor `anon_security_definer_function_executable`.

## Achado deste levantamento (não é RLS, mas é adjacente)

Os advisors de segurança de produção mostram várias funções `SECURITY DEFINER` de impersonação (`set_estudio_override`, `clear_estudio_override`, `estudio_ativo_via_override`) com `EXECUTE` liberado para `anon`. Hoje elas se protegem internamente checando `eh_super_admin()` (que retorna `false` para `anon`, já que `auth.uid()` é `null`), então não são exploráveis como estão — mas é defesa em profundidade fraca: bastaria alguém remover essa checagem numa migration futura sem perceber que `anon` ainda tem `EXECUTE`. Recomendação: `revoke execute on function public.set_estudio_override(uuid), public.clear_estudio_override() from anon, authenticated;` e conceder só para o role que efetivamente deveria chamar (provavelmente só usuários autenticados que sejam super_admin). Isso não bloqueia PED-20 — é um item separado, sinalizado aqui para não se perder.
