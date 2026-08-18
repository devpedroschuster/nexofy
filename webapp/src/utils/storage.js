/**
 * Gera uma chave de localStorage com namespace do estúdio,
 * evitando colisões entre diferentes instâncias da aplicação.
 *
 * @param {string} slug  - Slug do estúdio (ex: "meu-estudio")
 * @param {string} key   - Nome da chave (ex: "theme", "notificacoes_resolvidas")
 * @returns {string}     - Chave com namespace (ex: "meu-estudio:theme")
 */
const NAMESPACE_SEM_ESTUDIO = '__sem-estudio__';

export function storageKey(slug, key) {
  if (!key || typeof key !== 'string') {
    throw new Error(`[storageKey] key inválida ("${key}").`);
  }

  if (!slug || typeof slug !== 'string') {
    console.warn(
      `[storageKey] slug ausente ao gerar chave para "${key}". ` +
      'Usando namespace isolado para evitar colisão entre estúdios — ' +
      'idealmente o chamador deveria aguardar o estúdio carregar antes de acessar o storage.'
    );
    return `${NAMESPACE_SEM_ESTUDIO}:${key}`;
  }

  return `${slug}:${key}`;
}