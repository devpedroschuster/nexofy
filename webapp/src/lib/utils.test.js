import { describe, it, expect } from 'vitest';
import { validarTelefone, calcularIdade, ehMenorDeIdade } from './utils';

describe('validarTelefone', () => {
  it('aceita telefone com 10 dígitos (fixo, com DDD)', () => {
    expect(validarTelefone('5133334444')).toBe(true);
  });

  it('aceita telefone com 11 dígitos (celular, com DDD e 9)', () => {
    expect(validarTelefone('51999990000')).toBe(true);
  });

  it('aceita telefone já formatado com máscara', () => {
    expect(validarTelefone('(51) 99999-0000')).toBe(true);
  });

  it('rejeita texto livre sem dígitos suficientes', () => {
    // Regressão (PED-90): campo WhatsApp aceitava "abcXYZ!@#" sem validação.
    expect(validarTelefone('abcXYZ!@#')).toBe(false);
  });

  it('rejeita string vazia', () => {
    expect(validarTelefone('')).toBe(false);
  });

  it('rejeita quantidade de dígitos fora de 10/11', () => {
    expect(validarTelefone('123')).toBe(false);
    expect(validarTelefone('123456789012')).toBe(false);
  });
});

// PED-170: usadas pra decidir o gate de consentimento do responsável legal
// (menor de 18) — a fronteira exata do aniversário importa, por isso os
// testes de "ontem"/"hoje"/"amanhã" abaixo, em vez de só datas óbvias.
function dataHaAnosAtras(anos, ajusteDias = 0) {
  const hoje = new Date();
  const data = new Date(hoje.getFullYear() - anos, hoje.getMonth(), hoje.getDate() + ajusteDias);
  return data.toISOString().split('T')[0];
}

describe('calcularIdade', () => {
  it('retorna null para ausência ou data inválida', () => {
    expect(calcularIdade(null)).toBeNull();
    expect(calcularIdade(undefined)).toBeNull();
    expect(calcularIdade('')).toBeNull();
    expect(calcularIdade('não-é-data')).toBeNull();
  });

  it('calcula a idade exata no dia do aniversário', () => {
    expect(calcularIdade(dataHaAnosAtras(18))).toBe(18);
  });

  it('ainda não soma o ano quando o aniversário é amanhã', () => {
    expect(calcularIdade(dataHaAnosAtras(18, 1))).toBe(17);
  });

  it('já soma o ano quando o aniversário foi ontem', () => {
    expect(calcularIdade(dataHaAnosAtras(18, -1))).toBe(18);
  });
});

describe('ehMenorDeIdade', () => {
  it('retorna false para ausência de data (idade desconhecida)', () => {
    expect(ehMenorDeIdade(null)).toBe(false);
    expect(ehMenorDeIdade(undefined)).toBe(false);
  });

  it('retorna true para 17 anos completos', () => {
    expect(ehMenorDeIdade(dataHaAnosAtras(17))).toBe(true);
  });

  it('retorna false no dia exato em que completa 18 anos', () => {
    expect(ehMenorDeIdade(dataHaAnosAtras(18))).toBe(false);
  });

  it('retorna true no dia anterior ao 18º aniversário', () => {
    expect(ehMenorDeIdade(dataHaAnosAtras(18, 1))).toBe(true);
  });

  it('retorna false para adulto', () => {
    expect(ehMenorDeIdade('1990-05-20')).toBe(false);
  });
});
