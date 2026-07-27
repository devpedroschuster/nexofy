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
// Atenção: esta classificação depende de casar substring da mensagem vinda
// do backend (RPC/trigger). Qualquer alteração no texto dessas mensagens no
// banco precisa vir acompanhada de atualização aqui, senão o agendamento
// passa a ser bloqueado com um toast genérico em vez de oferecer o modal de
// "prosseguir mesmo assim".
function classificarMotivoAviso(msgErro) {
  if (!msgErro) return null;
  const msg = msgErro.toLowerCase();

  if (msg.includes('lotada') || msg.includes('atingiu o limite de capacidade')) {
    return 'lotacao';
  }

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
    _nomeAluno: '',
    _nomeAtividade: '',
  });

  const [savingAgendamento, setSavingAgendamento] = useState(false);
  const [infoVaga, setInfoVaga] = useState(null);
  const [verificandoVaga, setVerificandoVaga] = useState(false);

  const [modalLotacao, setModalLotacao] = useState({ isOpen: false, msg: '', tipo: '' });

  useEffect(() => {
    let cancelado = false;
    let timeoutId;

    async function checarDisponibilidadeLive() {
      const { aula_id, data_aula, tipo, aluno_id } = agendamentoForm;
      if (!aula_id || !data_aula) {
        setInfoVaga(null);
        setVerificandoVaga(false);
        return;
      }

      const prontoParaVerificar =
        tipo === 'visitante' || (tipo === 'cadastrado' && !!aluno_id);
      if (!prontoParaVerificar) {
        setInfoVaga(null);
        setVerificandoVaga(false);
        return;
      }

      setVerificandoVaga(true);
      const alunoIdParaChecar = tipo === 'cadastrado' ? aluno_id : null;
      // Fix: propaga estudioId para a RPC de disponibilidade — as demais
      // chamadas do módulo (agendar_avulso, criar_lead_com_presenca) sempre
      // escopam por estudio_id; esta era a única exceção, o que permitia
      // consultar disponibilidade de uma aula de outro estúdio só com o UUID.
      const info = await agendamentoService.verificarDisponibilidade(
        aula_id, data_aula, alunoIdParaChecar, estudioId
      );
      if (!cancelado) {
        if (info?.isErroTecnico) {
          showToast.error("Erro ao verificar disponibilidade. Tente novamente.");
          setInfoVaga(null);
        } else {
          setInfoVaga(info);
        }
        setVerificandoVaga(false);
      }
    }
    // debounce de 300ms evita disparar uma RPC a cada troca rápida
    // de aula/data/aluno — sem isso, navegar rápido no calendário dispara
    // uma chamada por mudança de seleção, mesmo que só a última importe.
    timeoutId = setTimeout(checarDisponibilidadeLive, 300);

    return () => {
      cancelado = true;
      clearTimeout(timeoutId);
    };
  }, [agendamentoForm.aula_id, agendamentoForm.data_aula, agendamentoForm.aluno_id, agendamentoForm.tipo, estudioId]);

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

    // Fix: retorno consistente (boolean) em vez de `undefined` neste
    // caminho — evita surpresas para qualquer chamador futuro que dependa
    // do valor de retorno.
    if (savingAgendamento) return false;
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
          ignorarAvisos,
        }, estudioId);
      }

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

      setAgendamentoForm({
        tipo: 'cadastrado',
        aluno_id: '',
        nome_visitante: '',
        aula_id: '',
        data_aula: '',
        _nomeAluno: '',
        _nomeAtividade: '',
      });

      queryClient.invalidateQueries({ queryKey: ['agenda'] });
      if (onSucesso) onSucesso();
      return true;
    } catch (err) {
      const msgErro = err.message || '';

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