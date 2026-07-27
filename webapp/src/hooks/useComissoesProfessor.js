import { useQuery, useQueryClient } from '@tanstack/react-query';
import { comissoesService } from '../services/comissoesService';
import { useAuth } from './useAuth';

export function useComissoesProfessor(professorId, mesAno) {
  const { estudioId } = useAuth();

  return useQuery({
    queryKey: ['comissoes', estudioId, professorId, mesAno],
    queryFn: () => comissoesService.buscarDetalhes(professorId, mesAno, estudioId),
    enabled: !!estudioId && !!professorId && !!mesAno,
    retry: 2,
    staleTime: 1000 * 60 * 2,
  });
}

// UX-04: hook para visão geral consolidada de todos os professores no mês.
export function useResumoMensal(mesAno) {
  const { estudioId } = useAuth();

  return useQuery({
    queryKey: ['resumo-mensal', estudioId, mesAno],
    queryFn: () => comissoesService.resumoMensal(mesAno, estudioId),
    enabled: !!estudioId && !!mesAno,
    retry: 2,
    staleTime: 1000 * 60 * 2,
  });
}

export function useInvalidarComissoes() {
  const qc = useQueryClient();
  const { estudioId } = useAuth();
  return (professorId, mesAno) => {
    qc.invalidateQueries({ queryKey: ['comissoes', estudioId, professorId, mesAno] });
    // UX-04: invalida o resumo mensal junto para manter consistência após fechamento
    qc.invalidateQueries({ queryKey: ['resumo-mensal', estudioId, mesAno] });
  };
}

// Novo: busca os detalhes direto do servidor, ignorando cache — para ser
// chamado imediatamente antes de uma ação irreversível como "fechar mês",
// garantindo que o total usado no fechamento reflete o estado mais recente
// possível (mitiga o Bug 2 da auditoria: fechamento sobre dado com até 2min
// de desatualização).
export function useBuscarDetalhesFrescos() {
  const { estudioId } = useAuth();
  return (professorId, mesAno) => comissoesService.buscarDetalhes(professorId, mesAno, estudioId);
}