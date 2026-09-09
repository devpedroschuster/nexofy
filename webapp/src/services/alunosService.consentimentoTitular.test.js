import { describe, it, expect, beforeEach, vi } from 'vitest';

// PED-168 (LGPD art. 5º, II / art. 11, I): testa o gate de defesa em
// profundidade em alunosService para o consentimento do PRÓPRIO titular
// (aluno maior de idade, ou sem data de nascimento cadastrada) — a
// validação "de verdade", que nenhum client pode contornar, é o trigger
// bloquear_dados_sensiveis_sem_consentimento_titular no banco (ver
// supabase/migrations/20260908190000_create_consentimento_titular_dados_sensiveis.sql).
// Mock isolado, mesmo padrão de alunosService.consentimentoResponsavel.test.js
// (que cobre o ramo "menor de idade" desse mesmo gate).

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

function tabelaConsentimentoTitular({ existe }) {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          limit: async () => ({ data: existe ? [{ id: 'ct1' }] : [], error: null }),
          order: () => ({
            limit: () => ({
              maybeSingle: async () => ({
                data: existe ? { id: 'ct1', versao: 'v1', aceito_em: '2026-09-08T12:00:00Z' } : null,
                error: null,
              }),
            }),
          }),
        }),
      }),
    }),
    insert: () => ({
      select: () => ({
        single: async () => ({ data: { id: 'ct1' }, error: null }),
      }),
    }),
  };
}

function mockarTabelas({ dataNascimento, temConsentimento }) {
  fromMock.mockImplementation((tabela) => (
    tabela === 'alunos'
      ? tabelaAlunos({ dataNascimento })
      : tabelaConsentimentoTitular({ existe: temConsentimento })
  ));
}

const NASCIMENTO_MAIOR = '1990-01-01';
const NASCIMENTO_MENOR = `${new Date().getFullYear() - 15}-01-01`;

describe('alunosService — gate LGPD consentimento do titular (PED-168)', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it('bloqueia atualizar observacoes_medicas de aluno maior de idade sem consentimento do titular', async () => {
    mockarTabelas({ dataNascimento: NASCIMENTO_MAIOR, temConsentimento: false });

    await expect(
      alunosService.atualizar(1, { observacoes_medicas: 'Alergia a poeira' }, 'estudio-1')
    ).rejects.toThrow(/específico do titular/);
  });

  it('permite atualizar observacoes_medicas de aluno maior de idade com consentimento já registrado', async () => {
    mockarTabelas({ dataNascimento: NASCIMENTO_MAIOR, temConsentimento: true });

    await expect(
      alunosService.atualizar(1, { observacoes_medicas: 'Alergia a poeira' }, 'estudio-1')
    ).resolves.toBeTruthy();
  });

  it('bloqueia atualizar link_anamnese quando data de nascimento não está cadastrada e não há consentimento', async () => {
    mockarTabelas({ dataNascimento: null, temConsentimento: false });

    await expect(
      alunosService.atualizar(1, { link_anamnese: 'https://forms.google.com/x' }, 'estudio-1')
    ).rejects.toThrow(/específico do titular/);
  });

  it('não checa consentimento do titular quando o update não toca em campo sensível de saúde', async () => {
    mockarTabelas({ dataNascimento: NASCIMENTO_MAIOR, temConsentimento: false });

    await expect(
      alunosService.atualizar(1, { telefone: '11999998888' }, 'estudio-1')
    ).resolves.toBeTruthy();
    expect(fromMock).toHaveBeenCalledWith('alunos');
    expect(fromMock).not.toHaveBeenCalledWith('consentimentos_dados_sensiveis_saude');
  });

  it('bloqueia criar aluno maior de idade já com observacoes_medicas preenchidas', async () => {
    mockarTabelas({ dataNascimento: NASCIMENTO_MAIOR, temConsentimento: false });

    await expect(
      alunosService.criar(
        { nome_completo: 'Teste', data_nascimento: NASCIMENTO_MAIOR, observacoes_medicas: 'x' },
        'estudio-1'
      )
    ).rejects.toThrow(/específico do titular/);
  });

  it('bloqueia criar aluno menor de idade já com observacoes_medicas preenchidas com a mensagem do responsável legal', async () => {
    mockarTabelas({ dataNascimento: NASCIMENTO_MENOR, temConsentimento: false });

    await expect(
      alunosService.criar(
        { nome_completo: 'Teste', data_nascimento: NASCIMENTO_MENOR, observacoes_medicas: 'x' },
        'estudio-1'
      )
    ).rejects.toThrow(/consentimento do responsável legal/);
  });

  it('registrarConsentimentoTitular insere um novo registro (nunca update)', async () => {
    mockarTabelas({ dataNascimento: NASCIMENTO_MAIOR, temConsentimento: false });

    const resultado = await alunosService.registrarConsentimentoTitular(1, 'estudio-1');

    expect(resultado).toEqual({ id: 'ct1' });
  });

  it('buscarConsentimentoTitular retorna null quando nenhum consentimento existe', async () => {
    mockarTabelas({ dataNascimento: NASCIMENTO_MAIOR, temConsentimento: false });

    await expect(
      alunosService.buscarConsentimentoTitular(1, 'estudio-1')
    ).resolves.toBeNull();
  });

  it('buscarConsentimentoTitular retorna o registro mais recente quando existe', async () => {
    mockarTabelas({ dataNascimento: NASCIMENTO_MAIOR, temConsentimento: true });

    await expect(
      alunosService.buscarConsentimentoTitular(1, 'estudio-1')
    ).resolves.toEqual({ id: 'ct1', versao: 'v1', aceito_em: '2026-09-08T12:00:00Z' });
  });
});
