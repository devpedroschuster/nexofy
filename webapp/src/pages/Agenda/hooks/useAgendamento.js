import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { agendamentoService } from '../../../services/agendamentoService';
import { presencaService } from '../../../services/presencaService';
import { leadsService } from '../../../services/leadsService';
import { showToast } from '../../../components/shared/Toast';

// Classifica o motivo do bloqueio a partir da mensagem de erro do service/RPC.
// Retorna 'lotacao' | 'plano' | null
//
// BUG #8 fix: condições tornadas mais estritas para evitar que erros genéricos
// do PostgREST (ex: "invalid input for column modalidade_id", "constraint on
// plano_id") sejam confundidos com avisos de negócio e abram o modal de
// restrição de plano. Toda comparação é feita em lowercase para uniformidade.
function classificarMotivoAviso(msgErro) {
  if (!msgErro) return null;
  const msg = msgErro.toLowerCase();

  if (msg.includes('lotada') || msg.includes('atingiu o limite de capacidade')) {
    return 'lotacao';
  }

  // Strings vindas especificamente do RPC/trigger de negócio — mais estritas.
  // NÃO usar termos genéricos como 'plano' ou 'modalidade' isolados.
  if (
    msg.includes('limite semanal esgotado') ||
    msg.includes('fora do plano do aluno') ||
    msg.includes('modalidade não está no plano') ||
    msg.includes('plano não inclui esta modalidade')
  ) {
    return 'plano';
  }

  return null;
}

