// webapp/src/hooks/useAlunos.js
import { useEffect } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { alunosService } from '../services/alunosService';
import { showToast } from '../components/shared/Toast';
import { useAuth } from './useAuth';

export const PAGE_SIZE = 25;

/**
 * Hook de listagem de alunos com paginação server-side.
 *
 * @param {object} filtros   - { role, busca, letraInicial }
 * @param {number} pagina    - página atual, começa em 1
 *
 * Retorna:
 *  - alunos        → registros da página atual
 *  - total         → total de registros no banco (com filtros aplicados)
 *  - totalPaginas  → ceil(total / PAGE_SIZE)
 *  - temAnterior   → boolean
 *  - temProximo    → boolean
 *  - loading / fetching / error / refetch
 */
export function useAlunos(filtros = {}, pagina = 1) {
  const { estudioId } = useAuth();

  const query = useQuery({
    queryKey: ['alunos', estudioId, filtros, pagina],
    // Sem try/catch aqui: deixa o React Query gerenciar o ciclo de retry
    // normalmente. O toast de erro é tratado uma única vez, fora do
    // ciclo de tentativas — ver useEffect abaixo.
    queryFn: () => alunosService.listar(filtros, { pagina, tamanho: PAGE_SIZE }, estudioId),
    enabled: !!estudioId,
    // Correção: no React Query v5, keepPreviousData (booleano) não existe mais.
    // O equivalente é placeholderData: keepPreviousData — mantém os dados da
    // página anterior visíveis enquanto a próxima carrega.
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 5,
  });

  // Notifica o erro uma única vez por falha definitiva (após esgotar os
  // retries do QueryClient), não a cada tentativa individual.
  useEffect(() => {
    if (query.isError) {
      showToast.error('Erro ao carregar lista de alunos');
    }
  }, [query.isError]);

  const dados        = query.data?.data  ?? [];
  const total        = query.data?.count ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return {
    alunos: dados,
    loading: query.isLoading,
    fetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    pagina,
    totalPaginas,
    total,
    temAnterior: pagina > 1,
    temProximo: pagina < totalPaginas,
  };
}