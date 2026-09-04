# Cobertura E2E: Reset de Senha e Redirect do Google OAuth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar cobertura E2E para os dois fluxos de auth sem teste (PED-147): reset de senha ponta a ponta (regressão da PED-139) e o `redirectTo` usado por `signInWithOAuth` no Google.

**Architecture:** Dois specs novos em `webapp/e2e/`, seguindo os padrões já estabelecidos por `webhook-pagamento.spec.js` (fixture efêmero criado/destruído via `E2E_SUPABASE_SERVICE_ROLE_KEY`) e `login-tenant-isolation.spec.js` (hosts simulados de tenant via `constants.js`). Nenhum CI secret novo é necessário.

**Tech Stack:** Playwright (`@playwright/test`), `@supabase/supabase-js` (client + admin API), Node 22 (via `node:crypto`).

**Spec:** Issue PED-147 (Linear) — https://linear.app/pedro-schuster/issue/PED-147

## Global Constraints

- Nenhum novo secret de CI: usa `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `E2E_SUPABASE_SERVICE_ROLE_KEY`, já presentes em `.github/workflows/ci.yml`.
- Não reutilizar `E2E_ADMIN_A_*`/`E2E_ADMIN_B_*` para o teste de reset de senha: `fullyParallel: true` roda specs em paralelo, e mudar a senha de um fixture compartilhado quebraria logins concorrentes de outros specs. Usar um usuário efêmero criado no `beforeAll` e destruído no `afterAll`.
- O teste de reset de senha NÃO navega para o `action_link` real do GoTrue (`GET /auth/v1/verify`) — a allowlist de Redirect URLs do projeto de staging não cobre os hosts `*.e2e.test` hoje (achado durante esta implementação, rastreado na PED-155). Em vez disso, usa `verifyOtp({ token_hash, type: 'recovery' })` (POST, sem redirect envolvido) e injeta a sessão resultante via fragmento de URL — o mesmo mecanismo que `detectSessionInUrl` do supabase-js já processa.
- O teste de sondagem da allowlist (item 2 da issue original) fica com `test.skip` até a PED-155 ser resolvida, para não deixar o job de E2E vermelho em toda PR.

---

### Task 1: Reset de senha ponta a ponta (regressão da PED-139)

**Files:**
- Create: `webapp/e2e/redefinir-senha.spec.js`

**Interfaces:**
- Consome: `TENANT_B_HOST`, `urlFor` de `webapp/e2e/constants.js`; `createClient` de `@supabase/supabase-js`; `randomUUID` de `node:crypto`.
- Não produz nada consumido por outras tasks (arquivo independente).

**Contexto necessário (já verificado nesta sessão, não re-verificar):**
- `estudio_id` do tenant B ("ronaldo" / Estudio Teste 3) em staging: `e6657270-4d5c-4e52-a3bd-e389e4b32db2`.
- `estudio_membros` tem `ON DELETE CASCADE` em `user_id` → `auth.users(id)`: deletar o usuário via admin API já remove a linha de `estudio_membros` junto.
- `admin.generateLink({ type: 'recovery', email })` retorna `data.properties.hashed_token` (não `action_link` — não vamos usar o link, só o token).
- `supabaseAnon.auth.verifyOtp({ token_hash, type: 'recovery' })` retorna `data.session` com `access_token`, `refresh_token`, `expires_in`, `expires_at`, `token_type` — sem depender de `redirect_to`/allowlist.
- `GoTrueClient._getSessionFromURL` (em `node_modules/@supabase/auth-js/dist/module/GoTrueClient.js`) exige exatamente essas chaves no fragmento da URL (`#access_token=...`) para processar a sessão e — como `type=recovery` está presente — disparar o evento `PASSWORD_RECOVERY`, que é o que `RedefinirSenha.jsx` escuta.
- `SENHA_MIN = 8` (`webapp/src/lib/constants.js`); senha válida precisa de maiúscula + número (validação em `RedefinirSenha.jsx`) e força ≥ 2 (`calcularForcaSenha`, `webapp/src/lib/security.js`) — ex.: `'NovaSenhaE2E123'` atende todos os critérios.
- Heading da página: `'Criar nova senha'` (quando `primeiroAcesso` é `false`, nosso caso). Botão: `'Redefinir senha'`. Labels dos campos: `'Nova senha'` e `'Confirmar senha'` (via `getByLabel`, substring match do Playwright cobre o hint extra no `<label>`).
- Papel `'admin'` em `estudio_membros` resolve para `/dashboard` via `rotaPorPerfil` (`webapp/src/lib/navigation.js`) — heading do dashboard: `'Painel de Avisos'` (mesmo usado em `helpers/auth.js`).

