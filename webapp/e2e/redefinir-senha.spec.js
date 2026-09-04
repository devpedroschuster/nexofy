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
