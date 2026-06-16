// webapp/src/lib/resolveEstudio.js

/**
 * Extrai o slug do estúdio a partir do hostname atual.
 *
 * Exemplos:
 *   iluminus.gestao.app    → "iluminus"
 *   abc-dance.gestao.app   → "abc-dance"
 *   localhost              → VITE_DEV_SLUG (dev local) ou null
 *   gestao.app             → null  (raiz sem subdomínio)
 *
 * Aceita `hostname` como parâmetro para facilitar testes sem depender de window.
 */
export function getSlugFromHostname(hostname = window.location.hostname) {
  // Dev local: usa variável de ambiente para simular um estúdio específico
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return import.meta.env.VITE_DEV_SLUG ?? null;
  }

  const parts = hostname.split('.');

  // Precisa de pelo menos 3 partes: slug.dominio.tld
  if (parts.length < 3) return null;

  const slug = parts[0];

  // Slug vazio ou "www" não é um estúdio
  if (!slug || slug === 'www') return null;

  return slug;
}