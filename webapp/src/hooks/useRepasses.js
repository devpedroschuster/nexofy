import { useQuery } from '@tanstack/react-query';
import { listarRepassesProfessor } from '../services/repasseService';
import { useAuth } from './useAuth';

export function useRepassesProfessor(professorId, mesAno) {
  const { estudioId } = useAuth();

  return useQuery({
    queryKey: ['repasses', estudioId, professorId, mesAno],
    // FIX (defesa em profundidade): estudioId agora é repassado ao service,
    // que passa a filtrar `.eq('estudio_id', estudioId)` além de confiar na RLS.
    queryFn: () => listarRepassesProfessor(professorId, mesAno, estudioId),
    enabled: !!estudioId && !!professorId && !!mesAno,
    retry: 2,
    staleTime: 1000 * 60 * 5, // 5 min
  });
}