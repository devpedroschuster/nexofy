import { describe, it, expect, vi, beforeEach } from 'vitest';

const eqEstudioMembros = vi.fn();
const eqAlunos = vi.fn();
const eqProfessores = vi.fn();
const updateEq = vi.fn(async () => ({ error: null }));

const fromMock = vi.fn((table) => {
  if (table === 'estudio_membros') {
    return { select: () => ({ eq: (...args) => eqEstudioMembros(...args) }) };
  }
  if (table === 'alunos') {
    return {
      select: () => ({ eq: (...args) => eqAlunos(...args) }),
      update: () => ({ eq: updateEq }),
    };
  }
  if (table === 'professores') {
    return {
      select: () => ({ eq: (...args) => eqProfessores(...args) }),
      update: () => ({ eq: updateEq }),
    };
  }
  throw new Error(`tabela inesperada: ${table}`);
});

vi.mock('./supabase', () => ({
  supabase: { from: (...args) => fromMock(...args) },
}));

const { resolverRotaPosSenha } = await import('./redefinirSenhaRoteamento');

describe('resolverRotaPosSenha (PED-139)', () => {
  beforeEach(() => {
    fromMock.mockClear();
    eqEstudioMembros.mockReset();
    eqAlunos.mockReset();
    eqProfessores.mockReset();
    updateEq.mockClear();
  });

  it('consulta estudio_membros por user_id, não por auth_id', async () => {
    eqEstudioMembros.mockReturnValue({
      maybeSingle: async () => ({ data: { role: 'admin' }, error: null }),
    });

    await resolverRotaPosSenha('user-uuid-1');

    expect(eqEstudioMembros).toHaveBeenCalledWith('user_id', 'user-uuid-1');
  });

  it('quando a consulta a estudio_membros falha, retorna /login sem tentar fallbacks legados', async () => {
    eqEstudioMembros.mockReturnValue({
      maybeSingle: async () => ({
        data: null,
        error: { code: '42703', message: 'column estudio_membros.auth_id does not exist' },
      }),
    });

    const rota = await resolverRotaPosSenha('user-uuid-2');

    expect(rota).toBe('/login');
    expect(eqAlunos).not.toHaveBeenCalled();
    expect(eqProfessores).not.toHaveBeenCalled();
  });

  it('quando o membro é admin, resolve /dashboard e zera primeiro_acesso em alunos', async () => {
    eqEstudioMembros.mockReturnValue({
      maybeSingle: async () => ({ data: { role: 'admin' }, error: null }),
    });

    const rota = await resolverRotaPosSenha('user-uuid-3');

    expect(rota).toBe('/dashboard');
    expect(fromMock).toHaveBeenCalledWith('alunos');
    expect(updateEq).toHaveBeenCalledWith('auth_id', 'user-uuid-3');
  });
});
