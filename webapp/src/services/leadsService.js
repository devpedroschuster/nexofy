import { supabase } from '../lib/supabase';

// ─────────────────────────────────────────────────────────────────────────
// leadsService
//
// Responsável pela tabela `leads` (visitantes em aula experimental).
// O comparecimento efetivo de um lead numa aula vive em `presenca`
// (origem = 'lead', lead_id = leads.id) — ver presencaService.
// ─────────────────────────────────────────────────────────────────────────

const SELECT_BASE =
  'id, nome_visitante, telefone_visitante, data_visita, status_conversao, ' +
  'observacao_lead, aluno_convertido_id, agenda(atividade)';

export const leadsService = {
  // ── CRIAÇÃO ────────────────────────────────────────────────────────────
  // Cria o lead E a linha de agendamento correspondente em `presenca`
  // (origem='lead', status='agendado') numa única chamada — são duas
  // tabelas que precisam nascer juntas para o visitante aparecer na chamada.
  async criarLead({ nomeVisitante, telefoneVisitante, aulaId, dataVisita }, estudioId) {
    const { data: lead, error: errLead } = await supabase
      .from('leads')
      .insert([{
        estudio_id: estudioId,
        nome_visitante: nomeVisitante,
        telefone_visitante: telefoneVisitante || null,
        aula_id: aulaId,
        data_visita: dataVisita,
        status_conversao: 'pendente',
      }])
      .select()
      .single();

    if (errLead) throw errLead;

    const { error: errPresenca } = await supabase
      .from('presenca')
      .insert([{
        estudio_id: estudioId,
        aula_id: aulaId,
        data_aula: dataVisita,
        origem: 'lead',
        lead_id: lead.id,
        status: 'agendado',
      }]);

    if (errPresenca) {
      // Rollback manual: sem o agendamento em presenca, o lead fica órfão
      // (não aparece na chamada). Melhor desfazer do que deixar inconsistente.
      await supabase.from('leads').delete().eq('id', lead.id);
      if (errPresenca.code === '23505') {
        throw new Error('Este visitante já possui um agendamento nesta mesma turma e mesma data.');
      }
      throw errPresenca;
    }

    return lead;
  },

  async listarLeadsPendentes(estudioId) {
    const { data, error } = await supabase
      .from('leads')
      .select(SELECT_BASE)
      .eq('estudio_id', estudioId)
      .eq('status_conversao', 'pendente')
      .order('data_visita', { ascending: false });

    if (error) throw error;
    return data;
  },

  /**
   * Leads pendentes filtrados por mês/ano específico (data da aula experimental).
   * `mes` é 0-indexado (igual ao Date.getMonth()).
   */
  async listarLeadsPendentesPorMes({ ano, mes, estudioId }) {
    const inicio = new Date(ano, mes, 1).toISOString().split('T')[0];
    const fim = new Date(ano, mes + 1, 1).toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('leads')
      .select(SELECT_BASE)
      .eq('estudio_id', estudioId)
      .eq('status_conversao', 'pendente')
      .gte('data_visita', inicio)
      .lt('data_visita', fim)
      .order('data_visita', { ascending: false });

    if (error) throw error;
    return data;
  },

  /**
   * Histórico paginado (modo "Todos os períodos").
   */
  async listarHistoricoLeads({ pageParam = 0, limit = 30, estudioId }) {
    const from = pageParam;
    const to = from + limit - 1;

    const { data, error } = await supabase
      .from('leads')
      .select(SELECT_BASE)
      .eq('estudio_id', estudioId)
      .order('data_visita', { ascending: false })
      .range(from, to);

    if (error) throw error;
    return data;
  },

  /**
   * Histórico filtrado por mês/ano específico (ex: 2026, 5 → Junho/2026).
   * `mes` é 0-indexado (igual ao Date.getMonth()).
   */
  async listarHistoricoLeadsPorMes({ ano, mes, estudioId }) {
    const inicio = new Date(ano, mes, 1).toISOString().split('T')[0];
    const fim = new Date(ano, mes + 1, 1).toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('leads')
      .select(SELECT_BASE)
      .eq('estudio_id', estudioId)
      .gte('data_visita', inicio)
      .lt('data_visita', fim)
      .order('data_visita', { ascending: false });

    if (error) throw error;
    return data;
  },

  /**
   * Retorna todos os registros (apenas campos necessários para agregação)
   * usados para montar o resumo mensal e a lista de meses disponíveis.
   * Mantém payload leve: sem telefone/agenda/observação.
   */
  async listarResumoLeads(estudioId) {
    const { data, error } = await supabase
      .from('leads')
      .select('id, data_visita, status_conversao')
      .eq('estudio_id', estudioId)
      .order('data_visita', { ascending: false });

    if (error) throw error;
    return data;
  },

  /**
   * Resumo mensal apenas dos leads pendentes (para o filtro de período
   * na Visão Ação). Payload leve.
   */
  async listarResumoLeadsPendentes(estudioId) {
    const { data, error } = await supabase
      .from('leads')
      .select('id, data_visita, status_conversao')
      .eq('estudio_id', estudioId)
      .eq('status_conversao', 'pendente')
      .order('data_visita', { ascending: false });

    if (error) throw error;
    return data;
  },

  async atualizarStatusLead(leadId, novoStatus, estudioId) {
    const { error } = await supabase
      .from('leads')
      .update({ status_conversao: novoStatus })
      .eq('id', leadId)
      .eq('estudio_id', estudioId);

    if (error) throw error;
    return true;
  },

  /**
   * Salva/atualiza a observação livre da administração sobre o lead
   * (ex: "não fechou por preço", "aguardando dinheiro").
   */
  async atualizarObservacaoLead(leadId, observacao, estudioId) {
    const { error } = await supabase
      .from('leads')
      .update({ observacao_lead: observacao || null })
      .eq('id', leadId)
      .eq('estudio_id', estudioId);

    if (error) throw error;
    return true;
  },

  /**
   * Marca o lead como convertido e registra o vínculo com o aluno resultante.
   * IMPORTANTE: não altera nenhuma linha em `presenca` — o histórico de
   * comparecimento daquele dia continua vinculado ao lead_id original,
   * mesmo após a conversão (decisão de produto confirmada com o time).
   */
  async converterLead(leadId, alunoId, estudioId) {
    const { error } = await supabase
      .from('leads')
      .update({
        status_conversao: 'convertido',
        aluno_convertido_id: alunoId,
        convertido_em: new Date().toISOString(),
      })
      .eq('id', leadId)
      .eq('estudio_id', estudioId);

    if (error) throw error;
    return true;
  },
};