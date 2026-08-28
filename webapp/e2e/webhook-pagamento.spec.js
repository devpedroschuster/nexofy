// webapp/e2e/webhook-pagamento.spec.js
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { TENANT_B_HOST, urlFor } from './constants.js';
import { loginComoAdmin } from './helpers/auth.js';

const ADMIN_B = {
  email: process.env.E2E_ADMIN_B_EMAIL,
  password: process.env.E2E_ADMIN_B_PASSWORD,
};

const WEBHOOK_URL = 'https://qjmybxkfjkxttggdjxga.supabase.co/functions/v1/webhook-pagamento';
const ASAAS_PAYMENT_ID = 'e2e-webhook-test-payment';

test.beforeAll(async () => {
  for (const name of [
    'E2E_ADMIN_B_EMAIL',
    'E2E_ADMIN_B_PASSWORD',
    'E2E_ASAAS_WEBHOOK_TOKEN',
    'VITE_SUPABASE_URL',
    'E2E_SUPABASE_SERVICE_ROLE_KEY',
  ]) {
    if (!process.env[name]) {
      throw new Error(`Missing required env var: ${name}`);
    }
  }

  // PED-50: o dedup de webhook_events (origem, asaas_event,
  // asaas_payment_id) é permanente — sem resetar o fixture antes de cada
  // execução, a 1ª chamada real do teste "usa" o dedup pra sempre, e toda
  // execução seguinte passa a validar apenas um valor gravado uma única
  // vez (tautologia), mesmo que a lógica de confirmação de pagamento seja
  // quebrada depois. webhook_events não tem policy pra anon/authenticated
  // (só service role escreve/lê — ver migration 20260823154114), então o
  // reset exige um client autenticado com a service role key, não o login
  // de admin usado no resto do teste.
  const supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL, process.env.E2E_SUPABASE_SERVICE_ROLE_KEY);

  const { error: erroMensalidade } = await supabaseAdmin
    .from('mensalidades')
    .update({
      status: 'pendente',
      asaas_status: null,
      valor_pago: null,
      data_pagamento: null,
      asaas_event_timestamp: null,
    })
    .eq('asaas_payment_id', ASAAS_PAYMENT_ID);
  if (erroMensalidade) {
    throw new Error(`Falha ao resetar mensalidade do fixture: ${erroMensalidade.message}`);
  }

  const { error: erroWebhookEvents } = await supabaseAdmin
    .from('webhook_events')
    .delete()
    .eq('origem', 'asaas')
    .eq('asaas_event', 'PAYMENT_RECEIVED')
    .eq('asaas_payment_id', ASAAS_PAYMENT_ID);
  if (erroWebhookEvents) {
    throw new Error(`Falha ao limpar webhook_events do fixture: ${erroWebhookEvents.message}`);
  }
});

// Depende do fixture de staging (estudio "ronaldo", id
// e6657270-4d5c-4e52-a3bd-e389e4b32db2): aluno "E2E Aluno Webhook" (id 3)
// com uma mensalidade (id 123) vinculada a asaas_payment_id
// 'e2e-webhook-test-payment'. Dedicado só a este teste — não reaproveita
// o aluno/mensalidade do PED-27, pra manter o histórico de cada teste
// isolado do outro.
// data_vencimento/periodo_fim também são load-bearing: a asserção final
// na UI depende de periodo_fim >= 1º dia do mês corrente (janela padrão
// da query do Financeiro). Por isso periodo_fim foi propositalmente
// definido bem no futuro (2099-12-31 no banco), pra este fixture estático
// não sumir da tela depois do mês em que foi criado.
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

    // 1ª chamada: com o reset do beforeAll, esta é sempre o processamento
    // real (1ª vez que este payment_id é visto desde o reset) — dá pra
    // validar o resultado de verdade (status: 'pago'), não só "sucesso
    // genérico". Antes do PED-50 isso não dava pra garantir (podia já vir
    // duplicado de uma execução anterior), então a asserção só checava
    // !ignorado.
    const resposta1 = await request.post(WEBHOOK_URL, { headers, data: payload });
    expect(resposta1.ok(), await resposta1.text()).toBeTruthy();
    const corpo1 = await resposta1.json();
    expect(corpo1.status, JSON.stringify(corpo1)).toBe('pago');

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
    // .first() — este aluno compartilha plano_id (1) e tenant (B) com o
    // fixture do PED-27; gerar-mensalidades (exercida por aquele teste)
    // seleciona alunos ativos com esse plano, e este webhook marca
    // alunos.ativo = true como efeito colateral. Hoje só existe uma linha
    // aqui, mas com fullyParallel: true as specs podem intercalar, então
    // blindamos o locator preventivamente.
    await expect(page.getByText('PAGO', { exact: true }).first()).toBeVisible();
  });
});
