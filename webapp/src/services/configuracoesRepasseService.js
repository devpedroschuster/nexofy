import { supabase } from '../lib/supabase';

export const configuracoesRepasseService = {
  async obter(estudioId) {
    const { data, error } = await supabase
      .from('configuracoes_repasse')
      .select('*')
      .eq('estudio_id', estudioId) // isolamento: alinhado com o padrão já usado nas Edge Functions de repasse
      .single();
    if (error) throw error;
    return data;
  },
  async salvar(payload, estudioId) {
    const { id, ...rest } = payload;
    const { error } = await supabase
      .from('configuracoes_repasse')
      .update({ ...rest, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('estudio_id', estudioId); // isolamento: impede sobrescrever config de outro estúdio mesmo que o id seja descoberto
    if (error) throw error;
    return true;
  },
};