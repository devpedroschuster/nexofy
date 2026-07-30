import { supabase } from '../lib/supabase';

export const professoresService = {
  // CR3 FIX: estudioId agora é obrigatório — sem ele a query simplesmente
  // não roda, em vez de silenciosamente listar professores de todos os
  // estúdios da plataforma.
  async listar(busca = '', estudioId) {
    if (!estudioId) return [];

    let query = supabase
      .from('professores')
      .select('id, nome, email, telefone, pix_comissao, auth_id, ativo, estudio_id')
      .eq('estudio_id', estudioId)
      .order('nome');

    if (busca) {
      // Escapa curingas do PostgREST (% e _) para busca literal correta.
      const termo = busca.replace(/[%_]/g, '\\$&');
      query = query.ilike('nome', `%${termo}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  // Sprint 02: estudioId obrigatório no INSERT de professores.
  // CR1 FIX: o UPDATE agora também filtra por estudio_id — antes, qualquer
  // edição de professor era feita apenas por `id`, permitindo sobrescrever
  // dados de professores de outros estúdios (IDOR de escrita).
  async salvar(professor, estudioId) {
    if (!estudioId) throw new Error('estudioId é obrigatório.');

    const payload = {
      nome: professor.nome,
      email: professor.email || null,
      telefone: professor.telefone || null,
      pix_comissao: professor.pix_comissao || null,
      auth_id: professor.auth_id || null,
    };

    if (professor.id) {
      const { data, error } = await supabase
        .from('professores')
        .update(payload)
        .eq('id', professor.id)
        .eq('estudio_id', estudioId)
        .select('id, nome, email, telefone, pix_comissao, auth_id, ativo, estudio_id')
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

  // CR3 FIX: estudioId agora é obrigatório.
  async alternarStatus(id, novoStatus, estudioId) {
    if (!estudioId) throw new Error('estudioId é obrigatório.');

    const { error } = await supabase
      .from('professores')
      .update({ ativo: novoStatus })
      .eq('id', id)
      .eq('estudio_id', estudioId);

    if (error) throw error;
    return true;
  },
};