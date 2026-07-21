import { useQuery } from '@tanstack/react-query';
import { espacosService } from '../../../services/espacosService';

export function useEspacos(estudioId) {
  return useQuery({
    queryKey: ['espacos', estudioId],
    queryFn: () => espacosService.listar(estudioId),
    enabled: !!estudioId,
    staleTime: 1000 * 60 * 10,
  });
}