export const PORT = 4173;

// Estes hosts precisam ser sempre `<slug-real-do-estudio-em-staging>.e2e.test`
// — o app resolve o tenant pelo slug do subdomínio (getSlugFromHostname),
// e um slug genérico que não existe em staging faz a RPC `estudio_publico`
// não achar nada, o que faz Login.jsx falhar antes mesmo de tentar
// autenticar (foi exatamente esse bug que motivou este comentário).
export const TENANT_A_HOST = 'iluminus.e2e.test'; // Estudio Teste 1 (slug: iluminus)
export const TENANT_B_HOST = 'ronaldo.e2e.test'; // Estudio Teste 3 (slug: ronaldo)

export function urlFor(host, path = '/') {
  return `http://${host}:${PORT}${path}`;
}
