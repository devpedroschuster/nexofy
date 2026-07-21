import { supabase } from '../lib/supabase';

// ─────────────────────────────────────────────────────────────────────────
// agendamentoService
//
// Sprint 03 (split presenca/leads): toda a lógica de criar/listar/cancelar
// presença e agendamento foi movida para presencaService (tabela `presenca`)
// e leadsService (tabela `leads`). Este arquivo agora cuida apenas da
// checagem de disponibilidade de vaga, que depende da RPC
// verificar_disponibilidade_v2 — pendente de revisão no banco para
// considerar a nova tabela `presenca` em vez da antiga `presencas`.
// ─────────────────────────────────────────────────────────────────────────

export const agendamentoService = {

  async verificarDisponibilidade(aulaId, dataAula, alunoId = null) {
    if (!aulaId) return null;

    try {
      const { data, error } = await supabase.rpc('verificar_disponibilidade_v2', {
        p_aula_id: aulaId,
        p_data: dataAula,
        p_aluno_id: alunoId || null
      });

      if (error) throw error;
      return data;

    } catch (error) {
      console.error("Erro estrutural ao verificar disponibilidade:", error);

      // BUG #10: flag isErroTecnico distingue falha de rede/banco de uma
      // regra de negócio real (turma cheia, plano incompatível).
      // useAgendamento usa essa flag para exibir toast e não bloquear o agendamento.
      return {
        isErroTecnico: true,
        podeAgendarLivremente: false,
        avisoCritico: "Não foi possível verificar as vagas no momento. Verifique sua conexão.",
        capacidadeMax: 0,
        ocupacaoAtual: 0,
        limiteSemanal: 0,
        usoSemanal: 0,
        isLivre: false,
        modNome: 'Indisponível',
        temModalidadeNoPlano: false
      };
    }
  },
};