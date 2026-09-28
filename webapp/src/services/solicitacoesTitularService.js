// webapp/src/services/solicitacoesTitularService.js
// PED-172 — fila de solicitações de titular (aluno) pra o admin do estúdio
// tratar (hoje só exclusão fica pendente — exportação é self-service e já
// grava 'atendida' direto na Edge Function `exportar-dados-aluno`).
//
// PED-261 — atender um pedido de exclusão ANONIMIZA o aluno (Edge Function
// `atender-solicitacao-exclusao` → RPC `atender_solicitacao_exclusao`); o
// banco recusa marcar exclusão como 'atendida' por UPDATE direto. Quem
// tratou e quando (`atendido_por`, `atendido_em`, `atendido_por_email`) é
// carimbado por trigger no servidor — o client nunca envia esses campos.
import { supabase } from '../lib/supabase';
import { extrairMensagemErro } from '../lib/edgeFunctionError';

const LIMITE_HISTORICO = 50;

export const solicitacoesTitularService = {
  async listarPendentes(estudioId) {
    const { data, error } = await supabase
      .from('solicitacoes_titular')
      .select('id, tipo, status, observacao, solicitado_em, alunos(id, nome_completo)')
      .eq('estudio_id', estudioId)
      .eq('status', 'pendente')
      .order('solicitado_em', { ascending: true });

    if (error) throw error;
    return data ?? [];
  },

  async listarHistorico(estudioId) {
    const { data, error } = await supabase
      .from('solicitacoes_titular')
      .select('id, tipo, status, observacao, solicitado_em, atendido_em, atendido_por_email, alunos(id, nome_completo)')
      .eq('estudio_id', estudioId)
      .eq('tipo', 'exclusao')
      .neq('status', 'pendente')
      .order('atendido_em', { ascending: false })
      .limit(LIMITE_HISTORICO);

    if (error) throw error;
    return data ?? [];
  },

  async atenderExclusao(id, { observacao } = {}) {
    const { data, error } = await supabase.functions.invoke('atender-solicitacao-exclusao', {
      method: 'POST',
      body: { solicitacao_id: id, observacao: observacao?.trim() || null },
    });

    if (error) {
      throw new Error(await extrairMensagemErro(error, 'Não foi possível anonimizar os dados do aluno.'));
    }
    return data;
  },

  async recusar(id, estudioId, { observacao } = {}) {
    const motivo = observacao?.trim();
    if (!motivo) throw new Error('Informe o motivo da recusa.');

    const { error } = await supabase
      .from('solicitacoes_titular')
      .update({ status: 'recusada', observacao: motivo })
      .eq('id', id)
      .eq('estudio_id', estudioId);

    if (error) throw error;
    return true;
  },
};
