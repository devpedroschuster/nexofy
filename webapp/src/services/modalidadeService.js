import { supabase } from '../lib/supabase';

export const modalidadeService = {
  async listar(estudioId) {
    const { data, error } = await supabase
      .from('modalidades')
      .select('*, professores (nome)')
      .eq('estudio_id', estudioId)
      .order('area')
      .order('nome');
    if (error) throw error;
    return data;
  },

  async buscarPerfil(id, estudioId) {
    const { data: horarios } = await supabase
      .from('agenda')
      .select('dia_semana, horario')
      .eq('estudio_id', estudioId)
      .eq('modalidade_id', id)
      .eq('eh_recorrente', true)
      .order('dia_semana')
      .order('horario');

    const { data: alunos, error: errAlunos } = await supabase
      .from('alunos')
      .select('id, nome_completo, planos(nome)')
      .eq('estudio_id', estudioId)
      .eq('ativo', true)
      .contains('modalidades_selecionadas', [id])
      .order('nome_completo');

    if (errAlunos) throw errAlunos;
    return { horarios: horarios || [], alunos: alunos || [] };
  },

  // Sprint 02: estudioId obrigatório no INSERT de modalidades
  async salvar(modalidade, estudioId) {
    const payload = {
      nome: modalidade.nome,
      area: modalidade.area || 'Dança',
      professor_id: modalidade.professor_id || null,
      taxa_professor: Number(modalidade.taxa_professor) || 0,
      taxa_espaco: Number(modalidade.taxa_espaco) || 0,
      taxa_direcao: Number(modalidade.taxa_direcao) || 0,
      capacidade_padrao: modalidade.capacidade_padrao,
    };

    if (modalidade.id) {
      // UPDATE: estudio_id não precisa ser alterado
      const { error } = await supabase
        .from('modalidades')
        .update(payload)
        .eq('id', modalidade.id)
        .eq('estudio_id', estudioId);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('modalidades')
        .insert([{ ...payload, estudio_id: estudioId }]);
      if (error) throw error;
    }
    return true;
  },

  async excluir(id, estudioId) {
    const { error } = await supabase
      .from('modalidades')
      .delete()
      .eq('id', id)
      .eq('estudio_id', estudioId);
    if (error) throw error;
    return true;
  }
};