- [ ] **Step 1: Escrever o spec completo**

```js
// webapp/e2e/redefinir-senha.spec.js
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { TENANT_B_HOST, urlFor } from './constants.js';

// PED-147: regressão da PED-139 (RedefinirSenha.jsx consultava
// estudio_membros.auth_id, coluna inexistente — a coluna real é user_id).
// O bug era silencioso: sem este teste, um admin do fluxo moderno preso
// no loop de "esqueci minha senha" só se manifestava para o usuário final.
//
// Fixture efêmero, não reaproveita ADMIN_A/ADMIN_B: este teste MUDA a
// senha do usuário via updateUser real, e com fullyParallel: true outros
// specs fazem login com ADMIN_A/ADMIN_B em paralelo — mexer na senha de
// um fixture compartilhado quebraria esses logins por uma janela de
// tempo. Criado no beforeAll e destruído no afterAll (o ON DELETE CASCADE
// de estudio_membros.user_id já remove a linha de estudio_membros junto).
//
// Não navega pro link de recuperação de verdade (GET /auth/v1/verify):
// hoje a allowlist de Redirect URLs do projeto de staging não cobre os
// hosts *.e2e.test (ver PED-155) — navegar pro action_link real cairia
// em SITE_URL (localhost:3000), fora do app. Em vez disso, chama
// verifyOtp({ token_hash, type: 'recovery' }) — o mesmo passo que o
// clique no link do e-mail dispara do lado do GoTrue, só que via POST,
// sem depender de redirect_to — e injeta a sessão resultante via
// fragmento de URL (#access_token=...&type=recovery). É o formato exato
// que GoTrueClient._getSessionFromURL espera (ver
// node_modules/@supabase/auth-js/dist/module/GoTrueClient.js): com
// detectSessionInUrl (ativado em src/lib/supabase.js), o client processa
// esse fragmento na inicialização e dispara PASSWORD_RECOVERY — o mesmo
// evento que um clique real no link dispararia.
test.describe('Redefinição de senha', () => {
  const ESTUDIO_B_ID = 'e6657270-4d5c-4e52-a3bd-e389e4b32db2'; // Estudio Teste 3 (ronaldo)
  const fixtureEmail = `e2e-redefinir-senha-${Date.now()}@teste.nexofy.com.br`;

  let supabaseAdmin;
  let supabaseAnon;
  let fixtureUserId;

  test.beforeAll(async () => {
    for (const name of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'E2E_SUPABASE_SERVICE_ROLE_KEY']) {
      if (!process.env[name]) {
        throw new Error(`Missing required env var: ${name}`);
      }
    }

    supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL, process.env.E2E_SUPABASE_SERVICE_ROLE_KEY);
    supabaseAnon = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

    const { data: userData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: fixtureEmail,
      password: randomUUID(),
      email_confirm: true,
    });
    if (createErr) {
      throw new Error(`Falha ao criar usuário fixture: ${createErr.message}`);
    }
    fixtureUserId = userData.user.id;

    // Admin do fluxo moderno: só existe em estudio_membros, sem linha em
    // alunos/professores — exatamente o caso que a PED-139 quebrava.
    const { error: membroErr } = await supabaseAdmin
      .from('estudio_membros')
      .insert({ estudio_id: ESTUDIO_B_ID, user_id: fixtureUserId, role: 'admin' });
    if (membroErr) {
      throw new Error(`Falha ao criar estudio_membros do fixture: ${membroErr.message}`);
    }
  });

  test.afterAll(async () => {
    if (fixtureUserId) {
      await supabaseAdmin.auth.admin.deleteUser(fixtureUserId);
    }
  });

  test('admin novo redefine senha via link de recuperação e cai em /dashboard, não /login', async ({ page }) => {
    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: fixtureEmail,
    });
    if (linkErr) {
      throw new Error(`Falha ao gerar link de recuperação: ${linkErr.message}`);
    }

    const { data: verifyData, error: verifyErr } = await supabaseAnon.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'recovery',
    });
    if (verifyErr) {
      throw new Error(`Falha ao verificar token de recuperação: ${verifyErr.message}`);
    }
    const { access_token, refresh_token, expires_in, expires_at, token_type } = verifyData.session;

    const fragmento = new URLSearchParams({
      access_token,
      refresh_token,
      expires_in: String(expires_in),
      expires_at: String(expires_at),
      token_type,
      type: 'recovery',
    }).toString();

    await page.goto(`${urlFor(TENANT_B_HOST, '/redefinir-senha')}#${fragmento}`);

    await expect(page.getByRole('heading', { name: 'Criar nova senha' })).toBeVisible({ timeout: 15_000 });

    await page.getByLabel('Nova senha').fill('NovaSenhaE2E123');
    await page.getByLabel('Confirmar senha').fill('NovaSenhaE2E123');
    await page.getByRole('button', { name: 'Redefinir senha' }).click();

    // resolverRotaPosSenha (redefinirSenhaRoteamento.js) consulta
    // estudio_membros.user_id (corrigido na PED-139) e resolve
    // role: 'admin' -> /dashboard. Antes da correção, o erro de coluna
    // inexistente (auth_id) caía silenciosamente em /login.
    await expect(page.getByRole('heading', { name: 'Painel de Avisos' })).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(urlFor(TENANT_B_HOST, '/dashboard'));
  });
});
```

- [ ] **Step 2: Rodar lint**

Run: `cd webapp && npm run lint`
Expected: sem erros novos em `e2e/redefinir-senha.spec.js`.

- [ ] **Step 3: Commit**

```bash
git add webapp/e2e/redefinir-senha.spec.js
git commit -m "test(e2e): cobre reset de senha ponta a ponta (regressao PED-139)"
```

---

### Task 2: `redirectTo` do Google OAuth + sondagem da allowlist (skip)

**Files:**
- Create: `webapp/e2e/oauth-redirect.spec.js`

**Interfaces:**
- Consome: `TENANT_A_HOST`, `urlFor` de `webapp/e2e/constants.js`.
- Não produz nada consumido por outras tasks.

**Contexto necessário:**
- Botão do Google em `Login.jsx`: `<EntrarComGoogle texto="Entrar com Google" />` → texto do botão é `'Entrar com Google'` (não o default `'Continuar com Google'`).
- `signInWithOAuth` dispara `window.location.assign(url)` com `url = ${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=...` (ver `GoTrueClient._handleProviderSignIn`/`_getUrlForProvider`) — uma navegação de página inteira, interceptável via `page.route`.
- `EntrarComGoogle.jsx` usa `redirectTo: `${window.location.origin}/login`` sempre — para o host do tenant A isso é `urlFor(TENANT_A_HOST, '/login')`.
- Sondagem da allowlist (GET `/auth/v1/verify?token=...&type=recovery&redirect_to=...` com token inválido): confirmado nesta sessão que hoje TODOS os redirect_to (incluindo hosts `*.e2e.test` legítimos) caem em `http://localhost:3000` — a allowlist de staging não cobre esses hosts. Rastreado na PED-155. Por isso este teste específico fica `test.skip`.

- [ ] **Step 1: Escrever o spec completo**

```js
// webapp/e2e/oauth-redirect.spec.js
import { test, expect } from '@playwright/test';
import { TENANT_A_HOST, urlFor } from './constants.js';

test.describe('Redirect do Google OAuth', () => {
  test.beforeAll(() => {
    for (const name of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) {
      if (!process.env[name]) {
        throw new Error(`Missing required env var: ${name}`);
      }
    }
  });

  // Cobre o item 1 do PED-147: sem sair do domínio (não completa o
  // consentimento do Google, frágil e caro), assertamos que
  // signInWithOAuth() é chamado com o redirectTo correto pro host do
  // tenant em teste. EntrarComGoogle.jsx usa sempre
  // `${window.location.origin}/login` — em produção, esse é o bug que a
  // PED-134 encontrou (origin de subdomínio de tenant, mas allowlist só
  // cobria www).
  //
  // signInWithOAuth dispara uma navegação de página inteira via
  // window.location.assign (GoTrueClient._handleProviderSignIn) — não um
  // fetch/XHR — por isso interceptamos via page.route (que também cobre
  // navegações) e abortamos antes de sair de verdade para o Google.
  test('signInWithOAuth usa o redirectTo do host em teste', async ({ page }) => {
    await page.goto(urlFor(TENANT_A_HOST, '/login'));

    await page.route('**/auth/v1/authorize**', (route) => route.abort());
    const requestPromise = page.waitForRequest((req) => req.url().includes('/auth/v1/authorize'));

    await page.getByRole('button', { name: 'Entrar com Google' }).click();

    const request = await requestPromise;
    const url = new URL(request.url());

    expect(url.searchParams.get('provider')).toBe('google');
    expect(url.searchParams.get('redirect_to')).toBe(urlFor(TENANT_A_HOST, '/login'));
  });

  // Cobre o item 2 do PED-147: mesma técnica de sondagem usada na
  // auditoria que gerou a PED-134 (GET /auth/v1/verify com token
  // deliberadamente inválido, observando se o redirect_to pedido é
  // ecoado — allowlisted — ou descartado em favor de SITE_URL).
  //
  // SKIP: hoje a allowlist de Redirect URLs do projeto de staging não
  // cobre os hosts *.e2e.test (nem localhost:4173) — confirmado via
  // sondagem manual durante a implementação da PED-147. Navegar de
  // verdade para um link de recuperação também cairia fora do app pelo
  // mesmo motivo (ver comentário em redefinir-senha.spec.js). Rastreado
  // na PED-155: assim que a allowlist de staging for corrigida, remover
  // este skip.
  test.skip('redirect_to do reset de senha está na allowlist do projeto (PED-155)', async ({ request }) => {
    const alvoLegitimo = urlFor(TENANT_A_HOST, '/redefinir-senha');

    const respostaLegitima = await request.get(`${process.env.VITE_SUPABASE_URL}/auth/v1/verify`, {
      headers: { apikey: process.env.VITE_SUPABASE_ANON_KEY },
      params: { token: 'e2e-probe-invalid-token', type: 'recovery', redirect_to: alvoLegitimo },
      maxRedirects: 0,
    });
    expect(respostaLegitima.headers()['location']).toContain(alvoLegitimo);

    // Confirmação positiva de que não há open redirect (mesmo ponto que
    // a PED-134 destacou): um domínio externo continua caindo no fallback.
    const respostaExterna = await request.get(`${process.env.VITE_SUPABASE_URL}/auth/v1/verify`, {
      headers: { apikey: process.env.VITE_SUPABASE_ANON_KEY },
      params: { token: 'e2e-probe-invalid-token', type: 'recovery', redirect_to: 'https://evil.example.com/steal' },
      maxRedirects: 0,
    });
    expect(respostaExterna.headers()['location']).not.toContain('evil.example.com');
  });
});
```

- [ ] **Step 2: Rodar lint**

Run: `cd webapp && npm run lint`
Expected: sem erros novos em `e2e/oauth-redirect.spec.js`.

- [ ] **Step 3: Commit**

```bash
git add webapp/e2e/oauth-redirect.spec.js
git commit -m "test(e2e): cobre redirectTo do Google OAuth; sonda allowlist (skip, PED-155)"
```

---

## Verificação final

Nenhum destes testes pode ser executado localmente nesta sessão (faltam `E2E_ADMIN_*`, `E2E_SUPABASE_SERVICE_ROLE_KEY` e as entradas de `/etc/hosts` para os tenants simulados). A verificação real acontece no job `E2E (Playwright)` do CI, contra o projeto de staging. `npm run lint` é a única verificação local possível.
