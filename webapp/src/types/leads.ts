export interface Lead {
  id: string;
  nome_visitante: string;
  telefone_visitante: string | null;
  data_checkin: string;
  status_conversao: 'novo' | 'contatado' | 'aula_agendada' | 'negociacao' | 'convertido' | 'perdido';
  observacao_lead: string | null;
  proximo_followup_em: string | null;
  nota_followup: string | null;
  agenda: {
    atividade: string
  } | null;
}