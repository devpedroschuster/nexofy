import { useQuery } from '@tanstack/react-query';
import { financeiroService } from '../services/financeiroService';
import { paraUTC } from '../lib/utils';
import { useAuth } from './useAuth';

export function useFinanceiro(filtros) {
  const { estudioId } = useAuth();

  const query = useQuery({
    queryKey: ['financeiro', estudioId, filtros.mes, filtros.ano],
    queryFn: async () => {
      const inicio = paraUTC(filtros.ano, filtros.mes - 1, 1);
      const fim    = paraUTC(filtros.ano, filtros.mes,     0);

      return await financeiroService.listarMensalidades(inicio, fim);
    },
    enabled: !!estudioId,
    keepPreviousData: true,
    staleTime: 1000 * 60 * 5,
  });

  return {
    mensalidades: query.data || [],
    loading: query.isLoading,
    refetch: query.refetch
  };
}