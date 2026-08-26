import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateSecurePassword } from './security';

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
