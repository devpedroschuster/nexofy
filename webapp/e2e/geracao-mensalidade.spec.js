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
