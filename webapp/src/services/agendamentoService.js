import { supabase } from '../lib/supabase';

// ─────────────────────────────────────────────────────────────────────────
// agendamentoService
//
// Sprint 03 (split presenca/leads): toda a lógica de criar/listar/cancelar
// presença e agendamento foi movida para presencaService (tabela
// `presencas`, plural — nome definitivo, não foi renomeada) e leadsService
// (tabela `leads`). Este arquivo cuida apenas da checagem de disponibilidade
// de vaga (indicador visual de vagas ao preencher o formulário).
//
// A validação real de capacidade/plano no INSERT acontece na RPC
// `agendar_avulso` (presencaService.agendarAvulso), que roda checagem +
// insert na mesma transação e emite P0100/P0101/23505 via error.code.
// A chamada aqui (verificar_disponibilidade_v2) é só leitura/preview —
// nunca bloqueia o agendamento, por isso os erros dela caem no fallback
// isErroTecnico abaixo em vez de abrir o modal de "agendar mesmo assim".
// ─────────────────────────────────────────────────────────────────────────

export const agendamentoService = {

  async verificarDisponibilidade(aulaId, dataAula, alunoId = null, estudioId) {
  if (!aulaId) return null;
  try {
    const { data, error } = await supabase.rpc('verificar_disponibilidade_v2', {
      p_aula_id: aulaId,
      p_data: dataAula,
      p_aluno_id: alunoId || null,
      p_estudio_id: estudioId, // reforça isolamento de tenant, mesmo que a RPC já valide internamente
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