// webapp/src/pages/SuperAdmin/components/saudeSistemaHelpers.js
//
// Lógica pura do card de latência do webhook — separada de SaudeSistema.jsx
// pra ser testável com vitest (mesmo padrão de webapp/src/lib/*.test.js;
// não há testing-library no projeto pra testar o componente em si).

// PED-35: meta declarada é <5s em 99% dos casos (p99), mas o dashboard usa
// p95 como proxy mais estável com o volume de webhooks deste app — ver
// docs/OBSERVABILIDADE.md. Um p95 dentro dessa meta não garante formalmente
// que o p99 também esteja.
export const WEBHOOK_SLO_MS = 5000;

export function webhookDentroDoSlo(p95Ms) {
  return typeof p95Ms === 'number' && p95Ms <= WEBHOOK_SLO_MS;
}

export function formatarSegundos(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}
