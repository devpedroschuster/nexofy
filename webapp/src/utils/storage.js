/**
 * Gera uma chave de localStorage com namespace do estúdio,
 * evitando colisões entre diferentes instâncias da aplicação.
 *
 * @param {string} slug  - Slug do estúdio (ex: "meu-estudio")
 * @param {string} key   - Nome da chave (ex: "theme", "notificacoes_resolvidas")
 * @returns {string}     - Chave com namespace (ex: "meu-estudio:theme")
 */
export function storageKey(slug, key) {
  return `${slug}:${key}`;
}