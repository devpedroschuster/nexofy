import { supabase } from '../lib/supabase';

export const gradeService = {
  async listarProfessores(estudioId) {
    const { data, error } = await supabase
      .from('professores')
      .select('*')
      .eq('estudio_id', estudioId)
      .eq('ativo', true)
      .order('nome');
    if (error) throw error;
    return data;
  },

  async listarModalidades(estudioId) {
    const { data, error } = await supabase
      .from('modalidades')
      .select('*')
      .eq('estudio_id', estudioId)
      .order('nome');
    if (error) throw error;
    return data;
  },

  /**
   * @param {'admin' | 'professor' | 'aluno'} perfil  — vem do useAuth
   * @param {string | null} professorId                — id do professor logado (se perfil === 'professor')
   * @param {string} estudioId                          — vem do useAuth
   */
  async listarGrade(perfil, professorId, estudioId) {
    if (perfil === 'admin') {
      const { data, error } = await supabase
        .from('agenda')
        .select('*, professores(nome), modalidades(id, nome)')
        .eq('estudio_id', estudioId)
        .order('horario', { ascending: true });
      if (error) throw error;
      return data;
    }

    if (perfil !== 'professor' || !professorId) return [];

    const { data: modalidadesDoProf } = await supabase
      .from('modalidades')
      .select('id')
      .eq('estudio_id', estudioId)
      .eq('professor_id', professorId);

    const idsModsDoProf = modalidadesDoProf?.map((m) => m.id) ?? [];

    const [{ data: aulasDiretas, error: errDiretas }, { data: aulasPorMod, error: errMod }] =
      await Promise.all([
        supabase
          .from('agenda')
          .select('*, professores(nome), modalidades(id, nome)')
          .eq('estudio_id', estudioId)
          .eq('professor_id', professorId)
          .order('horario', { ascending: true }),

        idsModsDoProf.length > 0
          ? supabase
              .from('agenda')
              .select('*, professores(nome), modalidades(id, nome)')
              .eq('estudio_id', estudioId)
              .is('professor_id', null)
              .in('modalidade_id', idsModsDoProf)
              .order('horario', { ascending: true })
          : Promise.resolve({ data: [], error: null }),
      ]);

    if (errDiretas) throw errDiretas;
    if (errMod) throw errMod;

    const vistas = new Set();
    return [...(aulasDiretas ?? []), ...(aulasPorMod ?? [])].filter((a) => {
      if (vistas.has(a.id)) return false;
      vistas.add(a.id);
      return true;
    });
  },

  // Sprint 02: estudioId obrigatório em INSERTs de agenda
  async salvarAula(aula, estudioId) {
    if (aula.id) {
      // UPDATE: estudio_id não precisa ser alterado
      const { id, ...payload } = aula;
      const { error } = await supabase
        .from('agenda')
        .update(payload)
        .eq('id', id)
        .eq('estudio_id', estudioId);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('agenda')
        .insert([{ ...aula, estudio_id: estudioId }]);
      if (error) throw error;
    }
    return true;
  },

  // Sprint 03 (split presenca/leads): agenda_excecoes não existe mais —
  // falta de aluno fixo agora é só uma linha em `presenca` (origem='fixo',
  // status='falta_*'), apagada junto com o resto da cascata abaixo.
  async excluirAula(id, estudioId) {
    try {
      await supabase.from('agenda_fixa').delete().eq('aula_id', id);
      await supabase.from('presenca').delete().eq('aula_id', id).eq('estudio_id', estudioId);
      await supabase.from('leads').delete().eq('aula_id', id).eq('estudio_id', estudioId);
      const { error } = await supabase
        .from('agenda')
        .delete()
        .eq('id', id)
        .eq('estudio_id', estudioId);
      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Erro ao excluir aula em cascata:', error);
      throw error;
    }
  },

  async encerrarAula(id, dataEncerramento, estudioId) {
    const { error } = await supabase
      .from('agenda')
      .update({ data_fim: dataEncerramento })
      .eq('id', id)
      .eq('estudio_id', estudioId);
    if (error) throw error;
    return true;
  },

  async listarFeriados(estudioId) {
    const { data, error } = await supabase
      .from('feriados')
      .select('*')
      .eq('estudio_id', estudioId)
      .gte('data', new Date().toISOString().split('T')[0])
      .order('data', { ascending: true });
    if (error) throw error;
    return data;
  },

  // Sprint 02: estudioId obrigatório no INSERT de feriados
  // Sprint 03: filtro de limpeza trocado de data_checkin (só preenchido após
  // check-in confirmado — bug antigo: agendamentos pendentes nunca eram
  // limpos) para data_aula (correto: cobre agendado + presente + falta).
  async cadastrarFeriado(dados, estudioId) {
    const { error } = await supabase
      .from('feriados')
      .insert([{ ...dados, estudio_id: estudioId }]);
    if (error) throw error;

    if (dados.bloqueia_agenda) {
      await supabase
        .from('presenca')
        .delete()
        .eq('estudio_id', estudioId)
        .eq('data_aula', dados.data);

      await supabase
        .from('leads')
        .delete()
        .eq('estudio_id', estudioId)
        .eq('data_visita', dados.data);
    }
  },

  async listarMatriculasFixas(aulasIds = null) {
    // Nota: agenda_fixa não foi confirmado como tendo coluna estudio_id própria;
    // o isolamento aqui já vem indiretamente via aulasIds (originados de
    // consultas em `agenda`, que já é filtrada por estudio_id). Se a tabela
    // tiver a coluna, recomenda-se adicionar o filtro explícito também aqui.
    let query = supabase
      .from('agenda_fixa')
      .select('aula_id, alunos (id, nome_completo, data_inicio_plano, data_fim_plano)');

    if (aulasIds !== null) {
      query = query.in('aula_id', aulasIds);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Erro ao buscar alunos fixos:', error);
      return [];
    }
    return data;
  },
};