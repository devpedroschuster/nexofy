import { describe, it, expect } from 'vitest';
import { validarTelefone } from './utils';

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
