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

  // Bug #2: versão legada com cascata sequencial removida — única implementação
  // válida usa a RPC excluir_aula_cascata, que executa todas as deleções dentro
  // de uma transação Postgres. A versão antiga podia deixar o banco inconsistente
  // se qualquer step falhasse (ex: agenda_fixa e presenca deletadas, agenda não).
  async excluirAula(id, estudioId) {
    const { error } = await supabase.rpc('excluir_aula_cascata', {
      p_aula_id:    id,
      p_estudio_id: estudioId,
    });
    if (error) {
      console.error('Erro ao excluir aula em cascata:', error);
      throw error;
    }
    return true;
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

  // Bug #5: query sem limite de janela temporal substituída por filtro de ±12 meses.
  // A versão anterior buscava todos os feriados históricos sem nenhum limite —
  // um estúdio com anos de operação acumularia centenas de registros trafegados
  // desnecessariamente a cada carregamento da Agenda.
  // O calendário raramente precisa navegar além de 12 meses para frente ou atrás,
  // portanto esta janela cobre todos os casos de uso reais sem desperdício.
  async listarFeriados(estudioId) {
    const hoje = new Date();
    const dozeAtras = new Date(hoje.getFullYear() - 1, hoje.getMonth(), 1)
      .toISOString().split('T')[0];
    const dozeFuturos = new Date(hoje.getFullYear() + 1, hoje.getMonth() + 1, 0)
      .toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('feriados')
      .select('*')
      .eq('estudio_id', estudioId)
      .gte('data', dozeAtras)
      .lte('data', dozeFuturos)
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

  async excluirFeriado(id, estudioId) {
    const { error } = await supabase
      .from('feriados')
      .delete()
      .eq('id', id)
      .eq('estudio_id', estudioId);
    if (error) throw error;
    return true;
  },

  async listarMatriculasFixas(aulasIds = null) {
    // Bug #1: aulasIds=null sem filtro retornaria registros de todos os estúdios.
    // Proteção defensiva: se não vier lista de IDs, retorna vazio.
    // O isolamento por tenant é garantido pelo caller (Agenda.jsx) que deriva
    // aulasIds das aulas já filtradas por estudio_id.
    if (aulasIds === null || aulasIds.length === 0) return [];

    const { data, error } = await supabase
      .from('agenda_fixa')
      .select('aula_id, alunos (id, nome_completo, data_inicio_plano, data_fim_plano)')
      .in('aula_id', aulasIds);

    if (error) {
      console.error('Erro ao buscar alunos fixos:', error);
      return [];
    }
    return data;
  },
};