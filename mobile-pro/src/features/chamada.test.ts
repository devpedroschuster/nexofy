import { deriveEstadoChamada, montarPayloadPresenca, type AlunoChamada } from './chamada';

function alunoBase(overrides: Partial<AlunoChamada> = {}): AlunoChamada {
  return {
    id_relacao: 1,
    aluno_id: 10,
    lead_id: null,
    nome: 'Aluno Teste',
    tipo: 'fixo',
    status: 'presente',
    registroExiste: false,
    ...overrides,
  };
}

describe('deriveEstadoChamada', () => {
  it('retorna "falta" para falta_justificada', () => {
    expect(deriveEstadoChamada(alunoBase({ status: 'falta_justificada', registroExiste: true }))).toBe('falta');
  });

  it('retorna "falta" para falta_nao_avisada', () => {
    expect(deriveEstadoChamada(alunoBase({ status: 'falta_nao_avisada', registroExiste: true }))).toBe('falta');
  });

  it('retorna "presente" só quando o registro existe de fato', () => {
    expect(deriveEstadoChamada(alunoBase({ status: 'presente', registroExiste: true }))).toBe('presente');
  });

  it('retorna "pendente" para um fixo sem registro do dia, mesmo com status implícito "presente"', () => {
    // Caso crítico: presencaService.listarChamadaCompleta usa status:'presente'
    // por convenção pra um fixo sem linha na tabela — isso NÃO é confirmação
    // real de presença. Sem essa distinção, todo fixo apareceria como já
    // confirmado antes do instrutor tocar em qualquer coisa.
    expect(deriveEstadoChamada(alunoBase({ status: 'presente', registroExiste: false }))).toBe('pendente');
  });

  it('retorna "pendente" para um avulso agendado', () => {
    expect(deriveEstadoChamada(alunoBase({ tipo: 'avulso', status: 'agendado', registroExiste: true }))).toBe('pendente');
  });
});

describe('montarPayloadPresenca', () => {
  it('monta payload sem presencaId quando o registro ainda não existe (fixo)', () => {
    const aluno = alunoBase({ tipo: 'fixo', registroExiste: false, id_relacao: 99 });
    expect(montarPayloadPresenca(aluno, 5, '2026-09-20')).toEqual({
      presencaId: null,
      alunoId: 10,
      aulaId: 5,
      dataAula: '2026-09-20',
      origem: 'fixo',
    });
  });

  it('monta payload com presencaId quando o registro já existe (avulso)', () => {
    const aluno = alunoBase({ tipo: 'avulso', registroExiste: true, id_relacao: 42 });
    expect(montarPayloadPresenca(aluno, 5, '2026-09-20')).toEqual({
      presencaId: 42,
      alunoId: 10,
      aulaId: 5,
      dataAula: '2026-09-20',
      origem: 'avulso',
    });
  });

  it('usa origem "avulso" para tipo "experimental" (lead)', () => {
    const aluno = alunoBase({ tipo: 'experimental', registroExiste: true, id_relacao: 7, aluno_id: null, lead_id: 3 });
    expect(montarPayloadPresenca(aluno, 5, '2026-09-20').origem).toBe('avulso');
  });
});
