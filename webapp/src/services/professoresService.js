import { supabase } from '../lib/supabase';

export const professoresService = {
  async listar(busca = '', estudioId) {
    let query = supabase
      .from('professores')
      .select('*')
      .order('nome');

      if (estudioId) {
      query = query.eq('estudio_id', estudioId);
    }

    if (busca) {
      query = query.ilike('nome', `%${busca}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  // Sprint 02: estudioId obrigatório no INSERT de professores
  async salvar(professor, estudioId) {
    const payload = {
      nome: professor.nome,
      email: professor.email || null,
      telefone: professor.telefone || null,
      pix_comissao: professor.pix_comissao || null,
      auth_id: professor.auth_id || null
    };

    if (professor.id) {
      // UPDATE: estudio_id não precisa ser alterado
      const { data, error } = await supabase
        .from('professores')
        .update(payload)
        .eq('id', professor.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      const { data, error } = await supabase
        .from('professores')
        .insert([{ ...payload, estudio_id: estudioId }])
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  },

  async alternarStatus(id, novoStatus, estudioId) {
    let query = supabase
      .from('professores')
      .update({ ativo: novoStatus })
      .eq('id', id);

    if (estudioId) {
      query = query.eq('estudio_id', estudioId);
    }

    const { error } = await query;

    if (error) throw error;
    return true;
  }
};