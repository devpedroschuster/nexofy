# PED-26 — Playwright: login e isolamento entre tenants — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar infraestrutura de testes E2E (Playwright) ao projeto e cobrir o fluxo login → isolamento de dados entre tenants (admin do estúdio A não vê dados do estúdio B), rodando automaticamente em todo PR.

**Architecture:** O app resolve o tenant pelo slug do subdomínio (`getSlugFromHostname` em `webapp/src/lib/resolveEstudio.js`) — em produção via `<slug>.nexofy.com.br`. Para exercitar esse caminho real (não um mock) no CI, o job simula dois subdomínios via `/etc/hosts` (`tenant-a.e2e.test` e `tenant-b.e2e.test` → `127.0.0.1`) apontando pro mesmo servidor local (`vite preview`, buildado com `VITE_ROOT_DOMAINS=e2e.test`). Os testes rodam contra staging (projeto Supabase `qjmybxkfjkxttggdjxga`), usando 2 estúdios de teste já existentes (`iluminus` = tenant A, `ronaldo`/"Estudio Teste 3" = tenant B) e 2 usuários admin sintéticos, cada um só com vínculo em `estudio_membros` (sem linha em `alunos`/`professores` — ver nota abaixo).

**Tech Stack:** `@playwright/test` (Chromium apenas, por ora), Node 22, GitHub Actions (`ubuntu-latest`).

