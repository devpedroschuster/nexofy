import { describe, it, expect } from 'vitest';
import { montarPayloadPresenca, deriveEstadoChamada } from './useListaPresenca';

describe('montarPayloadPresenca', () => {
  it('aluno fixo sem registro do dia: presencaId null, origem fixo', () => {
    const aluno = {
      id_relacao: 'fixo-1', // id da matrícula fixa (agenda_fixa), não de um registro em presencas
      aluno_id: 'aluno-1',
      tipo: 'fixo',
      registroExiste: false,
    };

    const payload = montarPayloadPresenca(aluno, 'aula-1', '2026-09-05');

    expect(payload).toEqual({
      presencaId: null,
      alunoId: 'aluno-1',
      aulaId: 'aula-1',
      dataAula: '2026-09-05',
      origem: 'fixo',
    });
  });

  it('aluno fixo com registro do dia (ex: já tinha falta registrada): reaproveita o id_relacao como presencaId', () => {
    const aluno = {
      id_relacao: 'presenca-99',
      aluno_id: 'aluno-1',
      tipo: 'fixo',
      registroExiste: true,
    };

    const payload = montarPayloadPresenca(aluno, 'aula-1', '2026-09-05');

    expect(payload).toEqual({
      presencaId: 'presenca-99',
      alunoId: 'aluno-1',
      aulaId: 'aula-1',
      dataAula: '2026-09-05',
      origem: 'fixo',
    });
  });

  it('aluno avulso: sempre tem registro, origem avulso', () => {
    const aluno = {
      id_relacao: 'presenca-50',
      aluno_id: 'aluno-2',
      tipo: 'avulso',
      registroExiste: true,
    };

    const payload = montarPayloadPresenca(aluno, 'aula-2', '2026-09-06');

    expect(payload).toEqual({
      presencaId: 'presenca-50',
      alunoId: 'aluno-2',
      aulaId: 'aula-2',
      dataAula: '2026-09-06',
      origem: 'avulso',
    });
  });

  it('lead (experimental): mesmo tratamento de avulso na montagem do payload', () => {
    const aluno = {
      id_relacao: 'presenca-51',
      aluno_id: null,
      lead_id: 'lead-1',
      tipo: 'experimental',
      registroExiste: true,
    };

    const payload = montarPayloadPresenca(aluno, 'aula-2', '2026-09-06');

    expect(payload).toEqual({
      presencaId: 'presenca-51',
      alunoId: null,
      aulaId: 'aula-2',
      dataAula: '2026-09-06',
      origem: 'avulso',
    });
  });
});

describe('deriveEstadoChamada', () => {
  it('aluno fixo ainda não tocado hoje: presente é só a convenção implícita do backend, não uma confirmação real -> pendente', () => {
    // A própria presencaService.listarChamadaCompleta retorna status:'presente'
    // por convenção pra fixo sem registro do dia (ver comentário do service),
    // mas isso não significa que alguém confirmou presença: registroExiste
    // é o único sinal real de que a linha existe.
    const aluno = { tipo: 'fixo', registroExiste: false, status: 'presente' };
    expect(deriveEstadoChamada(aluno)).toBe('pendente');
  });

  it('aluno fixo com check-in explícito registrado hoje -> presente', () => {
    const aluno = { tipo: 'fixo', registroExiste: true, status: 'presente' };
    expect(deriveEstadoChamada(aluno)).toBe('presente');
  });

  it('aluno fixo com falta não avisada -> falta', () => {
    const aluno = { tipo: 'fixo', registroExiste: true, status: 'falta_nao_avisada' };
    expect(deriveEstadoChamada(aluno)).toBe('falta');
  });

  it('aluno fixo com falta justificada -> falta', () => {
    const aluno = { tipo: 'fixo', registroExiste: true, status: 'falta_justificada' };
    expect(deriveEstadoChamada(aluno)).toBe('falta');
  });

  it('avulso agendado (ainda não confirmado) -> pendente', () => {
    const aluno = { tipo: 'avulso', registroExiste: true, status: 'agendado' };
    expect(deriveEstadoChamada(aluno)).toBe('pendente');
  });

  it('avulso com presença confirmada -> presente', () => {
    const aluno = { tipo: 'avulso', registroExiste: true, status: 'presente' };
    expect(deriveEstadoChamada(aluno)).toBe('presente');
  });

  it('lead (experimental) agendado -> pendente', () => {
    const aluno = { tipo: 'experimental', registroExiste: true, status: 'agendado' };
    expect(deriveEstadoChamada(aluno)).toBe('pendente');
  });
});
