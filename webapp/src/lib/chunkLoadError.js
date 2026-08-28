// PED-63: import(...) dinâmico (ex: Despesas.jsx carregando 'xlsx' sob
// demanda) referencia um chunk pelo hash da build atual. Se o Service
// Worker já rodou activate() e purgou o cache da versão anterior (PED-37)
// enquanto esta aba ainda está com o HTML/JS de antes do deploy, esse
// import falha — mas com uma mensagem específica de "não achei o chunk",
// não um erro de rede genérico. As strings variam por navegador; as duas
// primeiras já são usadas no ignoreErrors do Sentry em main.jsx.
const PADROES_FALHA_DE_CHUNK = [
  /Failed to fetch dynamically imported module/i,
  /Loading chunk/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
];

export function ehFalhaDeChunkDesatualizado(erro) {
  const mensagem = erro?.message ?? '';
  return PADROES_FALHA_DE_CHUNK.some((padrao) => padrao.test(mensagem));
}
