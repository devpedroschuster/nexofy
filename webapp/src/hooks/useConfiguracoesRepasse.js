import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { configuracoesRepasseService } from '../services/configuracoesRepasseService';
import { useAuth } from './useAuth';

export function useConfiguracoesRepasse() {
  const { estudioId } = useAuth();
  const key = ['config-repasse', estudioId];

  return useQuery({
    queryKey: key,
    queryFn: configuracoesRepasseService.obter,
    enabled: !!estudioId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSalvarConfiguracoesRepasse() {
  const qc = useQueryClient();
  const { estudioId } = useAuth();
  const key = ['config-repasse', estudioId];

  return useMutation({
    mutationFn: configuracoesRepasseService.salvar,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success('Configurações de repasse atualizadas.');
    },
    onError: (e) => toast.error(e.message || 'Erro ao salvar configurações.'),
  });
}