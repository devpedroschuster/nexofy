// services/espacosService.js
import { supabase } from '../lib/supabase';

const ESPACOS_COLUMNS = 'id, estudio_id, nome, slug, ordem, capacidade, ativo, cor, icone';

function slugify(nome) {
  return nome
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const espacosService = {
  async listar(estudioId, { incluirInativos = false } = {}) {
    if (!estudioId) {
      throw new Error('espacosService.listar: estudioId é obrigatório');
    }

    let query = supabase
      .from('espacos')
      .select(ESPACOS_COLUMNS)
      .eq('estudio_id', estudioId)
      .order('ordem', { ascending: true });

    if (!incluirInativos) {
      query = query.eq('ativo', true);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },

  async criar(estudioId, { nome, capacidade = null, cor = 'primary', icone = 'MapPin' }) {
    if (!estudioId) {
      throw new Error('espacosService.criar: estudioId é obrigatório');
    }
    const nomeLimpo = (nome ?? '').trim();
    if (!nomeLimpo) {
      throw new Error('espacosService.criar: nome é obrigatório');
    }

    // FIX: próxima ordem = maior ordem existente + 1, para o espaço novo
    // aparecer no fim da lista em vez de embaralhar a ordem dos outros.
    const { data: existentes, error: errOrdem } = await supabase
      .from('espacos')
      .select('ordem')
      .eq('estudio_id', estudioId)
      .order('ordem', { ascending: false })
      .limit(1);
    if (errOrdem) throw errOrdem;
    const proximaOrdem = (existentes?.[0]?.ordem ?? 0) + 1;

    const payload = {
      estudio_id: estudioId,
      nome: nomeLimpo,
      slug: slugify(nomeLimpo),
      capacidade: capacidade === '' || capacidade === null ? null : Number(capacidade),
      cor,
      icone,
      ordem: proximaOrdem,
      ativo: true,
    };

    const { data, error } = await supabase
      .from('espacos')
      .insert(payload)
      .select(ESPACOS_COLUMNS)
      .single();
    if (error) throw error;
    return data;
  },

  async atualizar(id, estudioId, dados) {
    if (!id) throw new Error('espacosService.atualizar: id é obrigatório');
    if (!estudioId) throw new Error('espacosService.atualizar: estudioId é obrigatório');

    const payload = {};
    if (dados.nome !== undefined) {
      const nomeLimpo = dados.nome.trim();
      payload.nome = nomeLimpo;
      payload.slug = slugify(nomeLimpo);
    }
    if (dados.capacidade !== undefined) {
      payload.capacidade = dados.capacidade === '' || dados.capacidade === null ? null : Number(dados.capacidade);
    }
    if (dados.cor !== undefined) payload.cor = dados.cor;
    if (dados.icone !== undefined) payload.icone = dados.icone;
    if (dados.ativo !== undefined) payload.ativo = dados.ativo;

    const { data, error } = await supabase
      .from('espacos')
      .update(payload)
      .eq('id', id)
      .eq('estudio_id', estudioId) // FIX: defesa em profundidade além do RLS — nunca atualiza fora do tenant
      .select(ESPACOS_COLUMNS)
      .single();
    if (error) throw error;
    return data;
  },

  // Soft delete: em vez de apagar a linha (o que quebraria aulas/turmas
  // já vinculadas a esse espaço), marcamos como inativo. Espaços inativos
  // somem das opções de "Nova Aula" mas o histórico continua íntegro.
  async desativar(id, estudioId) {
    return this.atualizar(id, estudioId, { ativo: false });
  },

  async reativar(id, estudioId) {
    return this.atualizar(id, estudioId, { ativo: true });
  },
};