// services/espacosService.js
import { supabase } from '../lib/supabase';

const ESPACOS_COLUMNS = 'id, estudio_id, nome, slug, ordem, capacidade, ativo';

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
};