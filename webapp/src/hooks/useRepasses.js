import { useQuery } from '@tanstack/react-query';
import { listarRepassesProfessor } from '../services/repasseService';
import { useAuth } from './useAuth';

export function useRepassesProfessor(professorId, mesAno) {
  const { estudioId } = useAuth();

  return useQuery({
    queryKey: ['repasses', estudioId, professorId, mesAno],
    queryFn: () => listarRepassesProfessor(professorId, mesAno),
    enabled: !!estudioId && !!professorId && !!mesAno,
    retry: 2,
    staleTime: 1000 * 60 * 5, // 5 min
  });
}