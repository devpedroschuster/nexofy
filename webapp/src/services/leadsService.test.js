import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn(async () => ({ data: { id: 1 }, error: null }));
const updateMock = vi.fn(async () => ({ error: null }));
const fromMock = vi.fn(() => ({
  update: (...args) => {
    updateMock(...args);
    return { eq: () => ({ eq: async () => ({ error: null }) }) };
  },
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (...args) => fromMock(...args),
    rpc: (...args) => rpcMock(...args),
  },
}));

const { leadsService } = await import('./leadsService');

describe('leadsService.criarLeadPublico', () => {
  beforeEach(() => {
    rpcMock.mockClear();
  });

  it('chama a RPC criar_lead_publico (não criar_lead_com_presenca)', async () => {
    // Regressão (PED-192): a captação pública da landing page é anônima
    // (sem sessão) e sem aula/data vinculada. `criar_lead_com_presenca`
    // exige staff autenticado (checa estudio_membros/auth.uid()) e grava
    // NOT NULL em leads.data_visita + presencas.aula_id/data_aula — a
    // chamada pública nunca podia funcionar contra essa RPC.
    await leadsService.criarLeadPublico({
      nomeVisitante: 'Visitante Teste',
      telefoneVisitante: '11999998888',
      estudioId: 'estudio-uuid-123',
    });

    expect(rpcMock).toHaveBeenCalledWith('criar_lead_publico', {
      p_estudio_id: 'estudio-uuid-123',
      p_nome: 'Visitante Teste',
      p_telefone: '11999998888',
    });
  });

  it('propaga o erro da RPC sem mascará-lo', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: new Error('falhou') });

    await expect(
      leadsService.criarLeadPublico({
        nomeVisitante: 'Visitante Teste',
        telefoneVisitante: '11999998888',
        estudioId: 'estudio-uuid-123',
      })
    ).rejects.toThrow('falhou');
  });
});

describe('leadsService.converterLead', () => {
  beforeEach(() => {
    updateMock.mockClear();
    fromMock.mockClear();
  });

  it('atualiza a tabela leads (não presencas) com status_conversao e aluno_convertido_id', async () => {
    // Regressão (PED-195): NovoAluno.jsx chamava um update direto em
    // `presencas` (tabela errada, sem coluna status_conversao, filtrando
    // por um id de `leads`) em vez desta função. Trava aqui para garantir
    // que a implementação correta continua mirando `leads`.
    await leadsService.converterLead('lead-1', 'aluno-1', 'estudio-uuid-123');

    expect(fromMock).toHaveBeenCalledWith('leads');
    expect(updateMock).toHaveBeenCalledWith({
      status_conversao: 'convertido',
      aluno_convertido_id: 'aluno-1',
    });
  });
});
