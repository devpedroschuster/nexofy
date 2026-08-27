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
