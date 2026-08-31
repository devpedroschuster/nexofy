# PED-83/PED-84 — Fechamento da auditoria de grants em functions `SECURITY DEFINER`

> Como o documento anterior ([`2026-08-29-ped80-83-supabase-security-advisors.md`](2026-08-29-ped80-83-supabase-security-advisors.md)), este não segue o formato de plano TDD (`superpowers:writing-plans`): não é feature de código com teste unitário, é auditoria de privilégios de banco. Registra o que foi verificado, o que mudou e o que ficou pendente de aplicação.

**Specs:**
- [PED-83](https://linear.app/pedro-schuster/issue/PED-83) — Auditar functions `SECURITY DEFINER` expostas via RPC para `anon`/`authenticated`
- [PED-84](https://linear.app/pedro-schuster/issue/PED-84) — `DROP FUNCTION` + `CREATE FUNCTION` reseta grants (risco de regressão silenciosa)

Projetos: staging (`qjmybxkfjkxttggdjxga`) e produção (`tciiepqmnrrcjnqhspvw`).

---

## Estado ao começar

A parte principal da PED-83 já tinha sido feita em 29/08 (`supabase/migrations/20260829201000_revoke_anon_execute_internal_helpers.sql`): os 5 helpers internos (`eh_admin_do_estudio_atual`, `eh_super_admin`, `estudio_ativo_via_override`, `estudio_id_atual`, `meu_estudio_id`) tiveram `EXECUTE` revogado de `public` e `anon`, e todas as demais functions `authenticated`-only foram lidas via `pg_get_functiondef` e confirmadas com checagem interna própria de `estudio_id`/role.

## O que foi reverificado agora

Em vez de reler o `get_advisors` (que só reporta os lints `0028`/`0029` para `anon`/`authenticated`), consultei `pg_proc.proacl` direto nos dois ambientes, com `aclexplode`, incluindo o grantee `PUBLIC` (`grantee = 0`) e o caso `proacl is null` (ACL default, que já libera `EXECUTE` pra `PUBLIC`).

**Produção:** limpa. As únicas functions `SECURITY DEFINER` alcançáveis por `anon` são as 3 públicas por design da landing page — `estudio_publico(text)`, `modalidades_publicas(uuid)`, `planos_publicos(uuid)`.

**Staging:** drift. 18 functions ainda tinham grant em `PUBLIC` **e** grant direto em `anon` — incluindo mutações (`matricular_aluno`, `cancelar_agendamento`, `renovar_plano_aluno`, `excluir_aula_cascata`, `substituir_repasses_mensalidade`), impersonação (`set_estudio_override`, `clear_estudio_override`) e métricas de super admin (`receita_total_paga`, `listar_estudios_admin`, `mensalidades_geradas_vs_esperado_mes`, `latencia_webhook_pagamento_mes`). Quatro delas (`criar_estudio_transacional`, `inserir_mensalidades_regulares_idempotente`, `prevent_role_change`, `substituir_repasses_mensalidade`) em produção nem `authenticated` têm: são chamadas só por edge function com `service_role` (`criar-estudio`, `criar-meu-estudio`, `gerar-mensalidades`, `_shared/repasses.ts`) ou usadas como trigger.

Isso não aparecia no advisor de staging da mesma forma que em produção justamente porque o mecanismo era outro (`PUBLIC` herdado, não grant nomeado) — o mesmo ponto cego descrito na PED-84.

**Por que importa:** staging mais permissiva que produção é falso-negativo. Um teste que passa em staging não prova nada sobre produção, e o inverso (algo bloqueado só em produção) só aparece depois do deploy. Produção é a referência: é o ambiente mais restrito e o que reflete o que o app realmente precisa.

## Correção — PED-83

`supabase/migrations/20260831120000_align_rpc_execute_grants_staging_prod.sql`: revoga `EXECUTE` de `public, anon` nas 14 RPCs de app autenticado e de `public, anon, authenticated` nas 4 exclusivas de `service_role`/trigger. As 3 RPCs públicas por design ficam como estão (documentado no fim da migration, para a ausência delas não parecer esquecimento).

A migration é idempotente e um no-op em produção (revogar de um grantee que nunca teve o grant não é erro no Postgres), então roda igual nos dois ambientes.

## Correção — PED-84

Os três itens sugeridos na issue:

1. **Nota no checklist.** Nova seção em `supabase/RLS_MIGRATION_CHECKLIST.md` explicando que `DROP FUNCTION` + `CREATE FUNCTION` faz o objeto nascer com o ACL default (`EXECUTE` pra `PUBLIC`), apagando qualquer `REVOKE` anterior sem aviso, e que os grants precisam ser re-aplicados na mesma migration. Substitui a recomendação antiga sobre `set_estudio_override`/`clear_estudio_override`, que esta PR resolve.
2. **Verificação periódica.** `scripts/audit-security-definer-grants.sql` — lê o ACL real de todas as functions `SECURITY DEFINER` de `public` e mostra separadamente `PUBLIC`, `anon` e `authenticated`. Feito para rodar nos dois ambientes e comparar; o passo 4 do checklist agora aponta pra ele. Não virou cron: o gatilho útil é "depois de mexer em function" e "antes de release", não uma data fixa — e um cron mensal contra produção precisaria de credencial/infra que hoje não existe pra isso.
3. **Checar `proacl` em vez de assumir.** Coberto pelos dois itens acima: o script lê `proacl` e o checklist diz explicitamente para revogar de `public` **e** `anon`.

## Verificação

Query do `audit-security-definer-grants.sql` rodada em produção antes das mudanças: retorna só as 3 RPCs públicas por design — confirma que a correção da PED-83 de 29/08 continua valendo lá e que o script funciona.

**Pendente:** aplicar `20260831120000_align_rpc_execute_grants_staging_prod.sql` em staging e em produção. As tools de escrita no banco (`apply_migration`/`execute_sql`) foram bloqueadas pelo classificador de permissão nesta sessão; a migration está commitada e precisa ser aplicada com aprovação. Depois de aplicar, rodar o script de auditoria nos dois ambientes: o resultado esperado é idêntico nos dois — só `estudio_publico`, `modalidades_publicas` e `planos_publicos`.
