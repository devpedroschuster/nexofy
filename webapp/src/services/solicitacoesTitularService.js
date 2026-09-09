// webapp/src/services/solicitacoesTitularService.js
// PED-172 — fila de solicitações de titular (aluno) pra o admin do estúdio
// tratar (hoje só exclusão fica pendente — exportação é self-service e já
// grava 'atendida' direto na Edge Function `exportar-dados-aluno`).
import { supabase } from '../lib/supabase';

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

  async atender(id, estudioId, { observacao } = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase
      .from('solicitacoes_titular')
      .update({
        status: 'atendida',
        observacao,
        atendido_por: session?.user?.id,
        atendido_em: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('estudio_id', estudioId);

    if (error) throw error;
    return true;
  },

  async recusar(id, estudioId, { observacao } = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase
      .from('solicitacoes_titular')
      .update({
        status: 'recusada',
        observacao,
        atendido_por: session?.user?.id,
        atendido_em: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('estudio_id', estudioId);

    if (error) throw error;
    return true;
  },
};
