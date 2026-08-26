// supabase/functions/_shared/reconciliacao.test.ts
import { assertEquals } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import { detectarDivergencias, type MensalidadeReconciliacao } from "./reconciliacao.ts";

const HOJE = new Date("2026-08-26T12:00:00Z");

function mens(overrides: Partial<MensalidadeReconciliacao> = {}): MensalidadeReconciliacao {
  return {
    id: "m1",
    aluno_id: "a1",
    tipo_aula: "regular",
    status: "pendente",
    valor_pago: null,
    valor_cobranca: 100,
    asaas_payment_id: null,
    asaas_status: null,
    data_vencimento: "2026-08-10",
    ...overrides,
  };
}

Deno.test("sem divergência quando tudo bate", () => {
  const mensalidades = [mens({
    id: "m1", status: "pago", valor_pago: 100, valor_cobranca: 100,
  })];
  const repasses = [{ mensalidade_id: "m1" }];
  assertEquals(detectarDivergencias(mensalidades, repasses, HOJE), []);
});

Deno.test("pago_sem_valor: status pago mas valor_pago nulo", () => {
  const mensalidades = [mens({ id: "m1", status: "pago", valor_pago: null })];
  const divergencias = detectarDivergencias(mensalidades, [], HOJE);
  assertEquals(divergencias.length, 1);
  assertEquals(divergencias[0].mensalidadeId, "m1");
  assertEquals(divergencias[0].tipos, ["pago_sem_valor", "pago_sem_repasse"]);
});

Deno.test("pago_sem_repasse: pago, aluno vinculado, tipo elegível, sem lançamento", () => {
  const mensalidades = [mens({ id: "m1", status: "pago", valor_pago: 100 })];
  const divergencias = detectarDivergencias(mensalidades, [], HOJE);
  assertEquals(divergencias.map(d => d.mensalidadeId), ["m1"]);
  assertEquals(divergencias[0].tipos, ["pago_sem_repasse"]);
});

Deno.test("pago_sem_repasse não dispara quando já existe repasse vinculado", () => {
  const mensalidades = [mens({ id: "m1", status: "pago", valor_pago: 100 })];
  const repasses = [{ mensalidade_id: "m1" }];
  assertEquals(detectarDivergencias(mensalidades, repasses, HOJE), []);
});

Deno.test("pago_sem_repasse não dispara sem aluno vinculado (visitante)", () => {
  const mensalidades = [mens({ id: "m1", status: "pago", valor_pago: 100, aluno_id: null })];
  assertEquals(detectarDivergencias(mensalidades, [], HOJE), []);
});

Deno.test("valor_divergente: valor_pago diferente de valor_cobranca (fora da tolerância de 1 centavo)", () => {
  const mensalidades = [mens({
    id: "m1", status: "pago", valor_pago: 90, valor_cobranca: 100,
  })];
  const repasses = [{ mensalidade_id: "m1" }];
  const divergencias = detectarDivergencias(mensalidades, repasses, HOJE);
  assertEquals(divergencias[0].tipos, ["valor_divergente"]);
});

Deno.test("valor_divergente não dispara com diferença de 1 centavo (arredondamento)", () => {
  const mensalidades = [mens({
    id: "m1", status: "pago", valor_pago: 99.995, valor_cobranca: 100,
  })];
  const repasses = [{ mensalidade_id: "m1" }];
  assertEquals(detectarDivergencias(mensalidades, repasses, HOJE), []);
});

Deno.test("sem_retorno_webhook: cobrança criada no Asaas, vencida, sem nenhum retorno de status", () => {
  const mensalidades = [mens({
    id: "m1", status: "pendente", asaas_payment_id: "pay_1", asaas_status: null,
    data_vencimento: "2026-08-01",
  })];
  const divergencias = detectarDivergencias(mensalidades, [], HOJE);
  assertEquals(divergencias[0].tipos, ["sem_retorno_webhook"]);
});

Deno.test("sem_retorno_webhook não dispara antes do vencimento", () => {
  const mensalidades = [mens({
    id: "m1", status: "pendente", asaas_payment_id: "pay_1", asaas_status: null,
    data_vencimento: "2026-09-10",
  })];
  assertEquals(detectarDivergencias(mensalidades, [], HOJE), []);
});

Deno.test("sem_retorno_webhook não dispara quando asaas_status já foi preenchido (webhook respondeu)", () => {
  const mensalidades = [mens({
    id: "m1", status: "pendente", asaas_payment_id: "pay_1", asaas_status: "PENDING",
    data_vencimento: "2026-08-01",
  })];
  assertEquals(detectarDivergencias(mensalidades, [], HOJE), []);
});
