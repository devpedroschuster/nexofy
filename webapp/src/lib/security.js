// webapp/src/lib/security.js

import { LIMITES } from './constants';

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

/**
 * Avalia a força de uma senha escolhida pelo usuário (não confundir com
 * generateSecurePassword, que gera senhas provisórias aleatórias).
 *
 * Extraído de RedefinirSenha.jsx (onde já era usado no fluxo de redefinição
 * de senha) para ser reaproveitado também no cadastro — antes o cadastro só
 * checava o comprimento mínimo, sem exigir maiúscula/número/símbolo nem
 * mostrar o mesmo medidor de força.
 *
 * Retorna 0 (vazia), 1 (fraca), 2 (média) ou 3 (forte). Critérios: comprimento
 * mínimo, letra maiúscula, número, símbolo — 4 pontos possíveis.
 */
export function calcularForcaSenha(senha, minimo = LIMITES.SENHA_MIN) {
  if (!senha) return 0;
  let pontos = 0;
  if (senha.length >= minimo)     pontos++;
  if (/[A-Z]/.test(senha))        pontos++;
  if (/[0-9]/.test(senha))        pontos++;
  if (/[^A-Za-z0-9]/.test(senha)) pontos++;
  if (pontos <= 1) return 1;
  if (pontos <= 3) return 2;
  return 3;
}

/** Config visual (tokens Midnight Indigo) por nível de força — usada por IndicadorForcaSenha. */
export const FORCA_SENHA_CONFIG = [
  null,
  {
    label:      'Fraca',
    segmentos:  1,
    barClass:   'bg-destructive',
    textoClass: 'text-destructive',
    dica:       'Adicione letras maiúsculas, números e símbolos.',
  },
  {
    label:      'Média',
    segmentos:  2,
    barClass:   'bg-warning',
    textoClass: 'text-warning',
    dica:       'Adicione um símbolo especial para fortalecer.',
  },
  {
    label:      'Forte',
    segmentos:  3,
    barClass:   'bg-success',
    textoClass: 'text-success',
    dica:       null,
  },
];

/**
 * Regra de negócio única para "senha forte o suficiente para ser aceita":
 * comprimento mínimo E força pelo menos "Média" (nível 2 — maiúscula ou
 * número ou símbolo além do comprimento). Usada tanto no cadastro quanto na
 * redefinição de senha, pra manter a mesma exigência nos dois fluxos.
 */
export function senhaAtendeRequisitosMinimos(senha, minimo = LIMITES.SENHA_MIN) {
  return senha.length >= minimo && calcularForcaSenha(senha, minimo) >= 2;
}