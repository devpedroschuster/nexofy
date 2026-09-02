import { describe, it, expect, vi, beforeEach } from 'vitest';

const selectMock = vi.fn();
const fromMock = vi.fn(() => ({ select: (...args) => selectMock(...args) }));

vi.mock('../lib/supabase', () => ({
  supabase: { from: (...args) => fromMock(...args) },
}));

const { planosService } = await import('./planosService');

describe('planosService.contar', () => {
  beforeEach(() => {
    fromMock.mockClear();
    selectMock.mockClear();
  });

  it('conta planos do estúdio via count exact/head, sem baixar linhas', async () => {
    const eqMock = vi.fn(async () => ({ count: 1, error: null }));
    selectMock.mockReturnValue({ eq: eqMock });

    const total = await planosService.contar('estudio-1');

    expect(fromMock).toHaveBeenCalledWith('planos');
    expect(selectMock).toHaveBeenCalledWith('id', { count: 'exact', head: true });
    expect(eqMock).toHaveBeenCalledWith('estudio_id', 'estudio-1');
    expect(total).toBe(1);
  });

  it('retorna 0 quando count vem null (tabela vazia pro estúdio)', async () => {
    selectMock.mockReturnValue({ eq: vi.fn(async () => ({ count: null, error: null })) });

    expect(await planosService.contar('estudio-1')).toBe(0);
  });
});
