import { useQuery } from '@tanstack/react-query';
import { gradeService } from '../services/gradeService';
import { useAuth } from './useAuth';

export function useAgenda() {
  const { perfil, professorId, estudioId } = useAuth();

  const queryGrade = useQuery({
    queryKey: ['agenda', perfil, professorId, estudioId],
    queryFn: () => gradeService.listarGrade(perfil, professorId, estudioId),
    enabled: perfil !== null && !!estudioId,
  });

  // Bug #5: staleTime adicionado — sem ele o TanStack Query usa 0ms (padrão),
  // disparando refetch a cada foco de aba. Feriados raramente mudam; 10 minutos
  // de cache eliminam refetches desnecessários sem risco de dado desatualizado.
  const queryFeriados = useQuery({
    queryKey: ['feriados', estudioId],
    queryFn: () => gradeService.listarFeriados(estudioId),
    enabled: !!estudioId,
    staleTime: 1000 * 60 * 10, // 10 minutos — feriados raramente mudam
  });

  const refetch = () => {
    queryGrade.refetch();
    queryFeriados.refetch();
  };

  return {
    aulas: queryGrade.data || [],
    feriados: queryFeriados.data || [],
    loading: queryGrade.isLoading || queryFeriados.isLoading,
    isError: queryGrade.isError || queryFeriados.isError,
    error: queryGrade.error || queryFeriados.error,
    refetch
  };
}