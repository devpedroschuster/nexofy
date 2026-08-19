/**
 * Extrai o slug do estúdio a partir do hostname atual.
 *
 * Exemplos:
 *   iluminus.nexofy.com.br    → "iluminus"
 *   abc-dance.nexofy.com.br   → "abc-dance"
 *   localhost                 → VITE_DEV_SLUG (dev local) ou null
 *   nexofy.com.br             → null  (raiz sem subdomínio)
 *   nexofy.com.br             → null  (raiz sem subdomínio, TLD composto)
 *
 * VITE_ROOT_DOMAINS: lista separada por vírgula dos domínios raiz da
 * aplicação (sem subdomínio de tenant), ex: "nexofy.com.br".
 * Evita depender de contagem de partes do hostname, que quebra em
 * TLDs compostos (.com.br, .co.uk etc).
 *
 * Aceita `hostname` como parâmetro para facilitar testes sem depender de window.
 */
const ROOT_DOMAINS = (import.meta.env.VITE_ROOT_DOMAINS || 'nexofy.com.br')
  .split(',')
  .map((d) => d.trim())
  .filter(Boolean);

export function getSlugFromHostname(hostname = window.location.hostname) {
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return import.meta.env.VITE_DEV_SLUG ?? null;
  }

  const dominioRaiz = ROOT_DOMAINS.find(
    (raiz) => hostname === raiz || hostname.endsWith(`.${raiz}`)
  );

  // Hostname não bate com nenhum domínio raiz conhecido — configuração
  // inesperada, melhor não adivinhar um slug.
  if (!dominioRaiz) return null;

  // hostname === raiz → acesso direto ao domínio, sem subdomínio de tenant
  if (hostname === dominioRaiz) return null;

  const prefixo = hostname.slice(0, hostname.length - dominioRaiz.length - 1); // remove ".dominioRaiz"
  const slug = prefixo.split('.')[0]; // pega só o primeiro nível (ignora subdomínios extras tipo "preview.")

  if (!slug || slug === 'www') return null;

  return slug;
}