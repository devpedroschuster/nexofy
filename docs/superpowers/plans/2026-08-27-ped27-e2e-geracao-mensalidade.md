# PED-27 — Playwright: fluxo de geração de mensalidade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um teste E2E Playwright cobrindo o fluxo crítico de geração de mensalidade (`gerar-mensalidades`, "dinheiro real") via a UI do painel admin, reaproveitando a infra do PED-26.

**Architecture:** Um único spec novo (`webapp/e2e/geracao-mensalidade.spec.js`) que reaproveita `loginComoAdmin` e as constantes de `webapp/e2e/constants.js` (já existentes, de PED-26) — nenhuma mudança de infra/config é necessária (o `testDir: './e2e'` do Playwright já pega qualquer `*.spec.js` novo, e o job `e2e` do CI já roda `npm run e2e` sem listar arquivos). O teste loga como o admin do tenant B ("Estudio Teste 3", slug `ronaldo` — **não** o tenant A/`iluminus`, que tem o dataset anonimizado de produção inteiro e geraria centenas de linhas reais na primeira execução), aciona "Criar mensalidades" na página `/financeiro`, e verifica o **estado final da tabela** (não o toast) — a Edge Function `gerar-mensalidades` é idempotente por mês/estúdio, então numa segunda execução no mesmo mês calendário ela responde "já geradas" em vez de gerar de novo; verificar o estado final em vez da resposta específica torna o teste correto nos dois casos.

**Tech Stack:** Mesmo do PED-26 — `@playwright/test`, Chromium, GitHub Actions (`ubuntu-latest`), Supabase staging (`qjmybxkfjkxttggdjxga`).

