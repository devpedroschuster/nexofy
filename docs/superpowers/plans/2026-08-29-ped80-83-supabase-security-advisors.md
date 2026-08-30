# PED-80/81/82/83 — Supabase security advisor findings

> Este documento não segue o formato de plano TDD padrão (`superpowers:writing-plans`) pelo mesmo motivo do precedente em [`2026-08-26-ped20-23-banco-rls-auditoria.md`](2026-08-26-ped20-23-banco-rls-auditoria.md): nenhum dos 4 tickets é uma feature de código com testes unitários — são achados do Supabase security advisor (`get_advisors`), encontrados incidentalmente durante a verificação da PED-79. Registra a investigação, a correção aplicada (staging → produção) e o que fica bloqueado por decisão/acesso do Pedro.

**Specs:**
- [PED-80](https://linear.app/pedro-schuster/issue/PED-80) — `webhook_events` com RLS habilitado mas sem policy (`rls_enabled_no_policy`)
- [PED-81](https://linear.app/pedro-schuster/issue/PED-81) — Extensão `pg_net` instalada no schema `public` (`extension_in_public`)
- [PED-82](https://linear.app/pedro-schuster/issue/PED-82) — Leaked password protection desabilitado (`auth_leaked_password_protection`)
- [PED-83](https://linear.app/pedro-schuster/issue/PED-83) — Auditar functions `SECURITY DEFINER` expostas via RPC (`anon`/`authenticated_security_definer_function_executable`)

Projetos: staging (`qjmybxkfjkxttggdjxga`) e produção (`tciiepqmnrrcjnqhspvw`), confirmados via `supabase/RLS_MIGRATION_CHECKLIST.md` e `get_project`.

---

## PED-80 — `webhook_events` sem policy

**Investigação:** `pg_policies` confirma zero policies na tabela. `role_table_grants` confirma que `anon`/`authenticated` já não têm nenhum grant de tabela (só `postgres` e `service_role`) — isso vem de `supabase/migration-history/20260823154114_webhook_events_idempotencia.sql`, que já fazia `revoke all ... from anon, authenticated`. O comentário da tabela (já presente em produção via `obj_description`) e um comentário em `.github/workflows/ci.yml` (linha ~94, sobre o fixture do E2E) confirmam de forma independente a mesma intenção: **só `service_role` (edge function `webhook-pagamento`) acessa esta tabela; não é dado de tenant.**

Ou seja: já é fail-closed hoje (RLS sem policy nega tudo por padrão, e o GRANT já nem existe). O achado do advisor é sobre **documentar a intenção explicitamente** em vez de depender do default implícito, exatamente como o próprio ticket sugere.

**Correção:** migration adicionando uma policy `RESTRICTIVE` explícita negando `anon`/`authenticated` — não muda o comportamento (já era negado), só o torna explícito e silencia o lint:

```sql
-- supabase/migrations/20260829200000_add_deny_policy_webhook_events.sql
create policy "Sem acesso para anon/authenticated (somente service_role)"
on public.webhook_events
as restrictive
for all
to anon, authenticated
using (false);
```

## PED-81 — `pg_net` no schema `public`

**Investigação:** `pg_extension.extnamespace` de fato aponta pra `public` (criado via `create extension pg_net with schema public` em `20260825113301_enable_pg_net_and_pg_cron.sql`) — é isso que o advisor木 lê. Mas os objetos reais da extensão (`http_post`, `http_get`, `_await_response`, etc., confirmado via `pg_depend` contra `pg_extension`) **já vivem no schema `net`**, não em `public` — o parâmetro `WITH SCHEMA` do `pg_net` só afeta o registro catalográfico da extensão, não onde suas funções são criadas (o script da extensão usa o schema `net` fixo). `extra_search_path` em `supabase/config.toml` já inclui `extensions`. Nenhum lugar do código chama `net.*` hoje (grep em `supabase/` inteiro, só a migration de `create extension` aparece).

**Tentativa de correção:**
```sql
alter extension pg_net set schema extensions;
```
Falhou em staging com `ERROR: 0A000: extension "pg_net" does not support SET SCHEMA`. Confirmado via `pg_extension.extrelocatable = false`: a extensão **não é relocatable** — isso é uma restrição do próprio `pg_net` (control file), não algo específico do Supabase. O único jeito real de mudar o schema registrado seria `DROP EXTENSION` + `CREATE EXTENSION ... WITH SCHEMA extensions`.

**Decisão (Pedro, 29/08): não aplicar.** Produção tem um cron job ativo (`gerar-mensalidades`, mensal dia 1 às 11h UTC, `cron.job` jobid 1) que chama `net.http_post(...)` diretamente — um drop/recreate da extensão é uma operação difícil de reverter limpo e arriscaria esse job durante a janela da operação, para corrigir um lint **WARN** de baixo risco declarado pelo próprio advisor, e cujas funções (`net.*`) já vivem no schema `net` (não estão de fato expostas em `public`, só o registro catalográfico da extensão está). Risco/benefício desfavorável — fica **aceito como está**, sem fix nesta PR. Nenhuma migration criada para esta issue.

## PED-82 — Leaked password protection desabilitado

**Investigação:** mesma conclusão já registrada em `2026-08-26-ped20-23-banco-rls-auditoria.md` (PED-23) — confirmada de novo agora:
- Não existe chave em `config.toml` para isso (só `minimum_password_length` e `password_requirements`, que são outra coisa — complexidade de caracteres, não checagem HaveIBeenPwned). É config de plataforma (GoTrue hospedado), não de schema/migration.
- Não existe tool MCP do Supabase para alterar Auth config de projeto.
- `supabase projects list` (CLI) confirma que a conta logada neste ambiente só enxerga a org `jnhgbhfxvjlpwcndxmyn` (projetos "Gestao-Iluminus", "FutSul") — **não** a org `bioxitappdomsrzkixtn`, dona de staging/produção do Nexofy. Sem acesso à org certa, nem `supabase config push` nem a Management API funcionam a partir daqui.

**Não é resolvível por código nesta sessão.** Ação manual necessária do Pedro, em cada projeto (staging e produção): Dashboard → *Authentication → Sign In / Providers → Password* → habilitar "Leaked password protection" (ou via Management API com um token da conta/org certa). Comentário deixado na issue documentando isso.

## PED-83 — Auditoria das functions `SECURITY DEFINER`

**Investigação:** puxei a definição real de produção (`pg_get_functiondef`, não o repo — este projeto já teve drift entre repo e produção real, PED-21/78) das ~21 functions únicas listadas no advisor, e cruzei com `get_advisors` para saber exatamente quais têm `anon` vs só `authenticated`.

**Achado principal:** `supabase/migration-history/20260812225200_revoke_unnecessary_execute_grants.sql` já tinha revogado `EXECUTE ... FROM anon` de `eh_admin_do_estudio_atual`, `eh_super_admin`, `estudio_ativo_via_override`, `estudio_id_atual` e `meu_estudio_id` em 12/08. Hoje, `get_advisors` mostra que **4 dessas 5 voltaram a estar liberadas para `anon`** (`meu_estudio_id` é a única que continua correta). Causa provável: alguma migration posterior redefiniu essas functions via `DROP FUNCTION` + `CREATE FUNCTION` (em vez de `CREATE OR REPLACE FUNCTION`) — isso reseta privilégios pro default do Postgres (`EXECUTE` pra `PUBLIC`, que inclui `anon`/`authenticated`), apagando o revoke anterior sem ninguém perceber. Não achei o `DROP FUNCTION` exato nas migrations atuais (pode ter acontecido direto em produção, fora do repo, dado o histórico de drift já documentado). Isso é uma regressão de segurança real, não só um "não fiz ainda" — as 4 functions são helpers internos puros (leitura, sem side-effect, resolvem tenant/role a partir de `auth.uid()`) que nunca deveriam precisar ser chamados por `anon` (que não tem `auth.uid()`).

**Todas as outras functions authenticated-only foram lidas e confirmadas com checagem interna própria** (via `pg_get_functiondef`, produção):
- `cancelar_agendamento`, `matricular_aluno`, `renovar_plano_aluno`, `criar_lead_com_presenca`, `excluir_aula_cascata`, `verificar_disponibilidade_v2`: validam `estudio_id`/dono do registro/role admin explicitamente antes de qualquer efeito.
- `clear_estudio_override`, `set_estudio_override`, `latencia_webhook_pagamento_mes`, `listar_estudios_admin`, `mensalidades_geradas_vs_esperado_mes`, `receita_total_paga`: checam `eh_super_admin()` internamente.
- `obter_impersonation_ativa`, `verificar_status_estudio`: escopadas por `auth.uid()` na própria query, sem checagem adicional necessária.
- `estudio_publico`, `modalidades_publicas`, `planos_publicos`: **públicas por design** (landing page), já filtram por `estudio.status = 'ativo'` — mantêm `anon`.

Nenhuma delas precisa de mudança.

**Correção:** re-revoga (idempotente) o `EXECUTE` de `anon` nas 4 functions que regrediram, sem tocar `authenticated` (o app usa essas functions autenticado, ex. pra resolver o estúdio atual no bootstrap da UI):

```sql
-- supabase/migrations/20260829201000_revoke_anon_execute_internal_helpers.sql
revoke execute on function public.eh_admin_do_estudio_atual() from anon;
revoke execute on function public.eh_super_admin() from anon;
revoke execute on function public.estudio_ativo_via_override() from anon;
revoke execute on function public.estudio_id_atual() from anon;
```

**Achado à parte, não bloqueia PED-83:** o padrão `DROP FUNCTION` + `CREATE FUNCTION` (em vez de `CREATE OR REPLACE`) resetar grants é um risco de regressão sistêmico — pode acontecer de novo com qualquer function futura. Vale um item novo no backlog (checklist + talvez um advisor check recorrente em CI) para não perder isso de novo. Criado como issue separada (ver seção final).

---

## Sequência de aplicação (staging → produção, por `RLS_MIGRATION_CHECKLIST.md`)

1. Criar as migrations de PED-80 e PED-83 em `supabase/migrations/` (PED-81 não gera migration — ver decisão acima; PED-82 não é migration).
2. Aplicar as 2 em staging (`qjmybxkfjkxttggdjxga`) via `apply_migration`.
3. Verificar em staging: primeira tentativa da migration de PED-83 (`revoke ... from anon`) não teve efeito — `pg_proc.proacl` mostrou que em staging o `anon` herda `EXECUTE` via grant em `PUBLIC` (`=X/...`), não um grant direto; em produção é o inverso (grant direto pra `anon`, sem `PUBLIC`). Migration corrigida pra revogar de `public, anon` nas duas (revogar de quem nunca teve o grant é no-op seguro). Depois da correção: `set local role anon` chamando as 4 functions retorna erro de permissão (42501); `set local role authenticated` continua funcionando; `pg_policies` confirma a policy de `webhook_events`.
4. Aplicar as mesmas 2 migrations em produção (`tciiepqmnrrcjnqhspvw`).
5. Repetir a verificação do passo 3 em produção + `get_advisors` completo confirmando que só sobram `extension_in_public` (PED-81, aceito) e `auth_leaked_password_protection` (PED-82, bloqueado).
6. Comentar nas 4 issues do Linear (PED-80/83 resolvidas; PED-81 investigada e aceita como está; PED-82 bloqueada — ação manual do Pedro documentada).
7. Criar issue nova para o achado do `DROP FUNCTION`/grants (achado à parte da PED-83).
8. Commit + push da branch (worktree já criada) + abrir PR referenciando as 4 issues.

Não é necessária a simulação completa de 2 tenants do checklist (ela é para policies *escopadas por tenant*; as 3 correções aqui são deny-all ou revoke de helper interno, sem lógica de `estudio_id` nova) — a verificação de role (`anon` vs `authenticated` vs `service_role`) acima é o equivalente correto para este caso.
