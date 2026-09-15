// Port de webapp/src/pages/Agenda/hooks/useListaPresenca.js — só as funções
// puras (sem Supabase). Módulo folha: zero imports externos de propósito,
// pra poder ser testado em testEnvironment:'node' sem carregar React Native.

export type TipoAlunoChamada = 'fixo' | 'avulso' | 'experimental';
export type StatusPresenca = 'agendado' | 'presente' | 'falta_justificada' | 'falta_nao_avisada';
export type EstadoChamada = 'pendente' | 'presente' | 'falta';

export interface AlunoChamada {
  id_relacao: number;
  aluno_id: number | null;
  lead_id: number | null;
  nome: string;
  tipo: TipoAlunoChamada;
  status: StatusPresenca;
  /** Diz se já existe uma linha em `presencas` pra esse aluno/aula/data — ver deriveEstadoChamada. */
  registroExiste: boolean;
}

// Deriva o estado visual da chamada a partir da linha do aluno. `status`
// sozinho não basta: presencaService.listarChamadaCompleta retorna
// status:'presente' por convenção pra um fixo sem registro do dia, o que
// NÃO é uma confirmação real de presença — só `registroExiste` diz se a
// linha existe de fato.
export function deriveEstadoChamada(aluno: AlunoChamada): EstadoChamada {
  if (aluno.status === 'falta_justificada' || aluno.status === 'falta_nao_avisada') {
    return 'falta';
  }
  if (aluno.registroExiste && aluno.status === 'presente') {
    return 'presente';
  }
  return 'pendente';
}

export interface PayloadPresenca {
  presencaId: number | null;
  alunoId: number | null;
  aulaId: number;
  dataAula: string;
  origem: 'fixo' | 'avulso';
}

// Monta o payload de mutação de presença (check-in ou falta) a partir da
// linha exibida na chamada.
export function montarPayloadPresenca(aluno: AlunoChamada, aulaId: number, dataAula: string): PayloadPresenca {
  return {
    presencaId: aluno.registroExiste ? aluno.id_relacao : null,
    alunoId: aluno.aluno_id,
    aulaId,
    dataAula,
    origem: aluno.tipo === 'fixo' ? 'fixo' : 'avulso',
  };
}
