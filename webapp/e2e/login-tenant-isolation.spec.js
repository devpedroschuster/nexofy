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

const REQUIRED_ENV_VARS = [
  'E2E_ADMIN_A_EMAIL',
  'E2E_ADMIN_A_PASSWORD',
  'E2E_ADMIN_B_EMAIL',
  'E2E_ADMIN_B_PASSWORD',
];

test.beforeAll(() => {
  for (const name of REQUIRED_ENV_VARS) {
    if (!process.env[name]) {
      throw new Error(`Missing required env var: ${name}`);
    }
  }
});

// Estes testes assumem, sem revalidar em runtime, que os fixtures de
// staging continuam assim (ver tabela no plano do PED-26):
// (a) os alunos "E2E Aluno Tenant A/B" têm `role` default 'aluno' — é o
//     que a página de Alunos filtra pra listar;
// (b) os dois estúdios de teste têm `status = 'ativo'` — senão o login
//     redireciona pra /estudio-bloqueado em vez de /dashboard.
test.describe('Login e isolamento entre tenants', () => {
  test('admin do tenant A loga e só vê alunos do próprio estúdio', async ({ page }) => {
    await loginComoAdmin(page, TENANT_A_HOST, ADMIN_A.email, ADMIN_A.password, 'Estudio Teste 1');

    await page.goto(urlFor(TENANT_A_HOST, '/alunos'));
    await page.getByPlaceholder('Pesquisar por nome ou e-mail...').fill('E2E Aluno Tenant');

    await expect(page.getByText('E2E Aluno Tenant A', { exact: true })).toBeVisible();
    await expect(page.getByText('E2E Aluno Tenant B', { exact: true })).toHaveCount(0);
  });

  test('admin do tenant B loga e só vê alunos do próprio estúdio', async ({ page }) => {
    await loginComoAdmin(page, TENANT_B_HOST, ADMIN_B.email, ADMIN_B.password, 'Estudio Teste 3');

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
