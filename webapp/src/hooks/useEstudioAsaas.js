import { useQuery } from '@tanstack/react-query';
import { buscarDadosAsaas } from '../services/estudioAsaasService';

/**
 * Retorna os dados de onboarding financeiro (Asaas) do estúdio.
 * `data` é `null` quando o estúdio ainda não preencheu o formulário —
 * trate isso na UI como "primeiro preenchimento", não como erro.
 */
export function useEstudioAsaas(estudioId) {
  return useQuery({
    queryKey: ['estudio-dados-asaas', estudioId],
    queryFn: () => buscarDadosAsaas(estudioId),
    enabled: !!estudioId,
    staleTime: 1000 * 60 * 5,
  });
}