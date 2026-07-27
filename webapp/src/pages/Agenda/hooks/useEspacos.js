// hooks/useEspacos.js
import { useQuery } from '@tanstack/react-query';
import { espacosService } from '../../../services/espacosService';

export function useEspacos(estudioId, options = {}) {
  return useQuery({
    queryKey: ['espacos', estudioId, options.incluirInativos ?? false],
    queryFn: () => espacosService.listar(estudioId, options),
    enabled: !!estudioId,
    staleTime: 1000 * 60 * 10,
    retry: 2,
  });
}