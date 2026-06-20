import { supabase } from '../lib/supabase';

export const planosService = {
  async listar(estudioId) {
    const { data, error } = await supabase
      .from('planos')
      .select('*')
      .eq('estudio_id', estudioId)
      .order('id', { ascending: true });

    if (error) throw error;
    return data;
  },

  // Sprint 02: estudioId obrigatório no INSERT de planos
  async salvar(plano, estudioId) {
    const payload = {
      nome: plano.nome,
      preco: plano.preco,
      frequencia_semanal: plano.frequencia_semanal,
      duracao_meses: Number(plano.duracao_meses),
      regras_acesso: plano.regras_acesso || []
    };

    if (plano.id) {
      // UPDATE: estudio_id não precisa ser alterado
      const { data, error } = await supabase
        .from('planos')
        .update(payload)
        .eq('id', plano.id)
        .eq('estudio_id', estudioId)
        .select();
      if (error) throw error;
      return data;
    } else {
      const { data, error } = await supabase
        .from('planos')
        .insert([{ ...payload, estudio_id: estudioId }])
        .select();
      if (error) throw error;
      return data;
    }
  },

  async excluir(id, estudioId) {
    const { error } = await supabase
      .from('planos')
      .delete()
      .eq('id', id)
      .eq('estudio_id', estudioId);
    if (error) throw error;
    return true;
  }
};