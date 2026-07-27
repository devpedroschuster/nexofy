import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { presencaService } from '../../../services/presencaService';
import { useAuth } from '../../../hooks/useAuth';

export function useAgendaDadosMes(currentDate) {
  const { perfil, estudioId } = useAuth();

  // Avisa em dev quando um valor inválido é recebido, em vez de
  // silenciosamente usar a data atual sem nenhum sinal para o chamador.
  const dataSegura = useMemo(() => {
    if (currentDate instanceof Date && !isNaN(currentDate)) return currentDate;
    if (import.meta.env.DEV) {
      console.warn(
        '[useAgendaDadosMes] currentDate inválido recebido:',
        currentDate,
        '— usando data atual como fallback.'
      );
    }
    return new Date();
  }, [currentDate]);

  // Fix: `toISOString().split('T')[0]` convertia a data para UTC antes de
  // extrair a string, o que desloca o dia em -1 para qualquer fuso horário
  // à frente de UTC (ex.: usuário acessando de fora do Brasil). `date-fns
  // format` formata sempre no fuso local do ambiente, sem essa conversão,
  // então o período buscado nunca perde o primeiro/último dia do mês.
  const inicio = useMemo(() =>
    format(new Date(dataSegura.getFullYear(), dataSegura.getMonth() - 1, 1), 'yyyy-MM-dd'),
    [dataSegura]
  );

  const fim = useMemo(() =>
    format(new Date(dataSegura.getFullYear(), dataSegura.getMonth() + 2, 0), 'yyyy-MM-dd'),
    [dataSegura]
  );

  const { data, isLoading } = useQuery({
    queryKey: ['agenda', estudioId, 'dadosMes', inicio, fim],
    // A6: aguarda o perfil estar resolvido antes de disparar queries
    enabled: perfil !== null && !!estudioId,
    queryFn: async () => {
      // Sprint 03 (split presenca/leads): agenda_excecoes não existe mais —
      // falta de fixo agora é só uma linha em `presenca` (origem='fixo',
      // status='falta_*'), já incluída no retorno de listarPeriodo.
      const presencas = await presencaService.listarPeriodo(inicio, fim, estudioId);
      return { presencas: presencas || [] };
    },
    staleTime: 1000 * 60 * 5,
  });

  return {
    presencasCalendario: data?.presencas || [],
    isLoadingMes: isLoading
  };
}