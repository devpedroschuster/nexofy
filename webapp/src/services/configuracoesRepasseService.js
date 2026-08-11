import { supabase } from '../lib/supabase';

export const configuracoesRepasseService = {
  async obter(estudioId) {
    const { data, error } = await supabase
      .from('configuracoes_repasse')
      .select('*')
      .eq('estudio_id', estudioId)
      .maybeSingle(); // FIX: não lança erro quando o estúdio ainda não tem config
    if (error) throw error;
    return data; // null = estúdio novo, sem config ainda
  },

  async salvar(payload, estudioId) {
    if (!estudioId) throw new Error('configuracoesRepasseService.salvar: estudioId é obrigatório');
    const { id, ...rest } = payload;

    const { data, error } = await supabase
      .from('configuracoes_repasse')
      .upsert(
        { ...(id ? { id } : {}), ...rest, estudio_id: estudioId, updated_at: new Date().toISOString() },
        { onConflict: 'estudio_id' } // requer UNIQUE (estudio_id) na tabela
      )
      .select()
      .single();

    if (error) throw error;
    return data;
  },
};