export function useAgendamento(onSucesso, feriados = [], estudioId) {
  const queryClient = useQueryClient();

  const [agendamentoForm, setAgendamentoForm] = useState({
    tipo: 'cadastrado',
    aluno_id: '',
    nome_visitante: '',
    aula_id: '',
    data_aula: '',
    // Campos de exibição — preenchidos pelo modal ao selecionar aluno/aula.
    // Não são enviados ao banco; apenas enriquecem o toast de sucesso.
    _nomeAluno: '',
    _nomeAtividade: '',
  });

  const [savingAgendamento, setSavingAgendamento] = useState(false);
  const [infoVaga, setInfoVaga] = useState(null);
  const [verificandoVaga, setVerificandoVaga] = useState(false);

  // Estado unificado para qualquer modal de aviso que permite prosseguir.
  // tipo: 'lotacao' | 'plano' | ''
  const [modalLotacao, setModalLotacao] = useState({ isOpen: false, msg: '', tipo: '' });

  // BUG #4 fix: sinalizador de cancelamento evita race condition entre requisições concorrentes.
  // BUG #5 fix: retornos antecipados agora também resetam verificandoVaga para false.
  useEffect(() => {
    let cancelado = false;

    async function checarDisponibilidadeLive() {
      const { aula_id, data_aula, tipo, aluno_id } = agendamentoForm;
      if (!aula_id || !data_aula) {
        setInfoVaga(null);
        setVerificandoVaga(false); // BUG #5
        return;
      }

      // Para cadastrado: só verifica DEPOIS que o aluno foi escolhido
      const prontoParaVerificar =
        tipo === 'visitante' || (tipo === 'cadastrado' && !!aluno_id);
      if (!prontoParaVerificar) {
        setInfoVaga(null);
        setVerificandoVaga(false); // BUG #5
        return;
      }

      setVerificandoVaga(true);
      const alunoIdParaChecar = tipo === 'cadastrado' ? aluno_id : null;
      const info = await agendamentoService.verificarDisponibilidade(
        aula_id, data_aula, alunoIdParaChecar
      );
      if (!cancelado) { // BUG #4
        // BUG #10: erro técnico (rede/banco) não deve aparecer como bloqueio de negócio.
        if (info?.isErroTecnico) {
          showToast.error("Erro ao verificar disponibilidade. Tente novamente.");
          setInfoVaga(null);
        } else {
          setInfoVaga(info);
        }
        setVerificandoVaga(false);
      }
    }
    checarDisponibilidadeLive();

    return () => { cancelado = true; }; // BUG #4
  }, [agendamentoForm.aula_id, agendamentoForm.data_aula, agendamentoForm.aluno_id, agendamentoForm.tipo]);

  // BUG #5 fix: ignorarAvisos agora é propagado para presencaService.agendarAvulso,
  // que por sua vez o passa ao banco via RPC (p_ignorar_avisos). Dessa forma a
  // segunda tentativa (confirmação do usuário) realmente bypassa a validação de
  // capacidade/plano no banco, em vez de receber o mesmo erro e reabrir o modal
  // indefinidamente (loop infinito).
  //
  // Adicionalmente, se ignorarAvisos === true e o banco ainda retornar um erro,
  // trata-se de erro real (não de negócio): mostra toast genérico e não reabre
  // o modal — garantindo que o loop seja impossível mesmo em cenários inesperados.
  const handleAgendarAluno = async (e, ignorarAvisos = false) => {
    if (e) e.preventDefault();

    if (agendamentoForm.data_aula) {
      const ehFeriado = feriados.find(
        f => f.data === agendamentoForm.data_aula && f.bloqueia_agenda
      );
      if (ehFeriado) {
        showToast.error(`Agenda bloqueada: ${ehFeriado.descricao} é feriado. Escolha outra data.`);
        return false;
      }
    }

    if (savingAgendamento) return;
    setSavingAgendamento(true);

    let abrirModalAviso = false;

    try {
      if (agendamentoForm.tipo === 'visitante') {
        await leadsService.criarLead({
          nomeVisitante: agendamentoForm.nome_visitante,
          telefoneVisitante: null,
          aulaId: agendamentoForm.aula_id,
          dataVisita: agendamentoForm.data_aula,
        }, estudioId);
      } else {
        await presencaService.agendarAvulso({
          alunoId: agendamentoForm.aluno_id,
          aulaId: agendamentoForm.aula_id,
          dataAula: agendamentoForm.data_aula,
          ignorarAvisos, // BUG #5 fix: propaga o flag para o service/banco
        }, estudioId);
      }

      // ── Toast contextual ───────────────────────────────────────────────
      const nome =
        agendamentoForm.tipo === 'visitante'
          ? agendamentoForm.nome_visitante || 'Visitante'
          : agendamentoForm._nomeAluno || 'Aluno';

      const atividade = agendamentoForm._nomeAtividade || 'aula';

      const dataFormatada = agendamentoForm.data_aula
        ? format(new Date(agendamentoForm.data_aula + 'T12:00:00'), "dd/MM", { locale: ptBR })
        : '';

      const msgSucesso = dataFormatada
        ? `✅ ${nome} agendado para ${atividade} em ${dataFormatada}. Tudo certo!`
        : `✅ ${nome} agendado para ${atividade}. Tudo certo!`;

      showToast.success(msgSucesso);
      // ──────────────────────────────────────────────────────────────────

      setAgendamentoForm({
        tipo: 'cadastrado',
        aluno_id: '',
        nome_visitante: '',
        aula_id: '',
        data_aula: '',
        _nomeAluno: '',
        _nomeAtividade: '',
      });

      // BUG #6 fix: prefixo ['agenda'] cobre toda a árvore de cache da agenda,
      // incluindo ['agenda', estudioId, 'dadosMes', inicio, fim] de useAgendaDadosMes.
      queryClient.invalidateQueries({ queryKey: ['agenda'] });
      if (onSucesso) onSucesso();
      return true;
    } catch (err) {
      const msgErro = err.message || '';

      // BUG #5 fix: se já estávamos em modo "ignorar avisos" e o banco AINDA
      // retornou erro, é um erro real (ex: problema de rede, constraint não
      // relacionada à capacidade). Não reabrir o modal — isso quebraria o loop.
      if (ignorarAvisos) {
        showToast.error('Não foi possível realizar o agendamento. Tente novamente.');
        return false;
      }

      const motivo = classificarMotivoAviso(msgErro);

      if (motivo === 'lotacao' || motivo === 'plano') {
        abrirModalAviso = true;
        setModalLotacao({ isOpen: true, msg: msgErro, tipo: motivo });
        return false;
      } else if (msgErro.includes('já possui um agendamento')) {
        showToast.error('Este aluno já está agendado nesta turma nessa data.');
      } else {
        showToast.error('Não foi possível realizar o agendamento. Tente novamente.');
      }
      return false;
    } finally {
      if (!abrirModalAviso) setSavingAgendamento(false);
    }
  };

  // BUG #12 fix: finally garante reset de savingAgendamento independente do
  // resultado da segunda tentativa, inclusive se handleAgendarAluno lançar
  // uma exceção não tratada.
  const confirmarAgendamentoLotado = async () => {
    setModalLotacao({ isOpen: false, msg: '', tipo: '' });
    try {
      await handleAgendarAluno(null, true);
    } finally {
      setSavingAgendamento(false);
    }
  };

  const cancelarAgendamentoLotado = () => {
    setModalLotacao({ isOpen: false, msg: '', tipo: '' });
    setSavingAgendamento(false);
  };

  return {
    agendamentoForm, setAgendamentoForm, handleAgendarAluno,
    savingAgendamento, infoVaga, verificandoVaga,
    modalLotacao, confirmarAgendamentoLotado, cancelarAgendamentoLotado,
  };
}