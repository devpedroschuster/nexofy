// Fonte única de metadados dos estágios do funil de vendas de leads.
// `status_conversao` (banco) continua um campo único: os 2 últimos
// estágios ('convertido'/'perdido') são finais, iguais aos valores que
// já existiam antes do funil.

export const ESTAGIOS_FUNIL = [
  { valor: 'novo', label: 'Novo', tone: 'neutral' },
  { valor: 'contatado', label: 'Contatado', tone: 'info' },
  { valor: 'aula_agendada', label: 'Aula Agendada', tone: 'primary' },
  { valor: 'negociacao', label: 'Em Negociação', tone: 'warning' },
  { valor: 'convertido', label: 'Convertido', tone: 'success' },
  { valor: 'perdido', label: 'Perdido', tone: 'destructive' },
];

export const ESTAGIOS_FINAIS = ['convertido', 'perdido'];

export const ESTAGIOS_ATIVOS = ESTAGIOS_FUNIL
  .map(e => e.valor)
  .filter(valor => !ESTAGIOS_FINAIS.includes(valor));

/**
 * Classifica um follow-up agendado em relação a `agora`, para decidir o
 * badge exibido no card do lead. `proximoFollowupEm` é uma string ISO
 * (timestamptz) ou null quando nenhum follow-up está agendado.
 */
export function classificarFollowup(proximoFollowupEm, agora = new Date()) {
  if (!proximoFollowupEm) return null;

  const data = new Date(proximoFollowupEm);
  if (data.getTime() < agora.getTime()) return 'atrasado';

  const mesmoDia =
    data.getFullYear() === agora.getFullYear() &&
    data.getMonth() === agora.getMonth() &&
    data.getDate() === agora.getDate();

  return mesmoDia ? 'hoje' : 'agendado';
}
