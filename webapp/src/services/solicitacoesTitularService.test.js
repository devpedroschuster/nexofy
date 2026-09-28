import { describe, it, expect, beforeEach, vi } from 'vitest';

// PED-261: atender exclusão passa pela Edge Function que anonimiza o aluno
// (nunca por UPDATE direto de status), recusa exige motivo, e o histórico
// só lista pedidos de exclusão já tratados. As regras "de verdade" (quem
// pode, pedido pendente, mensalidade em aberto, carimbo de quem tratou)
// ficam na RPC/trigger — ver
// supabase/migrations/20260928140000_lgpd_atender_exclusao_anonimiza_aluno.sql.

const fromMock = vi.fn();
const invokeMock = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (...args) => fromMock(...args),
    functions: { invoke: (...args) => invokeMock(...args) },
  },
}));

const { solicitacoesTitularService } = await import('./solicitacoesTitularService');

function cadeiaQueRegistra(chamadas, resultado) {
  const cadeia = new Proxy({}, {
    get(_, metodo) {
      if (metodo === 'then') {
        return (resolve) => resolve(resultado);
      }
      return (...args) => {
        chamadas.push([metodo, ...args]);
        return cadeia;
      };
    },
  });
  return cadeia;
}

describe('solicitacoesTitularService (PED-261)', () => {
  beforeEach(() => {
    fromMock.mockReset();
    invokeMock.mockReset();
  });

  it('atenderExclusao chama a Edge Function de anonimização, não um UPDATE direto', async () => {
    invokeMock.mockResolvedValue({ data: { sucesso: true }, error: null });

    await solicitacoesTitularService.atenderExclusao('sol-1', { observacao: '  pedido por e-mail  ' });

    expect(invokeMock).toHaveBeenCalledWith('atender-solicitacao-exclusao', {
      method: 'POST',
      body: { solicitacao_id: 'sol-1', observacao: 'pedido por e-mail' },
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('atenderExclusao repassa a mensagem de negócio da function (ex.: mensalidade pendente)', async () => {
    const mensagem = 'O aluno possui 1 mensalidade(s) pendente(s).';
    invokeMock.mockResolvedValue({
      data: null,
      error: { message: 'Edge Function returned a non-2xx status code', context: { json: async () => ({ error: mensagem }) } },
    });

    await expect(solicitacoesTitularService.atenderExclusao('sol-1')).rejects.toThrow(mensagem);
  });

  it('recusar sem motivo falha antes de tocar o banco', async () => {
    await expect(solicitacoesTitularService.recusar('sol-1', 'est-1', { observacao: '   ' }))
      .rejects.toThrow('Informe o motivo da recusa.');
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('recusar envia só status e motivo — quem/quando é carimbado pelo banco', async () => {
    const chamadas = [];
    fromMock.mockReturnValue(cadeiaQueRegistra(chamadas, { error: null }));

    await solicitacoesTitularService.recusar('sol-1', 'est-1', { observacao: ' cobrança em aberto ' });

    expect(chamadas).toContainEqual(['update', { status: 'recusada', observacao: 'cobrança em aberto' }]);
    expect(chamadas).toContainEqual(['eq', 'estudio_id', 'est-1']);
  });

  it('listarHistorico filtra exclusões já tratadas do estúdio', async () => {
    const chamadas = [];
    fromMock.mockReturnValue(cadeiaQueRegistra(chamadas, { data: [{ id: 'sol-1' }], error: null }));

    const historico = await solicitacoesTitularService.listarHistorico('est-1');

    expect(historico).toEqual([{ id: 'sol-1' }]);
    expect(chamadas).toContainEqual(['eq', 'estudio_id', 'est-1']);
    expect(chamadas).toContainEqual(['eq', 'tipo', 'exclusao']);
    expect(chamadas).toContainEqual(['neq', 'status', 'pendente']);
  });
});