**Spec:** Ticket Linear [PED-27](https://linear.app/pedro-schuster/issue/PED-27/cicd-fase-2-teste-e2e-playwright-fluxo-de-geracao-de-mensalidade) — "Cobrir com Playwright o fluxo crítico de geração de mensalidade (dinheiro real)." Desenho acordado em brainstorming na mesma sessão que gerou este plano.

## Global Constraints

- Usar o tenant B (`ronaldo`/"Estudio Teste 3"), nunca o tenant A (`iluminus`) — ver Architecture acima.
- Não validar o texto do toast de sucesso (varia entre "gerada(s) com sucesso" e "já estavam geradas") — validar o estado final da UI.
- Reaproveitar `loginComoAdmin`/`urlFor`/`TENANT_B_HOST` de `webapp/e2e/constants.js` e `webapp/e2e/helpers/auth.js` (PED-26) — não duplicar essa lógica.
- Não commitar segredos — credenciais só via `process.env.E2E_ADMIN_B_*` (secrets já existentes no GitHub, criados em PED-26).

## Contexto dos fixtures (já criados nesta sessão, não repetir)

Staging (`qjmybxkfjkxttggdjxga`), estúdio "Estudio Teste 3" (id `e6657270-4d5c-4e52-a3bd-e389e4b32db2`, slug `ronaldo`):
- Plano `id=1`, nome "Plano E2E Teste", `preco=100.00`.
- Aluno "E2E Aluno Tenant B" (`id=1`, criado em PED-26) agora tem `plano_id=1` e `ativo=true` — sem isso, `gerar-mensalidades` ignora o aluno silenciosamente (filtra `.not('plano_id', 'is', null)` e `preco > 0` em `supabase/functions/gerar-mensalidades/index.ts:151-165`).

Credenciais do admin B (`E2E_ADMIN_B_EMAIL`/`E2E_ADMIN_B_PASSWORD`) já são secrets do GitHub Actions, de PED-26 — nada novo a configurar.

## UI do fluxo (já mapeado, não repetir a investigação)

Em `webapp/src/pages/Financeiro.jsx`:
- Botão que abre o modal: `<Button onClick={handleAbrirGerarMensalidades}>Criar mensalidades de {nomeMesCapitalizado}</Button>` (linha ~519-524) — o texto muda com o mês atual, por isso o teste usa um matcher parcial/regex, não o texto exato.
- Modal de confirmação é um `<ModalConfirmacao>` (linha ~801-811) com botão de confirmar com texto padrão **"Confirmar"** (`webapp/src/components/ui/Modal.jsx:97`, `textoConfirmar = 'Confirmar'`, nunca sobrescrito nesse uso).
- Campo de busca da tabela: `placeholder="Buscar aluno..."` (linha ~575).
- Filtro rápido de status: botões com `label` exato **"Pendentes"**, **"Atrasados"**, **"Pagos"**, **"Todos"** (linhas ~582-602) — clicar em "Pendentes" restringe a tabela a lançamentos com status pendente.
- Cada linha da tabela mostra `item.alunos?.nome_completo` (linha 60) — mesmo padrão de asserção por texto usado no spec do PED-26.

---

## File Structure

- **Create** `webapp/e2e/geracao-mensalidade.spec.js` — o teste.
- **Test:** o próprio spec do Playwright é o teste — sem testes unitários adicionais.

---

### Task 1: Teste E2E de geração de mensalidade

**Files:**
- Create: `webapp/e2e/geracao-mensalidade.spec.js`

**Interfaces:**
- Consumes: `loginComoAdmin(page, host, email, password, nomeEstudio)` de `webapp/e2e/helpers/auth.js` (PED-26, já existe — assinatura não muda); `TENANT_B_HOST`, `urlFor(host, path)` de `webapp/e2e/constants.js` (PED-26, já existe).

- [ ] **Step 1: Criar `webapp/e2e/geracao-mensalidade.spec.js`**

```js
// webapp/e2e/geracao-mensalidade.spec.js
import { test, expect } from '@playwright/test';
import { TENANT_B_HOST, urlFor } from './constants.js';
import { loginComoAdmin } from './helpers/auth.js';

const ADMIN_B = {
  email: process.env.E2E_ADMIN_B_EMAIL,
  password: process.env.E2E_ADMIN_B_PASSWORD,
};

test.beforeAll(() => {
  for (const name of ['E2E_ADMIN_B_EMAIL', 'E2E_ADMIN_B_PASSWORD']) {
    if (!process.env[name]) {
      throw new Error(`Missing required env var: ${name}`);
    }
  }
});

// Depende do fixture de staging (estudio "ronaldo", id
// e6657270-4d5c-4e52-a3bd-e389e4b32db2): aluno "E2E Aluno Tenant B" com
// plano_id apontando pro "Plano E2E Teste" (preco 100.00) e ativo=true.
// Sem plano com preço > 0, gerar-mensalidades ignora o aluno
// silenciosamente (ver supabase/functions/gerar-mensalidades/index.ts).
test.describe('Geração de mensalidade', () => {
  test('admin gera mensalidade do mês para o aluno de teste', async ({ page }) => {
    await loginComoAdmin(page, TENANT_B_HOST, ADMIN_B.email, ADMIN_B.password, 'Estudio Teste 3');

    await page.goto(urlFor(TENANT_B_HOST, '/financeiro'));

    // O texto do botão inclui o nome do mês atual (ex: "Criar
    // mensalidades de Agosto") — regex evita depender do mês exato em
    // que o teste roda.
    await page.getByRole('button', { name: /Criar mensalidades de/i }).click();
    await page.getByRole('button', { name: 'Confirmar' }).click();

    // Não valida o texto do toast (difere entre "gerada(s) com sucesso"
    // e "já estavam geradas para este mês", dependendo se é a primeira
    // execução do mês) — o sinal confiável é o estado final da tabela,
    // que é o mesmo nos dois casos: a mensalidade existe e está pendente.
    await page.getByRole('button', { name: 'Pendentes' }).click();
    await page.getByPlaceholder('Buscar aluno...').fill('E2E Aluno Tenant B');

    await expect(page.getByText('E2E Aluno Tenant B', { exact: true })).toBeVisible();
  });
});
```

- [ ] **Step 2: Verificar que a config reconhece o novo teste**

Rodar dentro de `webapp/`:
```bash
npx playwright test --list
```
Expected: agora lista **4** testes — os 3 de `login-tenant-isolation.spec.js` (PED-26) mais o novo `geracao-mensalidade.spec.js:*` — "admin gera mensalidade do mês para o aluno de teste". Sem erro de config.

Também rodar, pra garantir que nada quebrou:
```bash
npm run lint
npm run build
npm test
```
Expected: todos passam sem erro novo (`npm test` roda os 53 testes unitários do Vitest — não deve tentar carregar o novo spec do Playwright, já que `webapp/vitest.config.js` exclui `e2e/**`).

**Não** tentar `npm run e2e` completo nesta máquina — sem os hostnames `iluminus.e2e.test`/`ronaldo.e2e.test` resolvendo (exige `/etc/hosts`, só configurado no CI), o teste não vai conseguir navegar. A verificação real acontece no Task 2, via CI.

- [ ] **Step 3: Commit**

```bash
git add webapp/e2e/geracao-mensalidade.spec.js
git commit -m "test(e2e): fluxo de geração de mensalidade — tenant B (PED-27)"
```

---

### Task 2: Push, PR e verificação real no GitHub Actions

**Files:** nenhum (só push/PR/monitoramento — sem mudança de código).

- [ ] **Step 1: Push**

```bash
git push -u origin devpedroschuster/ped-27-cicd-fase-2-teste-e2e-playwright-fluxo-de-geracao-de
```

- [ ] **Step 2: Abrir o PR**

```bash
export PATH="$PATH:/c/Program Files/GitHub CLI"
gh pr create --title "test(e2e): fluxo de geração de mensalidade (PED-27)" --body "$(cat <<'EOF'
## Summary
- Novo teste E2E (`webapp/e2e/geracao-mensalidade.spec.js`) cobrindo o fluxo crítico de geração de mensalidade via a UI (`/financeiro` → "Criar mensalidades" → "Confirmar").
- Roda contra o tenant de teste B ("Estudio Teste 3"/`ronaldo`), não o tenant A (`iluminus`, que tem o dataset anonimizado de produção inteiro).
- Assert de estado final (linha "Pendente" pro aluno de teste na tabela), não do texto do toast — correto tanto na primeira execução do mês (gera de verdade) quanto em execuções seguintes no mesmo mês (idempotente, "já geradas").
- Reaproveita toda a infra de PED-26 (login helper, constants, config) — nenhuma mudança em `playwright.config.js`, `vite.config.js` ou `.github/workflows/ci.yml`.

## Test plan
- [x] `npx playwright test --list` local — 4 testes reconhecidos (3 de PED-26 + este)
- [x] `npm run lint` / `npm run build` / `npm test` — sem erro novo
- [ ] Job `E2E (Playwright)` verde neste PR (verificação real — só dá pra confirmar rodando no CI, contra staging)

Closes PED-27

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr checks --watch
```
Expected: os jobs `Lint, Test & Build`, `E2E (Playwright)` e `GitGuardian Security Checks` ficam verdes. Se `E2E (Playwright)` falhar, baixar os logs (`gh run view <run-id> --log-failed`) e o artifact `playwright-report` (`gh run download`) antes de tentar corrigir — não adivinhar a causa.

- [ ] **Step 3: Atualizar o ticket no Linear**

Mover PED-27 para "In Review" e linkar o PR (mesmo padrão de PED-25/26/29 nesta sessão).
