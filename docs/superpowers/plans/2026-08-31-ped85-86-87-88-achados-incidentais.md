# PED-85/86/87/88 — Fechamento de achados incidentais

> Como os documentos anteriores de auditoria (`2026-08-29-ped80-83-supabase-security-advisors.md`, `2026-08-31-ped83-84-grants-security-definer.md`), este mistura fix de código (PED-87) com correções de banco (PED-85/88) e uma verificação sem código (PED-86). Não segue o formato de plano TDD (`superpowers:writing-plans`) porque metade do escopo é auditoria/migration de banco, não feature.

**Specs:**
- [PED-85](https://linear.app/pedro-schuster/issue/PED-85) — Bucket `logos` não existe no Supabase Storage
- [PED-86](https://linear.app/pedro-schuster/issue/PED-86) — Staging com 21 functions `SECURITY DEFINER` executáveis por `anon`
- [PED-87](https://linear.app/pedro-schuster/issue/PED-87) — E2E `login-tenant-isolation` flaky após fix da PED-72
- [PED-88](https://linear.app/pedro-schuster/issue/PED-88) — Functions `fake_*` de seed sem `SET search_path`

Projetos: staging (`qjmybxkfjkxttggdjxga`) e produção (`tciiepqmnrrcjnqhspvw`).

---

## PED-86 — já resolvida, sem código novo

Ao investigar, a PED-86 descreve exatamente as mesmas 18 functions já corrigidas pela migration `20260831120000_align_rpc_execute_grants_staging_prod.sql` (PED-83/84, mergeada em `main` antes desta sessão — PR #33): 14 RPCs de app autenticado + 4 exclusivas de `service_role`/trigger, revogadas de `public, anon` (ou `public, anon, authenticated` nas 4).

Reconfirmado nesta sessão via `get_advisors` (security) em staging: o lint `anon_security_definer_function_executable` lista só as 3 RPCs públicas por design (`estudio_publico`, `modalidades_publicas`, `planos_publicos`) — igual a produção. Nenhuma das 18 functions sensíveis aparece mais. Marcando PED-86 como concluída (comentário na issue linka esta seção, sem migration nova).

## PED-85 — cria bucket `logos`

Confirmado que o bucket não existe em nenhum dos dois ambientes (`select id from storage.buckets where id = 'logos'` vazio nos dois). `uploadLogo()` (`webapp/src/services/estudioService.js:63`) já está em produção chamando `supabase.storage.from('logos').upload(...)` — todo upload de logo falha hoje com "Bucket not found".

`supabase/migrations/20260831130000_create_bucket_logos.sql`: mesmo padrão de `create_bucket_landing_covers.sql` (migration-history) — bucket público (leitura), 5MB, mimetypes `image/jpeg|png|webp` (mesmos aceitos pelo `<input accept>` em `ConfiguracoesEstudio.jsx`), policies de insert/update/delete restritas por `estudio_id_atual()`/`eh_admin_do_estudio_atual()`, path convention `${estudioId}/logo.png` (já usada por `uploadLogo`).

Aplicada em staging primeiro, validada (bucket + 4 policies presentes, `get_advisors` sem novo achado), depois em produção — validada da mesma forma.

## PED-88 — `search_path` nas functions `fake_*`

As 8 functions (`fake_cpf`, `fake_cnpj`, `fake_nome`, `fake_email`, `fake_telefone`, `fake_bairro`, `fake_cidade`, `fake_cep`, definidas em `20260827141042_capture_missing_functions.sql`) só existem em staging — confirmado por consulta direta a `pg_proc` nos dois projetos, não só pelo advisor. Nenhuma é `SECURITY DEFINER` nem referencia tabela/função de `public` (só literais, arrays e built-ins de `pg_catalog`), então `search_path = ''` é suficiente e mais restritivo que `= public`.

`supabase/migrations/20260831140000_fix_fake_functions_search_path.sql`: `ALTER FUNCTION` não aceita `IF EXISTS`, então cada alteração é envolvida num `if exists (select 1 from pg_proc where ...)` — migration roda como no-op em produção (onde essas functions não existem) e efetiva em staging, seguindo a mesma disciplina de idempotência entre ambientes já usada na migration da PED-83/84.

Aplicada e validada nos dois ambientes: `pg_proc.proconfig` confirma `search_path=""` nas 8 em staging; `get_advisors` (security) em staging não lista mais nenhuma delas no lint `function_search_path_mutable`.

## PED-87 — E2E flaky, troca de `toHaveURL` por heading do dashboard

`webapp/e2e/helpers/auth.js` esperava só `expect(page).toHaveURL(urlFor(host, '/dashboard'), { timeout: 25_000 })` após o clique em "Entrar" — sintoma recorrente mesmo após o fix da PED-72 (paralelização de queries em `useAuth`), incluindo 2 falhas seguidas numa PR sem nenhuma mudança de auth/routing (PR #32).

Trocado por `expect(page.getByRole('heading', { name: 'Painel de Avisos' })).toBeVisible({ timeout: 25_000 })`, seguido de um `toHaveURL` sem timeout customizado (a navegação já aconteceu nesse ponto). Esse heading (`webapp/src/pages/Dashboard.jsx:215-220`) renderiza assim que o componente do Dashboard monta — não espera as queries de dados do painel, que têm seus próprios `Skeleton`s — então é um sinal mais direto de "login concluído e SPA navegou pra rota nova" do que a URL isolada, que no Playwright pode refletir a navegação do router antes do React terminar de montar a árvore da rota.

Build (`vite build`) e suíte unitária (`vitest run`, 84 testes) passam. A suíte E2E em si não foi rodada localmente — depende de credenciais de staging (`E2E_ADMIN_A_EMAIL` etc.) que não existem neste ambiente; validação real fica para o job `E2E (Playwright)` do CI na PR.

## Verificação

| Item | Staging | Produção |
| --- | --- | --- |
| Bucket `logos` (public, 5MB, mimetypes) | ✅ criado e validado | ✅ criado e validado |
| 4 policies `logos: *` em `storage.objects` | ✅ | ✅ (mesma migration) |
| 8 functions `fake_*` com `search_path=""` | ✅ (`pg_proc.proconfig`) | N/A (functions não existem) |
| `get_advisors` sem `anon_security_definer_function_executable` fora das 3 públicas | ✅ (reconfirmado, PED-86) | ✅ (já estava, PED-83/84) |
| `get_advisors` sem `function_search_path_mutable` para `fake_*` | ✅ | N/A |
