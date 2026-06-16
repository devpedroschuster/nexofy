// webapp/src/hooks/useEstudioPublico.js
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { getSlugFromHostname } from '../lib/resolveEstudio';

/**
 * Busca dados públicos do estúdio pelo slug do hostname.
 * Usado em Landing e Login (pré-autenticação), onde o RLS por auth.uid()
 * ainda não está disponível.
 *
 * Retorna tudo que useQuery retorna, mais `slug` para mensagens de erro.
 *
 * Casos:
 *  - slug null (localhost sem VITE_DEV_SLUG) → data: null, sem request ao banco
 *  - slug válido mas não existe no banco     → data: null (maybeSingle)
 *  - slug encontrado                         → data: { id, nome, slug, ... }
 */
export function useEstudioPublico() {
  const slug = getSlugFromHostname();

  const query = useQuery({
    queryKey: ['estudio-publico', slug],
    queryFn: async () => {
      if (!slug) return null;

      const { data, error } = await supabase
        .from('estudios')
        .select('id, nome, slug, whatsapp, instagram_url, maps_url, maps_embed_url')
        .eq('slug', slug)
        .maybeSingle(); // retorna null sem lançar erro quando não encontra

      if (error) throw error;
      return data;
    },
    staleTime: 1000 * 60 * 60, // 1h — dados de contato raramente mudam
  });

  return { ...query, slug };
}