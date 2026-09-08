// supabase/functions/expurgo-retencao-lgpd/retencao.test.ts
import { assertEquals } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import {
  dataCorteEstudiosCancelados,
  dataCorteWebhookEvents,
  RETENCAO_ESTUDIOS_CANCELADOS_ANOS,
  RETENCAO_WEBHOOK_EVENTS_MESES,
} from "./retencao.ts";

Deno.test("dataCorteEstudiosCancelados subtrai 5 anos mantendo mês/dia/hora", () => {
  const agora = new Date("2026-09-08T05:00:00.000Z");
  assertEquals(dataCorteEstudiosCancelados(agora), "2021-09-08T05:00:00.000Z");
});

Deno.test("dataCorteWebhookEvents subtrai 12 meses mantendo dia/hora", () => {
  const agora = new Date("2026-09-08T05:00:00.000Z");
  assertEquals(dataCorteWebhookEvents(agora), "2025-09-08T05:00:00.000Z");
});

Deno.test("dataCorteEstudiosCancelados lida com 29/fev caindo em ano não-bissexto", () => {
  const agora = new Date("2028-02-29T12:00:00.000Z"); // 2028 é bissexto
  // 2023 não é bissexto — Date normaliza 29/fev/2023 pra 01/mar/2023.
  assertEquals(dataCorteEstudiosCancelados(agora), "2023-03-01T12:00:00.000Z");
});

Deno.test("constantes de retenção batem com o parecer LGPD (PED-176)", () => {
  assertEquals(RETENCAO_ESTUDIOS_CANCELADOS_ANOS, 5);
  assertEquals(RETENCAO_WEBHOOK_EVENTS_MESES, 12);
});
