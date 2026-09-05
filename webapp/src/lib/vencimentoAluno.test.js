import { describe, it, expect } from 'vitest';
import { calcularStatusVencimento } from './vencimentoAluno';

// `hoje` fixo em todos os testes pra não depender do relógio real (mesmo
// padrão de injeção de dependência de agendarVerificacaoAtiva em
// useSWUpdateNotifier.js).
const HOJE = new Date('2026-09-05T12:00:00Z');

describe('calcularStatusVencimento', () => {
  it('sem data de fim: tom neutro, sem dias', () => {
    expect(calcularStatusVencimento(null, HOJE)).toEqual({
      tone: 'neutral',
      label: 'Sem data',
      dias: null,
    });
  });

  it('data no passado: tom destructive, dias negativo', () => {
    const resultado = calcularStatusVencimento('2026-09-01', HOJE);
    expect(resultado.tone).toBe('destructive');
    expect(resultado.dias).toBe(-4);
    expect(resultado.label).toBe('01/09/26');
  });

  it('vence hoje (0 dias): tom warning', () => {
    const resultado = calcularStatusVencimento('2026-09-05', HOJE);
    expect(resultado.tone).toBe('warning');
    expect(resultado.dias).toBe(0);
  });

  it('vence em exatamente 7 dias: ainda tom warning (limite inclusivo)', () => {
    const resultado = calcularStatusVencimento('2026-09-12', HOJE);
    expect(resultado.tone).toBe('warning');
    expect(resultado.dias).toBe(7);
  });

  it('vence em 8 dias: tom success (fora da janela de alerta)', () => {
    const resultado = calcularStatusVencimento('2026-09-13', HOJE);
    expect(resultado.tone).toBe('success');
    expect(resultado.dias).toBe(8);
  });
});
