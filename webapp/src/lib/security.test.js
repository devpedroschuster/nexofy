import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateSecurePassword, calcularForcaSenha, senhaAtendeRequisitosMinimos } from './security';

const ALFABETO_SENHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';

describe('generateSecurePassword', () => {
  beforeEach(() => {
    // security.js exige `window.crypto.getRandomValues`; em Node puro não há
    // `window`, mas o WebCrypto nativo (globalThis.crypto) cobre a mesma API.
    globalThis.window = globalThis;
  });

  afterEach(() => {
    delete globalThis.window;
  });

  it('gera senha com o tamanho padrão (12)', () => {
    expect(generateSecurePassword()).toHaveLength(12);
  });

  it('gera senha com o tamanho pedido', () => {
    expect(generateSecurePassword(20)).toHaveLength(20);
  });

  it('usa apenas caracteres do alfabeto permitido', () => {
    const senha = generateSecurePassword(200);
    for (const char of senha) {
      expect(ALFABETO_SENHA).toContain(char);
    }
  });

  it('gera senhas diferentes entre chamadas', () => {
    const senhas = new Set(Array.from({ length: 20 }, () => generateSecurePassword()));
    expect(senhas.size).toBeGreaterThan(1);
  });

  // `undefined` não entra aqui: aciona o valor default (12), não a validação.
  it.each([0, -1, 1.5, 'abc', null])('rejeita length inválido (%p)', (length) => {
    expect(() => generateSecurePassword(length)).toThrow(
      'length deve ser um inteiro positivo.'
    );
  });

  it('lança erro quando window.crypto está indisponível', () => {
    delete globalThis.window;
    expect(() => generateSecurePassword()).toThrow('Web Crypto API indisponível');
  });
});

describe('calcularForcaSenha', () => {
  it('retorna 0 para senha vazia', () => {
    expect(calcularForcaSenha('')).toBe(0);
  });

  it('retorna 1 (fraca) para senha só com minúsculas, mesmo longa', () => {
    expect(calcularForcaSenha('abcdefghijkl')).toBe(1);
  });

  it('pontua maiúscula e número mesmo em senha curta (critérios são independentes)', () => {
    // "Ab1": não atinge o comprimento mínimo, mas ainda soma 2 pontos
    // (maiúscula + número) — cada critério é somado separadamente.
    expect(calcularForcaSenha('Ab1')).toBe(2);
  });

  it('retorna 2 (média) com comprimento mínimo + maiúscula', () => {
    expect(calcularForcaSenha('Abcdefgh')).toBe(2);
  });

  it('retorna 2 (média) com comprimento mínimo + número', () => {
    expect(calcularForcaSenha('abcdefg1')).toBe(2);
  });

  it('retorna 3 (forte) com comprimento mínimo + maiúscula + número + símbolo', () => {
    expect(calcularForcaSenha('Abcdefg1!')).toBe(3);
  });

  it('respeita um comprimento mínimo customizado', () => {
    expect(calcularForcaSenha('Ab1!', 4)).toBe(3);
    expect(calcularForcaSenha('Ab1!', 12)).toBe(2);
  });
});

describe('senhaAtendeRequisitosMinimos', () => {
  it('rejeita senha abaixo do comprimento mínimo', () => {
    expect(senhaAtendeRequisitosMinimos('Ab1!')).toBe(false);
  });

  it('rejeita senha longa mas só com minúsculas (força fraca)', () => {
    expect(senhaAtendeRequisitosMinimos('abcdefghijklmnop')).toBe(false);
  });

  it('aceita senha com comprimento mínimo + maiúscula (força média)', () => {
    expect(senhaAtendeRequisitosMinimos('Abcdefgh')).toBe(true);
  });

  it('aceita senha forte (maiúscula + número + símbolo)', () => {
    expect(senhaAtendeRequisitosMinimos('Abcdefg1!')).toBe(true);
  });
});
