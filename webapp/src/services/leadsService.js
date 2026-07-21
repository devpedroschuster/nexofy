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
  // Bug #1: substituído rollback manual por RPC Postgres (criar_lead_com_presenca).
  // A versão anterior inseria em `leads`, depois em `presenca`, e tentava um
  // DELETE manual em caso de falha — que podia falhar silenciosamente, deixando
  // um lead órfão permanente. A RPC executa ambas as operações dentro de uma
  // única transação: qualquer falha dispara rollback automático e completo.
  async criarLead({ nomeVisitante, telefoneVisitante, aulaId, dataVisita }, estudioId) {
    const { data, error } = await supabase.rpc('criar_lead_com_presenca', {
      p_estudio_id:  estudioId,
      p_nome:        nomeVisitante,
      p_telefone:    telefoneVisitante || null,
      p_aula_id:     aulaId,
      p_data_visita: dataVisita,
    });

    if (error) {
      if (error.code === '23505')
        throw new Error('Este visitante já possui um agendamento nesta turma e data.');
      throw error;
    }
    return data;
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
      })
      .eq('id', leadId)
      .eq('estudio_id', estudioId);

    if (error) throw error;
    return true;
  },
};