import { describe, it, expect } from 'vitest';
import { diasRestantesTrial, chaveMensagemBloqueio } from './trial';

describe('diasRestantesTrial', () => {
  it('retorna null quando não há trial_ends_at', () => {
    expect(diasRestantesTrial(null)).toBeNull();
    expect(diasRestantesTrial(undefined)).toBeNull();
  });

  it('arredonda pra cima os dias restantes até o fim do trial', () => {
    const agora = new Date('2026-09-01T12:00:00Z');
    const fimEm3DiasE1Hora = new Date('2026-09-04T13:00:00Z').toISOString();
    expect(diasRestantesTrial(fimEm3DiasE1Hora, agora)).toBe(4);
  });

  it('retorna 0 no último dia (fim ainda não passou)', () => {
    const agora = new Date('2026-09-01T12:00:00Z');
    const fimDaquiA6Horas = new Date('2026-09-01T18:00:00Z').toISOString();
    expect(diasRestantesTrial(fimDaquiA6Horas, agora)).toBe(1);
  });

  it('retorna negativo quando o trial já expirou', () => {
    const agora = new Date('2026-09-05T12:00:00Z');
    const fimNoPassado = new Date('2026-09-01T12:00:00Z').toISOString();
    expect(diasRestantesTrial(fimNoPassado, agora)).toBe(-4);
  });
});

describe('chaveMensagemBloqueio', () => {
  it('retorna null quando não há statusInfo', () => {
    expect(chaveMensagemBloqueio(null)).toBeNull();
    expect(chaveMensagemBloqueio(undefined)).toBeNull();
  });

  it('retorna "trial_expirado" quando motivo_bloqueio indica trial', () => {
    expect(chaveMensagemBloqueio({ status: 'ativo', motivo_bloqueio: 'trial_expirado' })).toBe('trial_expirado');
  });

  it('retorna o status quando o bloqueio não é por trial', () => {
    expect(chaveMensagemBloqueio({ status: 'suspenso', motivo_bloqueio: 'status' })).toBe('suspenso');
    expect(chaveMensagemBloqueio({ status: 'inativo', motivo_bloqueio: 'status' })).toBe('inativo');
  });
});
