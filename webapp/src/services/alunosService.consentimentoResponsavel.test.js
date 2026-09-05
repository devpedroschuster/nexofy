import { describe, it, expect, beforeEach, vi } from 'vitest';

// PED-170: testa o gate de defesa em profundidade em alunosService (a
// validação "de verdade", que nenhum client pode contornar, é o trigger
// bloquear_dados_sensiveis_menor_sem_consentimento no banco — ver
// supabase/migrations/20260905120000_create_consentimentos_responsavel_legal.sql).
// Mock próprio (arquivo isolado) em vez de estender o fromMock genérico de
// alunosService.test.js, pra não acoplar o roteamento por tabela usado aqui
// aos testes de matricular/renovarPlano que já existem naquele arquivo.

const fromMock = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (...args) => fromMock(...args),
  },
}));

const { alunosService } = await import('./alunosService');

function tabelaAlunos({ dataNascimento }) {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          single: async () => ({ data: { data_nascimento: dataNascimento }, error: null }),
        }),
      }),
    }),
    update: () => ({
      eq: () => ({
        eq: () => ({
          select: () => ({
            single: async () => ({ data: { id: 1, data_nascimento: dataNascimento }, error: null }),
          }),
        }),
      }),
    }),
    insert: () => ({
      select: () => ({
        single: async () => ({ data: { id: 1, data_nascimento: dataNascimento }, error: null }),
      }),
    }),
  };
}

function tabelaConsentimentos({ existe }) {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          limit: async () => ({ data: existe ? [{ id: 'c1' }] : [], error: null }),
          order: () => ({
            limit: () => ({
              maybeSingle: async () => ({
                data: existe ? { id: 'c1', nome_responsavel: 'Maria', parentesco: 'mae' } : null,
                error: null,
              }),
            }),
          }),
        }),
      }),
    }),
    insert: () => ({
      select: () => ({
        single: async () => ({ data: { id: 'c1' }, error: null }),
      }),
    }),
  };
}

function mockarTabelas({ dataNascimento, temConsentimento }) {
  fromMock.mockImplementation((tabela) => (
    tabela === 'alunos'
      ? tabelaAlunos({ dataNascimento })
      : tabelaConsentimentos({ existe: temConsentimento })
  ));
}

const NASCIMENTO_MENOR = `${new Date().getFullYear() - 15}-01-01`;
const NASCIMENTO_MAIOR = '1990-01-01';

describe('alunosService — gate LGPD (PED-170)', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it('bloqueia atualizar observacoes_medicas de menor sem consentimento registrado', async () => {
    mockarTabelas({ dataNascimento: NASCIMENTO_MENOR, temConsentimento: false });

    await expect(
      alunosService.atualizar(1, { observacoes_medicas: 'Alergia a poeira' }, 'estudio-1')
    ).rejects.toThrow(/consentimento do responsável legal/);
  });

  it('permite atualizar observacoes_medicas de menor com consentimento já registrado', async () => {
    mockarTabelas({ dataNascimento: NASCIMENTO_MENOR, temConsentimento: true });

    await expect(
      alunosService.atualizar(1, { observacoes_medicas: 'Alergia a poeira' }, 'estudio-1')
    ).resolves.toBeTruthy();
  });

  it('permite atualizar observacoes_medicas de aluno maior de idade sem exigir consentimento', async () => {
    mockarTabelas({ dataNascimento: NASCIMENTO_MAIOR, temConsentimento: false });

    await expect(
      alunosService.atualizar(1, { observacoes_medicas: 'Sem restrições' }, 'estudio-1')
    ).resolves.toBeTruthy();
  });

  it('não checa consentimento quando o update não toca em campo sensível de saúde', async () => {
    mockarTabelas({ dataNascimento: NASCIMENTO_MENOR, temConsentimento: false });

    await expect(
      alunosService.atualizar(1, { telefone: '11999998888' }, 'estudio-1')
    ).resolves.toBeTruthy();
    // Só a tabela "alunos" (update) deveria ter sido tocada — sem o SELECT de
    // data_nascimento nem a checagem em consentimentos_responsavel_legal.
    expect(fromMock).toHaveBeenCalledWith('alunos');
    expect(fromMock).not.toHaveBeenCalledWith('consentimentos_responsavel_legal');
  });

  it('bloqueia criar aluno menor já com observacoes_medicas preenchidas', async () => {
    mockarTabelas({ dataNascimento: NASCIMENTO_MENOR, temConsentimento: false });

    await expect(
      alunosService.criar(
        { nome_completo: 'Teste', data_nascimento: NASCIMENTO_MENOR, observacoes_medicas: 'x' },
        'estudio-1'
      )
    ).rejects.toThrow(/consentimento do responsável legal/);
  });

  it('permite criar aluno menor sem dado sensível de saúde preenchido', async () => {
    mockarTabelas({ dataNascimento: NASCIMENTO_MENOR, temConsentimento: false });

    await expect(
      alunosService.criar({ nome_completo: 'Teste', data_nascimento: NASCIMENTO_MENOR }, 'estudio-1')
    ).resolves.toBeTruthy();
  });

  it('registrarConsentimentoResponsavel insere um novo registro (nunca update)', async () => {
    mockarTabelas({ dataNascimento: NASCIMENTO_MENOR, temConsentimento: false });

    const resultado = await alunosService.registrarConsentimentoResponsavel(1, 'estudio-1', {
      nome: 'Maria da Silva', cpf: '52998224725', parentesco: 'mae',
    });

    expect(resultado).toEqual({ id: 'c1' });
  });

  it('buscarConsentimentoResponsavel retorna null quando nenhum consentimento existe', async () => {
    mockarTabelas({ dataNascimento: NASCIMENTO_MENOR, temConsentimento: false });

    await expect(
      alunosService.buscarConsentimentoResponsavel(1, 'estudio-1')
    ).resolves.toBeNull();
  });

  it('buscarConsentimentoResponsavel retorna o registro mais recente quando existe', async () => {
    mockarTabelas({ dataNascimento: NASCIMENTO_MENOR, temConsentimento: true });

    await expect(
      alunosService.buscarConsentimentoResponsavel(1, 'estudio-1')
    ).resolves.toEqual({ id: 'c1', nome_responsavel: 'Maria', parentesco: 'mae' });
  });
});
