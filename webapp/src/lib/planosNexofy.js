//
// Preços dos planos self-service da Nexofy (PED-115) — espelha o array
// PLANS de webapp/src/pages/LandingNexofy.jsx. "Rede" (sob consulta) não
// entra aqui: não é self-service, permanece 100% manual/comercial.
//
// O valor calculado aqui é só pra EXIBIÇÃO na UI de upgrade — o valor
// cobrado de verdade é sempre resolvido de novo no backend
// (supabase/functions/assinar-plano-nexofy/index.ts), que nunca confia em
// nenhum valor vindo do client.

export const PLANOS_NEXOFY = {
  essencial:    { label: 'Essencial',    valorMensal: 129 },
  profissional: { label: 'Profissional', valorMensal: 249 },
};

export function resolverValorAssinatura(plano, ciclo) {
  const config = PLANOS_NEXOFY[plano];
  if (!config) return null;
  if (ciclo === 'mensal') return config.valorMensal;
  if (ciclo === 'anual') return config.valorMensal * 10;
  return null;
}
