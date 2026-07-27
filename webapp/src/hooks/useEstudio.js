import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

/**
 * Retorna os dados do estúdio do usuário logado.
 * O RLS garante que `.single()` devolve apenas o estúdio ao qual o usuário pertence.
 *
 * IMPORTANTE: `estudioId` é obrigatório. Sempre obtenha-o via `useAuth()`
 * no componente chamador — ex:
 *   const { estudioId } = useAuth();
 *   const { data: estudio } = useEstudio(estudioId);
 */
export function useEstudio(estudioId) {
  return useQuery({
    queryKey: ['estudio', estudioId],
    queryFn: async () => {
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

/**
 * Atalho para exibir o nome do estúdio com fallback padronizado,
 * evitando `estudio?.nome ?? 'Estúdio'` repetido em cada tela.
 */
export function useNomeEstudio(estudioId) {
  const { data: estudio, ...rest } = useEstudio(estudioId);
  return { nomeEstudio: estudio?.nome ?? 'Estúdio', estudio, ...rest };
}