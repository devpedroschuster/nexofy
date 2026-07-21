import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useQueryClient } from '@tanstack/react-query';
import { gradeService } from '../../../services/gradeService';
import { showToast } from '../../../components/shared/Toast';
import { useAuth } from '../../../hooks/useAuth';

export function useGradeMutations({ onSuccess }) {
  const [savingAula, setSavingAula] = useState(false);
  const queryClient = useQueryClient();
  const { estudioId } = useAuth();

  const invalidarCacheAgenda = () => {
    queryClient.invalidateQueries({ queryKey: ['agenda'] });
    queryClient.invalidateQueries({ queryKey: ['feriados'] });
    // BUG #6: era 'presencas-calendario' — chave inexistente.
    // Alinhado com os prefixos reais usados em useAgendaDadosMes e useListaPresenca.
    queryClient.invalidateQueries({ queryKey: ['presencas'] });
  };

  const salvarAula = async (novaAula) => {
    setSavingAula(true);
    try {
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

      await gradeService.salvarAula(payload, estudioId);
      invalidarCacheAgenda();
      showToast.success('Grade atualizada com sucesso!');
      onSuccess?.();
    } catch (err) {
      showToast.error(err.message);
    } finally {
      setSavingAula(false);
    }
  };

  const excluirAula = async (eventoId) => {
    try {
      await gradeService.excluirAula(eventoId, estudioId);
      invalidarCacheAgenda();
      showToast.success('Grade removida com sucesso.');
      onSuccess?.();
    } catch (err) {
      showToast.error(err.message || 'Erro ao excluir.');
    }
  };

  const prepararEncerramento = (dataStart) => {
    const dataClicada = format(dataStart, 'yyyy-MM-dd');
    const dataFormatada = format(dataStart, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    return { dataClicada, dataFormatada };
  };

  const encerrarAula = async (eventoId, dataStart) => {
    try {
      const { dataClicada } = prepararEncerramento(dataStart);
      await gradeService.encerrarAula(eventoId, dataClicada, estudioId);
      invalidarCacheAgenda();
      showToast.success('Turma encerrada a partir desta data.');
      onSuccess?.();
    } catch (err) {
      showToast.error(err.message || 'Erro ao encerrar turma.');
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