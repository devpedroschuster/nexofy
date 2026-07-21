import { supabase } from '../lib/supabase';

export const espacosService = {
  async listar(estudioId) {
    const { data, error } = await supabase
      .from('espacos')
      .select('*')
      .eq('estudio_id', estudioId)
      .eq('ativo', true)
      .order('ordem', { ascending: true });
    if (error) throw error;
    return data;
  },
};