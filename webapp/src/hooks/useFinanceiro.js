import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { financeiroService } from '../services/financeiroService';
import { paraUTC } from '../lib/utils';
import { useAuth } from './useAuth';
import { useImpersonation } from '../context/ImpersonationContext';

/**
 * Retorna as mensalidades do mês/ano filtrado para o estúdio autenticado.
 *
 * @param {{ mes: number, ano: number }} filtros - mes é 1-indexed (1-12).
 */
export function useFinanceiro(filtros) {
  const { estudioId } = useAuth();
  const { estudioAtivo } = useImpersonation();
  const idEfetivo = estudioAtivo?.id ?? estudioId;

  const mesValido = Number.isInteger(filtros?.mes) && filtros.mes >= 1 && filtros.mes <= 12;
  const anoValido = Number.isInteger(filtros?.ano);

  const query = useQuery({
    queryKey: ['financeiro', idEfetivo, filtros?.mes, filtros?.ano],
    queryFn: async () => {
      const inicio = paraUTC(filtros.ano, filtros.mes - 1, 1);
      const fim = paraUTC(filtros.ano, filtros.mes, 0);
      return await financeiroService.listarMensalidades(inicio, fim, idEfetivo);
    },
    enabled: !!idEfetivo && mesValido && anoValido,
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 5,
  });

  return { mensalidades: query.data || [], loading: query.isLoading, isFetching: query.isFetching, error: query.error, isError: query.isError, refetch: query.refetch };
}