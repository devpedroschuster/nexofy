import { describe, it, expect } from 'vitest';
import { WEBHOOK_SLO_MS, webhookDentroDoSlo, formatarSegundos } from './saudeSistemaHelpers';

describe('webhookDentroDoSlo', () => {
  it('retorna true quando p95 está dentro da meta de 5s', () => {
    expect(webhookDentroDoSlo(1200)).toBe(true);
  });

  it('retorna true no limite exato de 5000ms', () => {
    expect(webhookDentroDoSlo(WEBHOOK_SLO_MS)).toBe(true);
  });

  it('retorna false quando p95 excede a meta', () => {
    expect(webhookDentroDoSlo(5200)).toBe(false);
  });

  it('retorna false quando não há amostras (null)', () => {
    expect(webhookDentroDoSlo(null)).toBe(false);
  });

  it('retorna false quando o valor é undefined', () => {
    expect(webhookDentroDoSlo(undefined)).toBe(false);
  });
});

describe('formatarSegundos', () => {
  it('formata milissegundos como segundos com uma casa decimal', () => {
    expect(formatarSegundos(1234)).toBe('1.2s');
  });

  it('arredonda pra cima quando aplicável', () => {
    expect(formatarSegundos(1250)).toBe('1.3s');
  });
});
