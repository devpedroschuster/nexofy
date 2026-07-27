import { useState, useRef } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useQueryClient } from '@tanstack/react-query';
import { gradeService } from '../../../services/gradeService';
import { showToast } from '../../../components/shared/Toast';
import { useAuth } from '../../../hooks/useAuth';

const HORARIO_REGEX = /^\d{2}:\d{2}/;

export function useGradeMutations({ onSuccess }) {
  const [savingAula, setSavingAula] = useState(false);
  const queryClient = useQueryClient();
  const { estudioId } = useAuth();

  // Guards internos de duplo-clique para excluir/encerrar — não mudam a
  // interface pública do hook (Agenda.jsx chama essas funções diretamente
  // sem controlar loading próprio), só evitam RPCs/updates concorrentes.
  const processandoRef = useRef({ excluir: null, encerrar: null });

  const invalidarCacheAgenda = () => {
    queryClient.invalidateQueries({ queryKey: ['agenda'] });
    queryClient.invalidateQueries({ queryKey: ['feriados'] });
    // BUG #6: era 'presencas-calendario' — chave inexistente.
    // Alinhado com os prefixos reais usados em useAgendaDadosMes e useListaPresenca.
    queryClient.invalidateQueries({ queryKey: ['presencas'] });
  };

  const salvarAula = async (novaAula) => {
    if (savingAula) return; // guard contra duplo-submit

    if (!estudioId) {
      showToast.error("Sessão ainda carregando, tente novamente em instantes.");
      return;
    }

    // Validações de negócio: ficam FORA do try/catch de infraestrutura de
    // propósito, para que a mensagem amigável nunca seja confundida com um
    // erro técnico do Supabase.
    try {
      if (!novaAula.horario || !HORARIO_REGEX.test(novaAula.horario)) {
        // Sem isso, a aula é salva no banco mas desaparece silenciosamente
        // do calendário (calendarioParser descarta horário inválido).
        throw new Error('Informe um horário válido (HH:MM).');
      }

      const payload = {
        atividade: novaAula.atividade || novaAula.nomeModalidade || '',
        modalidade_id: novaAula.modalidadeId || null,
        professor_id: novaAula.professorId || null,
        horario: novaAula.horario,
        capacidade: Number(novaAula.capacidade) || 15,
        eh_recorrente: novaAula.ehRecorrente,
        data_especifica: novaAula.dataEspecifica || null,
        espaco: novaAula.espaco,
        valor_por_aluno: Number(novaAula.valorPorAluno) || 0,
        cor: novaAula.cor || 'laranja',
        ativa: true,
        duracao_minutos: Number(novaAula.duracaoMinutos) || 60,
      };

      if (novaAula.id) {
        payload.id = novaAula.id;
      }

      if (novaAula.ehRecorrente) {
        // Aula recorrente: modalidade e dia da semana são obrigatórios
        if (!payload.modalidade_id) throw new Error('Selecione uma Modalidade.');
        if (!novaAula.diaSemana) throw new Error('Selecione o dia da semana.');
        payload.dia_semana = novaAula.diaSemana.toLowerCase();
      } else {
        // Evento único: apenas nome e data são obrigatórios; professor e modalidade são opcionais
        if (!novaAula.dataEspecifica) throw new Error('Data é obrigatória.');
        if (!payload.atividade.trim()) throw new Error('Informe o nome do evento.');
        const diaCalculado = format(
          new Date(novaAula.dataEspecifica + 'T12:00:00'),
          'eeee',
          { locale: ptBR }
        );
        payload.dia_semana = diaCalculado.toLowerCase();
      }

      setSavingAula(true);
      try {
        await gradeService.salvarAula(payload, estudioId);
        invalidarCacheAgenda();
        showToast.success('Grade atualizada com sucesso!');
        onSuccess?.();
      } catch (err) {
        // Erro técnico de infraestrutura (Supabase/Postgres): não expor
        // detalhes crus de constraint/schema para o usuário final.
        console.error('[useGradeMutations] erro ao salvar aula', err);
        showToast.error('Erro ao salvar. Tente novamente.');
      } finally {
        setSavingAula(false);
      }
    } catch (validationErr) {
      // Erro de validação de negócio: mensagem já é amigável, pode ir direto.
      showToast.error(validationErr.message);
    }
  };

  const excluirAula = async (eventoId) => {
    if (!estudioId) {
      showToast.error("Sessão ainda carregando, tente novamente em instantes.");
      return;
    }
    if (processandoRef.current.excluir === eventoId) return; // guard duplo-clique
    processandoRef.current.excluir = eventoId;
    try {
      await gradeService.excluirAula(eventoId, estudioId);
      invalidarCacheAgenda();
      showToast.success('Grade removida com sucesso.');
      onSuccess?.();
    } catch (err) {
      console.error('[useGradeMutations] erro ao excluir aula', err);
      showToast.error('Erro ao excluir. Tente novamente.');
    } finally {
      processandoRef.current.excluir = null;
    }
  };

  const prepararEncerramento = (dataStart) => {
    const dataClicada = format(dataStart, 'yyyy-MM-dd');
    const dataFormatada = format(dataStart, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    return { dataClicada, dataFormatada };
  };

  const encerrarAula = async (eventoId, dataStart) => {
    if (!estudioId) {
      showToast.error("Sessão ainda carregando, tente novamente em instantes.");
      return;
    }
    if (processandoRef.current.encerrar === eventoId) return; // guard duplo-clique
    processandoRef.current.encerrar = eventoId;
    try {
      const { dataClicada } = prepararEncerramento(dataStart);
      await gradeService.encerrarAula(eventoId, dataClicada, estudioId);
      invalidarCacheAgenda();
      showToast.success('Turma encerrada a partir desta data.');
      onSuccess?.();
    } catch (err) {
      console.error('[useGradeMutations] erro ao encerrar aula', err);
      showToast.error('Erro ao encerrar turma. Tente novamente.');
    } finally {
      processandoRef.current.encerrar = null;
    }
  };

  return {
    salvarAula,
    excluirAula,
    encerrarAula,
    prepararEncerramento,
    savingAula,
  };
}