import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { agendamentoService } from '../../../services/agendamentoService';
import { presencaService } from '../../../services/presencaService';
import { leadsService } from '../../../services/leadsService';
import { showToast } from '../../../components/shared/Toast';

// ─────────────────────────────────────────────────────────────────────────
// P0 fix: classificação do motivo de bloqueio (lotação / fora do plano)
// deixa de depender de casar substring em texto livre vindo do banco e
// passa a usar o SQLSTATE estruturado retornado pela trigger/RPC via
// PostgREST (error.code).
//
// Convenção de códigos (faixa livre plpgsql P0001–P0999):
//   P0100 -> turma lotada / limite de capacidade atingido
//   P0101 -> fora do plano do aluno (modalidade não incluída ou limite
//            semanal esgotado)
//
// AÇÃO NECESSÁRIA NO BANCO (fora deste repo — não há migration aqui):
// as triggers que hoje fazem `RAISE EXCEPTION 'Turma lotada...'` (texto
// livre) precisam trocar para:
//   RAISE EXCEPTION 'Turma lotada: ...' USING ERRCODE = 'P0100';
//   RAISE EXCEPTION 'Fora do plano: ...' USING ERRCODE = 'P0101';
// Isso torna o código, não a mensagem, o contrato entre banco e frontend.
// A mensagem continua livre para copy/wording — só passou a ser
// cosmética, nunca lógica de negócio.
// ─────────────────────────────────────────────────────────────────────────

const CODIGO_LOTACAO = 'P0100';
const CODIGO_FORA_DO_PLANO = 'P0101';
const CODIGO_INADIMPLENTE = 'P0102';

// Fallback textual — MANTIDO SÓ enquanto a trigger no banco não for
// migrada para emitir os SQLSTATE acima. Depois da migration, este bloco
// e a função inteira podem ser removidos; deixe o TODO até lá.
// TODO(db): remover este fallback assim que a trigger emitir P0100/P0101.
function classificarMotivoAvisoPorTexto(msgErro) {
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

// Classifica a partir do erro completo (objeto do Supabase/PostgREST),
// não apenas da mensagem. Prioriza o código estruturado; só cai para
// texto se o banco ainda não tiver sido migrado para os novos SQLSTATE.
function classificarMotivoAviso(err) {
  const codigo = err?.code;

  if (codigo === CODIGO_LOTACAO) return 'lotacao';
  if (codigo === CODIGO_FORA_DO_PLANO) return 'plano';
  if (codigo === CODIGO_INADIMPLENTE) return 'inadimplente';

return classificarMotivoAvisoPorTexto(err?.message || '');
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
  const [modalInadimplente, setModalInadimplente] = useState({ isOpen: false, diasAtraso: null, linkPagamento: null });

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

      const motivo = classificarMotivoAviso(err);

if (motivo === 'inadimplente') {
  let detalhe = {};
  try { detalhe = JSON.parse(err.details || '{}'); } catch {}
  setModalInadimplente({
    isOpen: true,
    diasAtraso: detalhe.dias_atraso,
    linkPagamento: detalhe.link_pagamento,
  });
  return false;
}

if (motivo === 'lotacao' || motivo === 'plano') {

        abrirModalAviso = true;
        setModalLotacao({ isOpen: true, msg: msgErro, tipo: motivo });
        return false;
      } else if (err.code === '23505' || msgErro.includes('já possui um agendamento')) {
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
    modalInadimplente, setModalInadimplente,
  };
}