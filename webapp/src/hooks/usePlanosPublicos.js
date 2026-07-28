// webapp/src/hooks/usePlanosPublicos.js
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

/**
 * Busca os planos públicos de um estúdio (para a landing page).
 * Espelha o padrão de useEstudioPublico: useQuery com cache, em vez de
 * useEffect + fetch manual (o padrão manual não cancelava requests fora
 * de ordem e engolia erros sem expor estado de erro pra UI).
 *
 * @param {string|undefined} estudioId
 */
export function usePlanosPublicos(estudioId) {
  const query = useQuery({
    queryKey: ['planos-publicos', estudioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('planos')
        .select('id, nome, preco, duracao_meses, frequencia_semanal, regras_acesso')
        .eq('estudio_id', estudioId)
        .order('preco', { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!estudioId,
    staleTime: 1000 * 60 * 30, // catálogo de planos muda raramente
  });

  return {
    planos: query.data ?? [],
    loading: query.isLoading,
    // Erro real (rede/RLS) fica disponível pra quem quiser logar/mostrar algo,
    // mas o comportamento padrão da Landing continua sendo "esconder a seção".
    error: query.isError ? query.error : null,
  };
}