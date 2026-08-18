// webapp/src/hooks/useAlunos.js
import { useEffect } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { alunosService } from '../services/alunosService';
import { showToast } from '../components/shared/Toast';
import { useAuth } from './useAuth';
import { alunosKeys } from '../lib/alunosQueryKeys';

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
export function useAlunos(filtros = {}, pagina = 1, estudioIdOverride) {
  const { estudioId: estudioIdAuth } = useAuth();
  const estudioId = estudioIdOverride ?? estudioIdAuth;

  const query = useQuery({
    // FIX: key vem do mesmo helper usado por invalidateQueries em toda
    // a aplicação — impossível a chave divergir entre leitura e invalidação.
    queryKey: alunosKeys.lista(estudioId, filtros, pagina),
    queryFn: () => alunosService.listar(filtros, { pagina, tamanho: PAGE_SIZE }, estudioId),
    enabled: !!estudioId,
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 5,
  });

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