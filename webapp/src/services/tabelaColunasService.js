// Service layer para `tabela_colunas_config`. Segue o padrão já auditado
// no restante da Nexofy: todo `estudioId` recebido aqui deve ser o
// `idEfetivo` já resolvido pelo chamador (`estudioAtivo?.id ?? estudioId`
// — ver hooks/useTabelaColunas.js), nunca o `estudioId` cru de useAuth()
// quando há impersonation ativa.
//
// O `.eq('estudio_id', estudioId)` explícito em update/delete abaixo é
// defesa em profundidade além da RLS — os dois precisam estar corretos.

import { supabase } from "../lib/supabase";
import {
  buildAlunosColumnRegistry,
  TABLE_COLUMNS_ESTATICO,
  isValidColumnKey,
} from '../lib/tabelaColunas';

/**
 * Monta o catálogo de colunas válido para a tabela: estático para
 * `financeiro`, dinâmico (a partir de `campos_dinamicos`) para `alunos`.
 *
 * @param {string} estudioId
 * @param {'alunos'|'financeiro'} tabela
 */
async function getColumnRegistry(estudioId, tabela) {
  if (tabela === 'financeiro') {
    return TABLE_COLUMNS_ESTATICO.financeiro;
  }

  const { data, error } = await supabase
    .from('campos_dinamicos')
    .select('field_name, label, field_type, is_active')
    .eq('estudio_id', estudioId)
    .eq('entidade', 'aluno')
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Erro ao buscar campos_dinamicos para montar colunas de alunos:', error);
    // Mesmo em erro, 'nome' continua disponível (protegida, não depende do form).
    return buildAlunosColumnRegistry([]);
  }

  return buildAlunosColumnRegistry(data ?? []);
}

/**
 * Busca a configuração de colunas de uma tabela, já com fallback: se
 * alguma coluna do catálogo (campos_dinamicos, no caso de alunos; ou
 * TABLE_COLUMNS_ESTATICO, no caso de financeiro) ainda não tem linha no
 * banco, ela aparece aqui como visível, no final da ordem — assim nada
 * quebra silenciosamente quando o catálogo evolui.
 *
 * Linhas de `tabela_colunas_config` cujo column_key NÃO existe mais no
 * catálogo (campo excluído ou desativado, no caso de alunos) são
 * descartadas do retorno — é assim que a coluna "some" da tabela e da
 * tela de configuração automaticamente, sem precisar de migration.
 *
 * @param {string} estudioId
 * @param {'alunos'|'financeiro'} tabela
 */
export async function getTabelaColunas(estudioId, tabela) {
  if (!estudioId) throw new Error('estudioId é obrigatório.');

  const registry = await getColumnRegistry(estudioId, tabela);
  const registryByKey = new Map(registry.map((c) => [c.key, c]));

  const { data, error } = await supabase
    .from('tabela_colunas_config')
    .select('*')
    .eq('estudio_id', estudioId)
    .eq('tabela', tabela)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Erro ao buscar tabela_colunas_config:', error);
    throw error;
  }

  // Descarta linhas órfãs (column_key que não existe mais no catálogo) e
  // enriquece as válidas com field_type/sortable vindos do catálogo atual
  // (não persistidos em tabela_colunas_config — computados a cada request).
  const validRows = (data ?? [])
    .filter((row) => registryByKey.has(row.column_key))
    .map((row) => {
      const def = registryByKey.get(row.column_key);
      return { ...row, field_type: def.fieldType, sortable: def.sortable, origin: def.origin };
    });

  const known = new Set(validRows.map((row) => row.column_key));
  const missing = registry.filter((c) => !known.has(c.key));

  const maxOrder = validRows.reduce((max, row) => Math.max(max, row.display_order), 0);

  const missingRows = missing.map((c, i) => ({
    id: `pending-${c.key}`,
    estudio_id: estudioId,
    tabela,
    column_key: c.key,
    label: c.defaultLabel,
    is_visible: true,
    display_order: maxOrder + i + 1,
    field_type: c.fieldType,
    sortable: c.sortable,
    origin: c.origin,
  }));

  return [...validRows, ...missingRows];
}