**Spec:** Ticket Linear [PED-26](https://linear.app/pedro-schuster/issue/PED-26/cicd-fase-2-testes-e2e-playwright-login-e-isolamento-entre-tenants) — "Cobrir com Playwright o fluxo: login → isolamento de dados (tenant A não vê dados de tenant B)." Desenho completo (alvo do E2E, criação dos fixtures, secrets) foi acordado em brainstorming na mesma sessão que gerou este plano — não há doc de spec separado; este plano é o registro do desenho.

## Global Constraints

- Não usar a URL do Preview Deployment da Vercel como alvo — os testes sobem e testam um `vite preview` local dentro do próprio job do CI (decisão tomada no brainstorming, para não depender do timing do deploy).
- Só Chromium por enquanto — sem Firefox/WebKit nesta primeira leva.
- Não mexer no código de resolução de tenant (`resolveEstudio.js`) nem criar nenhum "modo de teste" no app — o `/etc/hosts` + `VITE_ROOT_DOMAINS=e2e.test` já bastam pra exercitar o caminho real de produção.
- Não commitar segredos: as credenciais dos usuários de teste e a URL/anon key de staging já estão salvas como GitHub Actions secrets (`E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY`, `E2E_ADMIN_A_EMAIL`, `E2E_ADMIN_A_PASSWORD`, `E2E_ADMIN_B_EMAIL`, `E2E_ADMIN_B_PASSWORD`) — só consumir via `secrets.*`/`env`, nunca hardcoded.

## Contexto dos fixtures (já criados nesta sessão, não repetir)

Staging (`qjmybxkfjkxttggdjxga`) já tem, prontos pra uso:

| Papel | Estúdio | slug | user_id (auth) | estudio_id | Vínculo |
|---|---|---|---|---|---|
| Admin A | Estudio Teste 1 ("iluminus") | `iluminus` | `a6f32ff3-875d-4d2c-b74c-acae447a6187` (email `admin@staging.nexofy.test`) | `d151fb3f-9435-4d18-a6ea-f26d805b9459` | `estudio_membros` role `admin` |
| Admin B | Estudio Teste 3 | `ronaldo` | `a55db4a3-732b-41fa-8f66-c24f014ec58a` (email `adminb@staging.nexofy.test`) | `e6657270-4d5c-4e52-a3bd-e389e4b32db2` | `estudio_membros` role `admin` (criado nesta sessão) |

Alunos de teste (também já criados, para a asserção de isolamento):
- `alunos.nome_completo = 'E2E Aluno Tenant A'` em `estudio_id = 'd151fb3f-9435-4d18-a6ea-f26d805b9459'` (id `2`)
- `alunos.nome_completo = 'E2E Aluno Tenant B'` em `estudio_id = 'e6657270-4d5c-4e52-a3bd-e389e4b32db2'` (id `1`)

**Nota importante sobre o login desses 2 admins:** eles têm vínculo *só* em `estudio_membros`, não em `alunos`/`professores` (as "tabelas legadas"). Isso significa que `Login.jsx` (que resolve o pós-login consultando `alunos`/`professores` diretamente) vai mostrar um toast de erro falso ("Não encontramos seu perfil neste estúdio...") — **mas o login funciona mesmo assim**: `useAuth()` (global, em `App.jsx`) resolve o perfil corretamente via `estudio_membros`, e a rota `/login` redireciona sozinha assim que a sessão fica ativa (`!sessao ? <Login/> : <Navigate to={destinoPosAuth(...)} />` em `webapp/src/App.jsx:201-203`). **Os testes abaixo devem esperar pela URL mudar para `/dashboard`, não por um toast de sucesso** — e não devem falhar por causa desse toast de erro espúrio (ele foi reportado separadamente em [PED-46](https://linear.app/pedro-schuster/issue/PED-46/loginjsx-mostra-erro-falso-perfil-nao-encontrado-para-adminprofessor), fora de escopo aqui).

---

## File Structure

- **Create** `webapp/e2e/constants.js` — porta e hostnames dos dois tenants simulados, usados tanto pelo `playwright.config.js` quanto pelos testes.
- **Create** `webapp/e2e/helpers/auth.js` — helper `loginComoAdmin(page, host, email, password)`, reutilizável pelos próximos PEDs de E2E (27/28).
- **Create** `webapp/e2e/login-tenant-isolation.spec.js` — os 3 testes do PED-26.
- **Create** `webapp/playwright.config.js` — config do Playwright (Chromium, `webServer` que builda+sobe a app).
- **Modify** `webapp/vite.config.js` — adiciona `preview.allowedHosts` pros dois hostnames simulados (sem isso, `vite preview` rejeita o `Host` header e retorna 403).
- **Modify** `webapp/package.json` — devDependency `@playwright/test` + script `"e2e": "playwright test"`.
- **Modify** `webapp/.gitignore` — ignora `playwright-report/` e `test-results/`.
- **Modify** `.github/workflows/ci.yml` — novo job `e2e`, paralelo ao `lint-and-build`, rodando em todo PR.
- **Test:** os próprios specs do Playwright são o teste — não há testes unitários adicionais neste ticket.

---

### Task 1: Infra do Playwright + teste de login/isolamento

**Files:**
- Create: `webapp/e2e/constants.js`
- Create: `webapp/e2e/helpers/auth.js`
- Create: `webapp/e2e/login-tenant-isolation.spec.js`
- Create: `webapp/playwright.config.js`
- Modify: `webapp/vite.config.js`
- Modify: `webapp/package.json`
- Modify: `webapp/.gitignore`

**Interfaces:**
- Produces: `urlFor(host, path)`, `TENANT_A_HOST`, `TENANT_B_HOST`, `PORT` (de `e2e/constants.js`) — consumidos pelo `playwright.config.js` e pelos specs futuros de PED-27/28.
- Produces: `loginComoAdmin(page, host, email, password)` (de `e2e/helpers/auth.js`) — reutilizável por PED-27/28.

- [ ] **Step 1: Instalar a dependência**

Rodar dentro de `webapp/`:
```bash
npm install -D @playwright/test
npx playwright install chromium
```
(No CI, a instalação dos browsers é feita à parte no Task 2, com `--with-deps` — não precisa repetir aqui; o `npx playwright install chromium` local é só pra validar a config no seu próprio ambiente, se quiser rodar localmente depois de configurar o hosts file.)

- [ ] **Step 2: Criar `webapp/e2e/constants.js`**

```js
// webapp/e2e/constants.js
export const PORT = 4173;
export const TENANT_A_HOST = 'tenant-a.e2e.test';
export const TENANT_B_HOST = 'tenant-b.e2e.test';

export function urlFor(host, path = '/') {
  return `http://${host}:${PORT}${path}`;
}
```

- [ ] **Step 3: Criar `webapp/playwright.config.js`**

```js
// webapp/playwright.config.js
import { defineConfig, devices } from '@playwright/test';
import { PORT } from './e2e/constants.js';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 4: Adicionar `preview.allowedHosts` em `webapp/vite.config.js`**

Adicionar a chave `preview` ao objeto retornado por `defineConfig` (mantendo `plugins` e `build` como já estão):

```js
  preview: {
    allowedHosts: ['tenant-a.e2e.test', 'tenant-b.e2e.test'],
  },
```

Sem isso, o Vite 8 rejeita requisições com `Host: tenant-a.e2e.test` (proteção contra DNS rebinding) e o Playwright não consegue nem carregar a página de login.

- [ ] **Step 5: Criar `webapp/e2e/helpers/auth.js`**

```js
// webapp/e2e/helpers/auth.js
import { expect } from '@playwright/test';
import { urlFor } from '../constants.js';

/**
 * Faz login como admin e espera o redirect pro dashboard.
 * Não valida toast de sucesso — ver nota no plano do PED-26 sobre o
 * toast de erro espúrio pra admins vinculados só via estudio_membros
 * (PED-46). O sinal confiável de login bem-sucedido é a URL mudar.
 */
export async function loginComoAdmin(page, host, email, password) {
  await page.goto(urlFor(host, '/login'));
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(urlFor(host, '/dashboard'), { timeout: 15_000 });
}
```

- [ ] **Step 6: Criar `webapp/e2e/login-tenant-isolation.spec.js`**

```js
// webapp/e2e/login-tenant-isolation.spec.js
import { test, expect } from '@playwright/test';
import { TENANT_A_HOST, TENANT_B_HOST, urlFor } from './constants.js';
import { loginComoAdmin } from './helpers/auth.js';

const ADMIN_A = {
  email: process.env.E2E_ADMIN_A_EMAIL,
  password: process.env.E2E_ADMIN_A_PASSWORD,
};
const ADMIN_B = {
  email: process.env.E2E_ADMIN_B_EMAIL,
  password: process.env.E2E_ADMIN_B_PASSWORD,
};

test.describe('Login e isolamento entre tenants', () => {
  test('admin do tenant A loga e só vê alunos do próprio estúdio', async ({ page }) => {
    await loginComoAdmin(page, TENANT_A_HOST, ADMIN_A.email, ADMIN_A.password);

    await page.goto(urlFor(TENANT_A_HOST, '/alunos'));
    await page.getByPlaceholder('Pesquisar por nome ou e-mail...').fill('E2E Aluno Tenant');

    await expect(page.getByText('E2E Aluno Tenant A', { exact: true })).toBeVisible();
    await expect(page.getByText('E2E Aluno Tenant B', { exact: true })).toHaveCount(0);
  });

  test('admin do tenant B loga e só vê alunos do próprio estúdio', async ({ page }) => {
    await loginComoAdmin(page, TENANT_B_HOST, ADMIN_B.email, ADMIN_B.password);

    await page.goto(urlFor(TENANT_B_HOST, '/alunos'));
    await page.getByPlaceholder('Pesquisar por nome ou e-mail...').fill('E2E Aluno Tenant');

    await expect(page.getByText('E2E Aluno Tenant B', { exact: true })).toBeVisible();
    await expect(page.getByText('E2E Aluno Tenant A', { exact: true })).toHaveCount(0);
  });

  test('credenciais inválidas não autenticam', async ({ page }) => {
    await page.goto(urlFor(TENANT_A_HOST, '/login'));
    await page.getByLabel('E-mail').fill(ADMIN_A.email);
    await page.getByLabel('Senha').fill('senha-errada-123');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page.getByText('E-mail ou senha incorretos.')).toBeVisible();
    await expect(page).toHaveURL(urlFor(TENANT_A_HOST, '/login'));
  });
});
```

- [ ] **Step 7: Adicionar script `e2e` e ignorar artefatos**

Em `webapp/package.json`, dentro de `"scripts"`:
```json
    "e2e": "playwright test"
```

Em `webapp/.gitignore`, adicionar ao final:
```
playwright-report/
test-results/
```

- [ ] **Step 8: Verificar que a config carrega e os testes são reconhecidos**

Rodar dentro de `webapp/`:
```bash
npx playwright test --list
```
Expected: lista os 3 testes de `login-tenant-isolation.spec.js` (sem executar), sem erro de parsing de config. **Não** tentar `npm run e2e` completo nesta máquina agora — sem os hostnames `tenant-a.e2e.test`/`tenant-b.e2e.test` resolvendo para `127.0.0.1` (que exige editar o hosts file do SO com privilégio de admin, fora do escopo de editar arquivos do projeto), o `webServer` sobe mas o `page.goto()` falha em resolver o host. A verificação de ponta a ponta de verdade acontece no Task 2, via CI.

Também rodar, pra garantir que a mudança no `vite.config.js` não quebrou nada:
```bash
npm run build
npm run lint
```
Expected: ambos passam sem erro novo.

- [ ] **Step 9: Commit**

```bash
git add webapp/e2e webapp/playwright.config.js webapp/vite.config.js webapp/package.json webapp/package-lock.json webapp/.gitignore
git commit -m "test(e2e): infra Playwright + teste de login e isolamento entre tenants (PED-26)"
```

---

### Task 2: Job de CI + verificação real no GitHub Actions

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `webapp/e2e/*` e `webapp/playwright.config.js` do Task 1 — nenhuma mudança de assinatura, só execução.

- [ ] **Step 1: Adicionar o job `e2e` em `.github/workflows/ci.yml`**

Adicionar como um job irmão de `lint-and-build` (mesmo nível de indentação, dentro de `jobs:`):

```yaml
  e2e:
    name: E2E (Playwright)
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: webapp
    env:
      VITE_SUPABASE_URL: ${{ secrets.E2E_SUPABASE_URL }}
      VITE_SUPABASE_ANON_KEY: ${{ secrets.E2E_SUPABASE_ANON_KEY }}
      VITE_ROOT_DOMAINS: e2e.test
      E2E_ADMIN_A_EMAIL: ${{ secrets.E2E_ADMIN_A_EMAIL }}
      E2E_ADMIN_A_PASSWORD: ${{ secrets.E2E_ADMIN_A_PASSWORD }}
      E2E_ADMIN_B_EMAIL: ${{ secrets.E2E_ADMIN_B_EMAIL }}
      E2E_ADMIN_B_PASSWORD: ${{ secrets.E2E_ADMIN_B_PASSWORD }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: webapp/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Add tenant hostnames to /etc/hosts
        run: |
          echo "127.0.0.1 tenant-a.e2e.test" | sudo tee -a /etc/hosts
          echo "127.0.0.1 tenant-b.e2e.test" | sudo tee -a /etc/hosts

      - name: Run E2E tests
        run: npm run e2e

      - name: Upload Playwright report
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: webapp/playwright-report/
          retention-days: 7
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: adiciona job e2e (Playwright) rodando em todo PR (PED-26)"
```

- [ ] **Step 3: Push e verificar no GitHub Actions**

```bash
git push -u origin devpedroschuster/ped-26-cicd-fase-2-testes-e2e-playwright-login-e-isolamento-entre
```

Abrir o PR (se ainda não existir) e acompanhar o job `E2E (Playwright)`:
```bash
export PATH="$PATH:/c/Program Files/GitHub CLI"
gh pr create --title "test(e2e): Playwright — login e isolamento entre tenants (PED-26)" --body "$(cat <<'EOF'
## Summary
- Adiciona Playwright ao projeto (`webapp/playwright.config.js`, Chromium apenas).
- 3 testes cobrindo login + isolamento entre tenants: admin do tenant A só vê alunos de A, admin do tenant B só vê alunos de B, credenciais inválidas não autenticam.
- Simula 2 subdomínios reais (`tenant-a.e2e.test`/`tenant-b.e2e.test` via `/etc/hosts`) contra um `vite preview` local no próprio job, exercitando o mesmo caminho de resolução de tenant por subdomínio usado em produção.
- Roda contra o Supabase de staging (`qjmybxkfjkxttggdjxga`), usando os estúdios de teste "iluminus" (tenant A) e "Estudio Teste 3"/`ronaldo` (tenant B) e 2 admins sintéticos.
- Novo job `E2E (Playwright)` no `.github/workflows/ci.yml`, paralelo ao `lint-and-build`, rodando em todo PR.

## Test plan
- [x] `npx playwright test --list` local — 3 testes reconhecidos, config sem erro
- [x] `npm run lint` / `npm run build` — sem erro novo
- [ ] Job `E2E (Playwright)` verde neste PR (verificação real do fluxo completo — hosts file + staging)

Closes PED-26

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr checks --watch
```
Expected: os jobs `Lint, Test & Build` e `E2E (Playwright)` ficam verdes. Se `E2E (Playwright)` falhar, baixar o artifact `playwright-report` (`gh run download`) pra ver o motivo antes de tentar de novo — **não** pular a checagem nem marcar como concluído sem o job verde, já que é a única forma real de validar que o `/etc/hosts` + `vite preview` + staging realmente funcionam juntos.

- [ ] **Step 4: Atualizar o ticket no Linear**

Mover PED-26 para "In Review" e linkar o PR (mesmo padrão usado em PED-25/29 nesta sessão).
