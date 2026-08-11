// Módulo puro: nenhuma dependência de Supabase/React aqui de propósito —
// facilita testar isolado e deixa claro que isso é dado de apresentação,
// não infraestrutura.

export const SEGMENTOS = [
  { value: 'danca_fitness', label: 'Dança / Fitness' },
  { value: 'escolinha_esportiva', label: 'Escolinha Esportiva' },
];

// Chaves de terminologia válidas — mesma ideia da allowlist de campos
// dinâmicos (CAMPOS_SISTEMA em camposSistema.js): uma lista fechada evita
// `terminologia` virar um jsonb de formato livre e imprevisível na UI.
export const CHAVES_TERMINOLOGIA = ['aluno', 'professor', 'aula', 'turma', 'modalidade'];

// Rótulos-padrão por segmento — usados só como sugestão inicial ao criar
// um tenant novo ou ao trocar de segmento (com confirmação explícita do
// admin, nunca sobrescrita silenciosa). Nunca lido diretamente pela UI:
// sempre passar por resolverRotulo/resolverRotuloPlural, que aplicam o
// fallback em cascata.
export const TERMINOLOGIA_PADRAO = {
  danca_fitness: {
    aluno: 'Aluno',
    professor: 'Professor',
    aula: 'Aula',
    turma: 'Turma',
    modalidade: 'Modalidade',
  },
  escolinha_esportiva: {
    aluno: 'Atleta',
    professor: 'Treinador',
    aula: 'Treino',
    turma: 'Categoria',
    modalidade: 'Modalidade',
  },
};

const SEGMENTO_FALLBACK = 'danca_fitness';

/**
 * Resolve o rótulo de uma chave, com fallback em cascata:
 * terminologia customizada do tenant → padrão do segmento → padrão de
 * danca_fitness → a própria chave (nunca deve faltar rótulo na tela, nem
 * pra tenant antigo sem `terminologia` preenchida nem pra segmento
 * desconhecido).
 *
 * @param {string} chave - uma de CHAVES_TERMINOLOGIA
 * @param {{ terminologia?: Record<string,string>, segmento?: string }} ctx
 * @returns {string}
 */
export function resolverRotulo(chave, { terminologia, segmento } = {}) {
  return (
    terminologia?.[chave]
    ?? TERMINOLOGIA_PADRAO[segmento]?.[chave]
    ?? TERMINOLOGIA_PADRAO[SEGMENTO_FALLBACK][chave]
    ?? chave
  );
}

/**
 * Plural simples (só sufixo 's') — cobre os casos atuais do dicionário.
 * Se algum rótulo custom precisar de plural irregular no futuro, a via é
 * o próprio tenant digitar o plural certo num campo `_plural` dedicado;
 * não complicar agora por um caso hipotético.
 *
 * @param {string} chave
 * @param {{ terminologia?: Record<string,string>, segmento?: string }} ctx
 * @returns {string}
 */
export function resolverRotuloPlural(chave, ctx) {
  return `${resolverRotulo(chave, ctx)}s`;
}

/**
 * Monta a terminologia padrão completa de um segmento — usada ao criar um
 * tenant novo (pré-preenchimento) e ao confirmar troca de segmento no admin
 * (seção 4 do PLANO_ITEM_2.md). Sempre retorna as CHAVES_TERMINOLOGIA
 * inteiras, mesmo que o segmento seja desconhecido (cai no fallback).
 *
 * @param {string} segmento
 * @returns {Record<string,string>}
 */
export function terminologiaPadraoDoSegmento(segmento) {
  const base = TERMINOLOGIA_PADRAO[segmento] ?? TERMINOLOGIA_PADRAO[SEGMENTO_FALLBACK];
  return { ...base };
}

/**
 * Valida se um valor de `segmento` é um dos suportados — espelha o
 * `check (segmento in (...))` da migration, para o client poder recusar
 * cedo (sem round-trip) e mostrar erro tratado em vez de deixar o erro cru
 * do Postgres estourar na UI (checklist item 8.6 do PLANO_ITEM_2.md).
 *
 * @param {string} segmento
 * @returns {boolean}
 */
export function segmentoValido(segmento) {
  return SEGMENTOS.some((s) => s.value === segmento);
}