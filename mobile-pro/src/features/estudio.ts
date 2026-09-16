// mobile-pro/src/features/estudio.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Estudio } from '@/types';

export function useEstudio(estudioId: string | null) {
  return useQuery<Estudio>({
    queryKey: ['estudio', estudioId],
    enabled: !!estudioId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('estudios')
        .select('id, nome, logo_url, cor_primaria, cor_secundaria, modulos_ativos')
        .eq('id', estudioId!)
        .single();
      if (error) throw error;
      return data as Estudio;
    },
  });
}