/**
 * Cria no banco as linhas de colunas que ainda não existem para essa
 * tabela (ex.: primeira visita após um campo novo ser criado na Ficha,
 * no caso de alunos). Chamado quando a tela de config detecta linhas
 * "pending-*" vindas de getTabelaColunas.
 *
 * @param {string} estudioId
 * @param {'alunos'|'financeiro'} tabela
 */
export async function ensureTabelaColunasSeeded(estudioId, tabela) {
  if (!estudioId) throw new Error('estudioId é obrigatório.');

  const registry = await getColumnRegistry(estudioId, tabela);

  const { data: existing, error: errExisting } = await supabase
    .from('tabela_colunas_config')
    .select('column_key, display_order')
    .eq('estudio_id', estudioId)
    .eq('tabela', tabela);

  if (errExisting) {
    console.error('Erro ao buscar colunas existentes para seed:', errExisting);
    throw errExisting;
  }

  const known = new Set((existing ?? []).map((r) => r.column_key));
  const maxOrder = (existing ?? []).reduce((max, r) => Math.max(max, r.display_order), 0);

  const toInsert = registry
    .filter((c) => !known.has(c.key) && isValidColumnKey(registry, c.key))
    .map((c, i) => ({
      estudio_id: estudioId,
      tabela,
      column_key: c.key,
      label: c.defaultLabel,
      is_visible: true,
      display_order: maxOrder + i + 1,
    }));

  if (toInsert.length === 0) return { inserted: 0 };

  const { error } = await supabase.from('tabela_colunas_config').insert(toInsert);
  if (error) {
    console.error('Erro ao semear colunas novas:', error);
    throw error;
  }

  return { inserted: toInsert.length };
}

/**
 * @param {string} estudioId
 * @param {string} id
 * @param {string} label
 */
export async function updateTabelaColunaLabel(estudioId, id, label) {
  if (!estudioId) throw new Error('estudioId é obrigatório.');
  if (!label?.trim()) throw new Error('Label inválido.');
  if (id.startsWith('pending-')) {
    throw new Error('Coluna ainda não inicializada. Recarregue a página.');
  }

  const { error } = await supabase
    .from('tabela_colunas_config')
    .update({ label: label.trim() })
    .eq('id', id)
    .eq('estudio_id', estudioId); // defesa em profundidade além da RLS

  if (error) {
    console.error('Erro ao atualizar label da coluna:', error);
    throw error;
  }
}

/**
 * @param {string} estudioId
 * @param {string} id
 * @param {boolean} currentVisible
 * @returns {Promise<boolean>} novo valor de is_visible
 */
export async function toggleTabelaColunaVisivel(estudioId, id, currentVisible) {
  if (!estudioId) throw new Error('estudioId é obrigatório.');
  if (id.startsWith('pending-')) {
    throw new Error('Coluna ainda não inicializada. Recarregue a página.');
  }

  const { error } = await supabase
    .from('tabela_colunas_config')
    .update({ is_visible: !currentVisible })
    .eq('id', id)
    .eq('estudio_id', estudioId);

  if (error) {
    console.error('Erro ao atualizar visibilidade da coluna:', error);
    throw error;
  }

  return !currentVisible;
}

/**
 * @param {string} estudioId
 * @param {string[]} orderedIds
 */
export async function reorderTabelaColunas(estudioId, orderedIds) {
  if (!estudioId) throw new Error('estudioId é obrigatório.');
  if (orderedIds.some((id) => id.startsWith('pending-'))) {
    throw new Error('Existem colunas ainda não inicializadas. Recarregue a página.');
  }
 
  const { error } = await supabase.rpc('reorder_tabela_colunas', {
    p_estudio_id: estudioId,
    p_ids: orderedIds,
  });
 
  if (error) {
    console.error('Erro ao reordenar colunas:', error);
    throw error;
  }
}