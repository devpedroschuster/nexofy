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
