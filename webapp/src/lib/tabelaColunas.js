// lib/tabelaColunas.js
//
// Catálogo de colunas disponíveis nas tabelas configuráveis (Alunos e
// Financeiro).
//
// Isso NÃO é o que decide o que é exibido — quem decide é
// `tabela_colunas_config` no banco (visibilidade + ordem, editável pelo
// admin). Este arquivo é o "catálogo" de colunas que existem de fato,
// usado para:
//   - popular a tela de configuração com labels padrão / seed
//   - validar que column_key salvo no banco corresponde a algo real
//   - manter num só lugar as chaves que os componentes de tabela conhecem
//
// Colunas "Nº" e "Ações" não entram aqui: são fixas, não configuráveis.
//
// IMPORTANTE — Alunos x Financeiro têm origens diferentes:
//   - `financeiro`: catálogo ESTÁTICO (abaixo), colunas de sistema/pagamento.
//   - `alunos`: catálogo DINÂMICO, construído a partir de `campos_dinamicos`
//     (mesma fonte que a Ficha de Cadastro usa). Exceto as 4 colunas de
//     negócio fixas (ver ALUNOS_COLUNAS_FIXAS abaixo — "Aluno" composta
//     de avatar+nome+email, Plano/Cargo, Status, Vencimento), que sempre
//     estão presentes e têm render próprio, não vindo de campos_dinamicos.

/** @typedef {'text'|'boolean'|'file'|'select'|'number'} FormFieldType */

/**
 * @typedef {Object} ColumnDefinition
 * @property {string} key
 * @property {string} defaultLabel
 * @property {boolean} [sortable] - true se a coluna aceita ordenação por clique no header
 * @property {FormFieldType} [fieldType] - apenas para colunas de origem dinâmica (Alunos)
 */

/**
 * Linha mínima de `campos_dinamicos` necessária para montar o registro de Alunos.
 * @typedef {Object} CampoDinamicoRow
 * @property {string} field_name
 * @property {string} label
 * @property {string} field_type
 * @property {boolean} is_active
 */

export const TABLE_KEYS = /** @type {const} */ (['alunos', 'financeiro']);

// Tipos de campo reconhecidos pelo renderer de célula genérico. Qualquer
// field_type fora dessa lista cai em 'text' (mesmo comportamento de
// fallback do catálogo original do FutSUL).
const KNOWN_FIELD_TYPES = ['text', 'boolean', 'file', 'select', 'number'];

// Financeiro não vem de campos_dinamicos — catálogo fixo em código.
// Estrutura de cobrança é a mesma em qualquer segmento (ver seção 4 do
// plano geral), então não há necessidade de catálogo dinâmico aqui.
// Financeiro não vem de campos_dinamicos — catálogo fixo em código.
// Estrutura de cobrança é a mesma em qualquer segmento (ver seção 4 do
// plano geral), então não há necessidade de catálogo dinâmico aqui.
// Ordem/labels espelham exatamente a tabela real de Financeiro.jsx.
export const TABLE_COLUMNS_ESTATICO = {
  financeiro: [
    { key: 'aluno', defaultLabel: 'Aluno', sortable: true, origin: 'fixed' },
    { key: 'vencimento', defaultLabel: 'Vencimento', sortable: true, origin: 'fixed' },
    { key: 'valor', defaultLabel: 'Valor', sortable: true, origin: 'fixed' },
    { key: 'forma_pagamento', defaultLabel: 'Forma Pag.', origin: 'fixed' },
    { key: 'data_pagamento', defaultLabel: 'Dt. Pagamento', sortable: true, origin: 'fixed' },
    { key: 'status', defaultLabel: 'Status', origin: 'fixed' },
  ],
};

export const TABLE_LABELS = {
  alunos: 'Tabela de Alunos',
  financeiro: 'Tabela Financeiro',
};

// Colunas fixas de negócio de Alunos: NÃO vêm de campos_dinamicos (são
// compostas — avatar+nome+email, badges de status, cálculo de
// vencimento — com lógica de negócio própria que já vive em Alunos.jsx).
// Entram no catálogo para serem configuráveis (visibilidade/ordem) como
// o restante, mas seu render é resolvido por RENDERERS_FIXOS dentro de
// Alunos.jsx, não por renderCelula genérico (ver components/tabela/CelulaDinamica.jsx).
//
// IMPORTANTE: estes keys ('aluno', 'plano_cargo', 'status', 'vencimento')
// são reservados — um campo dinâmico com field_name igual a algum destes
// é filtrado/ignorado em buildAlunosColumnRegistry (defesa em profundidade;
// a validação primária de colisão deve viver na allowlist de campos de
// sistema do core, junto com a proteção que a Ficha de Cadastro já usa).
export const ALUNOS_COLUNAS_FIXAS = [
  { key: 'aluno', defaultLabel: 'Aluno', sortable: true, origin: 'fixed' },
  { key: 'plano_cargo', defaultLabel: 'Plano / Cargo', sortable: false, origin: 'fixed' },
  { key: 'status', defaultLabel: 'Status', sortable: false, origin: 'fixed' },
  { key: 'vencimento', defaultLabel: 'Vencimento', sortable: false, origin: 'fixed' },
];

const CHAVES_FIXAS_RESERVADAS = new Set(ALUNOS_COLUNAS_FIXAS.map((c) => c.key));

/**
 * Constrói o catálogo de colunas de Alunos: as 4 colunas fixas de negócio
 * (sempre presentes, nessa ordem por padrão) seguidas das colunas
 * dinâmicas ativas de `campos_dinamicos`. Campos inativos
 * (`is_active: false`) não viram coluna — o mesmo efeito de "sumir da
 * tabela" que a exclusão do campo tem. Um campo dinâmico cujo
 * `field_name` colida com uma chave fixa reservada é ignorado (defesa em
 * profundidade — não deveria acontecer se a allowlist de campos de
 * sistema do core estiver correta).
 *
 * @param {CampoDinamicoRow[]} camposDinamicos
 * @returns {ColumnDefinition[]}
 */
export function buildAlunosColumnRegistry(camposDinamicos) {
  const registry = ALUNOS_COLUNAS_FIXAS.map((c) => ({ ...c }));

  for (const campo of camposDinamicos ?? []) {
    if (CHAVES_FIXAS_RESERVADAS.has(campo.field_name)) continue; // reservado, ignora
    if (!campo.is_active) continue; // inativo = não vira coluna

    const fieldType = KNOWN_FIELD_TYPES.includes(campo.field_type)
      ? campo.field_type
      : 'text';

    registry.push({
      key: campo.field_name,
      defaultLabel: campo.label,
      sortable: fieldType === 'text' || fieldType === 'number',
      fieldType,
      origin: 'dynamic',
    });
  }

  return registry;
}

/**
 * @param {ColumnDefinition[]} registry
 * @param {string} columnKey
 * @returns {boolean}
 */
export function isValidColumnKey(registry, columnKey) {
  return registry.some((c) => c.key === columnKey);
}