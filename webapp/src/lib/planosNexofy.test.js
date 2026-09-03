import { describe, it, expect } from 'vitest';
import { PLANOS_NEXOFY, resolverValorAssinatura } from './planosNexofy';

describe('PLANOS_NEXOFY', () => {
  it('tem os dois planos self-service com os valores da landing', () => {
    expect(PLANOS_NEXOFY.essencial.valorMensal).toBe(129);
    expect(PLANOS_NEXOFY.profissional.valorMensal).toBe(249);
  });
});

describe('resolverValorAssinatura', () => {
  it('retorna o valor mensal cheio pro ciclo mensal', () => {
    expect(resolverValorAssinatura('essencial', 'mensal')).toBe(129);
    expect(resolverValorAssinatura('profissional', 'mensal')).toBe(249);
  });

  it('retorna 10x o valor mensal pro ciclo anual (2 meses grátis)', () => {
    expect(resolverValorAssinatura('essencial', 'anual')).toBe(1290);
    expect(resolverValorAssinatura('profissional', 'anual')).toBe(2490);
  });

  it('retorna null pra plano desconhecido', () => {
    expect(resolverValorAssinatura('rede', 'mensal')).toBeNull();
    expect(resolverValorAssinatura('inexistente', 'mensal')).toBeNull();
  });

  it('retorna null pra ciclo desconhecido', () => {
    expect(resolverValorAssinatura('essencial', 'trimestral')).toBeNull();
  });
});
