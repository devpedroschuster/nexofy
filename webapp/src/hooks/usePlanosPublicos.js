// webapp/src/hooks/usePlanosPublicos.js
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

/**
 * Busca os planos públicos de um estúdio (para a landing page).
 *
 * Passa pela RPC `planos_publicos(estudio_id)` (SECURITY DEFINER) em vez
 * de `.from('planos')` direto: a tabela `planos` tem colunas de comissão
 * (comissao_professor/espaco/diretor) que não podem ficar acessíveis via
 * policy RLS ampla por estudio_id — a RPC expõe só as colunas que a
 * landing pública realmente usa. Ver migration `add_planos_publicos_rpc`.
 *
 * @param {string|undefined} estudioId
 */
export function usePlanosPublicos(estudioId) {
  const query = useQuery({
    queryKey: ['planos-publicos', estudioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('planos_publicos', { p_estudio_id: estudioId });

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