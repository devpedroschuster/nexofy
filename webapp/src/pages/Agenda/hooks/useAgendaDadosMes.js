import { useQuery } from '@tanstack/react-query';
import { presencaService } from '../../../services/presencaService';
import { useAuth } from '../../../hooks/useAuth';

export function useAgendaDadosMes(currentDate) {
  const { perfil, estudioId } = useAuth();
  const inicio = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1).toISOString().split('T')[0];
  const fim = new Date(currentDate.getFullYear(), currentDate.getMonth() + 2, 0).toISOString().split('T')[0];

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