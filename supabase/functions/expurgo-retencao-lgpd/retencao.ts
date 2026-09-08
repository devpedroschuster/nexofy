// supabase/functions/expurgo-retencao-lgpd/retencao.ts
//
// PED-176 — lógica pura (sem I/O) das datas de corte da rotina de
// retenção/expurgo LGPD. Único lugar onde os prazos (5 anos / 12 meses)
// existem como número — as RPCs no banco recebem o corte já calculado
// aqui via parâmetro, em vez de duplicar o prazo também em SQL.

export const RETENCAO_ESTUDIOS_CANCELADOS_ANOS = 5;
export const RETENCAO_WEBHOOK_EVENTS_MESES = 12;

export function dataCorteEstudiosCancelados(agora: Date): string {
  const corte = new Date(agora.getTime());
  corte.setUTCFullYear(corte.getUTCFullYear() - RETENCAO_ESTUDIOS_CANCELADOS_ANOS);
  return corte.toISOString();
}

export function dataCorteWebhookEvents(agora: Date): string {
  const corte = new Date(agora.getTime());
  corte.setUTCMonth(corte.getUTCMonth() - RETENCAO_WEBHOOK_EVENTS_MESES);
  return corte.toISOString();
}
