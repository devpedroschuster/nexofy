// webapp/e2e/webhook-pagamento.spec.js
import { test, expect } from '@playwright/test';
import { TENANT_B_HOST, urlFor } from './constants.js';
import { loginComoAdmin } from './helpers/auth.js';

const ADMIN_B = {
  email: process.env.E2E_ADMIN_B_EMAIL,
  password: process.env.E2E_ADMIN_B_PASSWORD,
};

const WEBHOOK_URL = 'https://qjmybxkfjkxttggdjxga.supabase.co/functions/v1/webhook-pagamento';
const ASAAS_PAYMENT_ID = 'e2e-webhook-test-payment';

test.beforeAll(() => {
  for (const name of ['E2E_ADMIN_B_EMAIL', 'E2E_ADMIN_B_PASSWORD', 'E2E_ASAAS_WEBHOOK_TOKEN']) {
    if (!process.env[name]) {
      throw new Error(`Missing required env var: ${name}`);
    }
  }
});

// Depende do fixture de staging (estudio "ronaldo", id
// e6657270-4d5c-4e52-a3bd-e389e4b32db2): aluno "E2E Aluno Webhook" (id 3)
// com uma mensalidade (id 123) vinculada a asaas_payment_id
// 'e2e-webhook-test-payment'. Dedicado só a este teste — não reaproveita
// o aluno/mensalidade do PED-27, porque o dedup de webhook_events é
// permanente (não expira por mês como a geração de mensalidade), então
// compartilhar fixture com outro teste tornaria o histórico entre eles
// confuso.
test.describe('Webhook de pagamento', () => {
  test('confirma pagamento e reenvio duplicado é ignorado (idempotência)', async ({ page, request }) => {
    const payload = {
      event: 'PAYMENT_RECEIVED',
      dateCreated: new Date().toISOString(),
      payment: { id: ASAAS_PAYMENT_ID, status: 'RECEIVED' },
    };
    const headers = {
      'Content-Type': 'application/json',
      'asaas-access-token': process.env.E2E_ASAAS_WEBHOOK_TOKEN,
    };

    // 1ª chamada: pode ser o processamento real (1ª vez que este
    // payment_id é visto) ou já um duplicado de uma execução anterior do
    // CI — o dedup de webhook_events não expira por mês. De qualquer
    // forma, deve responder com sucesso (200).
    const resposta1 = await request.post(WEBHOOK_URL, { headers, data: payload });
    expect(resposta1.ok(), await resposta1.text()).toBeTruthy();

    // 2ª chamada, payload idêntico, logo em seguida: essa SEMPRE precisa
    // ser um duplicado, independente do histórico de execuções anteriores
    // — é a asserção real de idempotência (reenvio do Asaas não
    // reprocessa nem duplica efeitos colaterais).
    const resposta2 = await request.post(WEBHOOK_URL, { headers, data: payload });
    expect(resposta2.ok(), await resposta2.text()).toBeTruthy();
    const corpo2 = await resposta2.json();
    expect(corpo2.duplicado).toBe(true);

    // Estado final: a mensalidade aparece como paga na UI.
    await loginComoAdmin(page, TENANT_B_HOST, ADMIN_B.email, ADMIN_B.password, 'Estudio Teste 3');
    await page.goto(urlFor(TENANT_B_HOST, '/financeiro'));
    await page.getByRole('button', { name: 'Todos' }).click();
    await page.getByPlaceholder('Buscar aluno...').fill('E2E Aluno Webhook');

    await expect(page.getByText('E2E Aluno Webhook', { exact: true }).first()).toBeVisible();
    // exact: true — sem isso, o match por substring pega também o botão
    // de filtro "Pagos" (strict-mode violation: 2 elementos).
    await expect(page.getByText('PAGO', { exact: true })).toBeVisible();
  });
});
