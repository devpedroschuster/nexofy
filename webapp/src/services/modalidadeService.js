// webapp/src/services/modalidadeService.js
import { supabase } from '../lib/supabase';

const COLUNAS_MODALIDADE =
  'id, nome, area, professor_id, capacidade_padrao, taxa_professor, taxa_espaco, taxa_direcao, estudio_id, professores(nome)';

export const modalidadeService = {
  async listar(estudioId) {
    const { data, error } = await supabase
      .from('modalidades')
      .select(COLUNAS_MODALIDADE)
      .eq('estudio_id', estudioId)
      .order('area')
      .order('nome');
    if (error) throw error;
    return data;
  },

  async contar(estudioId) {
    const { count, error } = await supabase
      .from('modalidades')
      .select('id', { count: 'exact', head: true })
      .eq('estudio_id', estudioId);
    if (error) throw error;
    return count || 0;
  },

  async buscarPerfil(id, estudioId) {
    const [{ data: horarios, error: errHorarios }, { data: alunos, error: errAlunos }] = await Promise.all([
      supabase
        .from('agenda')
        .select('dia_semana, horario')
        .eq('estudio_id', estudioId)
        .eq('modalidade_id', id)
        .eq('eh_recorrente', true)
        .order('dia_semana')
        .order('horario'),
      supabase
        .from('alunos')
        .select('id, nome_completo, planos(nome)')
        .eq('estudio_id', estudioId)
        .eq('ativo', true)
        .contains('modalidades_selecionadas', [id])
        .order('nome_completo'),
    ]);

    if (errHorarios) throw errHorarios;
    if (errAlunos) throw errAlunos;
    return { horarios: horarios || [], alunos: alunos || [] };
  },

  async salvar(modalidade, estudioId) {
    const totalTaxas =
      Number(modalidade.taxa_professor) + Number(modalidade.taxa_espaco) + Number(modalidade.taxa_direcao);
    if (totalTaxas !== 100) {
      throw new Error('A soma das taxas de repasse deve ser exatamente 100%.');
    }

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
  },
};