import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { financeiroService } from '../services/financeiroService';
import { paraUTC } from '../lib/utils';
import { useAuth } from './useAuth';

/**
 * Retorna as mensalidades do mês/ano filtrado para o estúdio autenticado.
 *
 * @param {{ mes: number, ano: number }} filtros - mes é 1-indexed (1-12).
 */
export function useFinanceiro(filtros) {
  const { estudioId } = useAuth();

  const mesValido = Number.isInteger(filtros?.mes) && filtros.mes >= 1 && filtros.mes <= 12;
  const anoValido = Number.isInteger(filtros?.ano);

  const query = useQuery({
    queryKey: ['financeiro', estudioId, filtros?.mes, filtros?.ano],
    queryFn: async () => {
      // início: dia 1 do mês filtrado (mes-1 = índice 0-based do JS Date)
      const inicio = paraUTC(filtros.ano, filtros.mes - 1, 1);
      // fim: dia 0 do mês seguinte (0-based) = último dia do mês filtrado
      const fim = paraUTC(filtros.ano, filtros.mes, 0);

      return await financeiroService.listarMensalidades(inicio, fim, estudioId);
    },
    enabled: !!estudioId && mesValido && anoValido,
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 5,
  });

  return {
    mensalidades: query.data || [],
    loading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    isError: query.isError,
    refetch: query.refetch,
  };
}