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
  // PED-155: a allowlist de Redirect URLs do projeto de staging já foi
  // atualizada com entradas explícitas para iluminus.e2e.test e
  // ronaldo.e2e.test (confirmado no painel do Supabase). Uma sondagem
  // manual com token inválido, feita fora deste CI, ainda mostrou
  // fallback pra SITE_URL mesmo após ~5min — mas essa sondagem usa um
  // token deliberadamente inválido, e não foi possível confirmar se o
  // GoTrue desta versão do projeto honra o redirect_to allowlisted em
  // caminhos de erro (como fazia em produção, ver PED-134) ou só em
  // verificações bem-sucedidas. Removido o skip para deixar o job de E2E
  // do CI — que roda contra o staging real — decidir com evidência
  // concreta; se falhar por esse motivo, re-adicionar o skip com uma nota
  // atualizada.
  test('redirect_to do reset de senha está na allowlist do projeto (PED-155)', async ({ request }) => {
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
