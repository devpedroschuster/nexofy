import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn(async () => ({ error: null }));
const fromMock = vi.fn(() => ({
  select: () => ({
    eq: () => ({
      eq: () => ({
        single: async () => ({
          data: { id: 1, nome: 'Plano Mensal', preco: 100, duracao_meses: 1 },
          error: null,
        }),
      }),
    }),
  }),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (...args) => fromMock(...args),
    rpc: (...args) => rpcMock(...args),
  },
}));

const { alunosService } = await import('./alunosService');

describe('alunosService.matricular', () => {
  beforeEach(() => {
    rpcMock.mockClear();
  });

  it('inclui p_estudio_id na chamada RPC matricular_aluno', async () => {
    // Regressão (PED-121): a RPC matricular_aluno() exige 9 parâmetros
    // obrigatórios (sem DEFAULT), incluindo p_estudio_id. Faltar esse
    // parâmetro faz o PostgREST rejeitar a chamada sempre, com o erro
    // mascarado por um toast genérico em NovoAluno.jsx.
    const estudioId = 'estudio-uuid-123';

    await alunosService.matricular(
      'aluno-1',
      1,
      { dataVencimento: '2026-10-01', modalidades: ['Yoga'] },
      estudioId
    );

    expect(rpcMock).toHaveBeenCalledWith(
      'matricular_aluno',
      expect.objectContaining({ p_estudio_id: estudioId })
    );
  });
});
