import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

/**
 * Retorna os dados do estúdio do usuário logado.
 * O RLS garante que `.single()` devolve apenas o estúdio ao qual o usuário pertence.
 *
 * Uso:
 *   const { data: estudio, isLoading, error } = useEstudio();
 *   estudio.nome // → "Espaço Iluminus"
 *   estudio.id   // → uuid do estúdio
 */
export function useEstudio(estudioId) {
  return useQuery({
    queryKey: ['estudio', estudioId],
    queryFn: async () => {
      if (!estudioId) return null;
      const { data, error } = await supabase
        .from('estudios')
        .select('*')
        .eq('id', estudioId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!estudioId,
    staleTime: 1000 * 60 * 10,
  });
}