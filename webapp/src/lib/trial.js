// webapp/src/lib/trial.js
//
// Lógica pura do trial de 14 dias (PED-105) — extraída pra ser testável
// sem precisar renderizar componente nenhum (este projeto não usa
// @testing-library/react; convenção aqui é lib pura + component "burro"
// que só consome, ver rotaModulo.js).

export function diasRestantesTrial(trialEndsAt, agora = new Date()) {
  if (!trialEndsAt) return null;
  const fim = new Date(trialEndsAt);
  const diffMs = fim.getTime() - agora.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function chaveMensagemBloqueio(statusInfo) {
  if (!statusInfo) return null;
  if (statusInfo.motivo_bloqueio === 'trial_expirado') return 'trial_expirado';
  return statusInfo.status;
}
