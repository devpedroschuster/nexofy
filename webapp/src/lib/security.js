// webapp/src/lib/security.js

const ALFABETO_SENHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';

/**
 * Gera uma senha aleatória criptograficamente segura, sem viés estatístico
 * (rejection sampling sobre crypto.getRandomValues).
 *
 * @param {number} length - Tamanho da senha (padrão: 12)
 * @returns {string}
 */
export function generateSecurePassword(length = 12) {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error('generateSecurePassword: length deve ser um inteiro positivo.');
  }
  if (typeof window === 'undefined' || !window.crypto?.getRandomValues) {
    throw new Error('generateSecurePassword: Web Crypto API indisponível neste ambiente.');
  }

  const alfabeto = ALFABETO_SENHA;
  // Maior múltiplo de alfabeto.length que cabe em um byte (0-255).
  // Descartamos bytes acima desse limite para eliminar o modulo bias.
  const limite = Math.floor(256 / alfabeto.length) * alfabeto.length;

  const resultado = [];
  const buffer = new Uint8Array(1);

  while (resultado.length < length) {
    window.crypto.getRandomValues(buffer);
    const byte = buffer[0];
    if (byte < limite) {
      resultado.push(alfabeto[byte % alfabeto.length]);
    }
    // byte >= limite → descartado, tenta de novo (rejection sampling)
  }

  return resultado.join('');
}