// webapp/src/pages/SuperAdmin/components/saudeSistemaHelpers.js
//
// Lógica pura do card de latência do webhook — separada de SaudeSistema.jsx
// pra ser testável com vitest (mesmo padrão de webapp/src/lib/*.test.js;
// não há testing-library no projeto pra testar o componente em si).

export const WEBHOOK_SLO_MS = 5000; // PED-35: <5s em 99% dos casos

export function webhookDentroDoSlo(p95Ms) {
  return typeof p95Ms === 'number' && p95Ms <= WEBHOOK_SLO_MS;
}

export function formatarSegundos(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}
