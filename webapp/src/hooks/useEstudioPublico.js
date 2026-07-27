// webapp/src/hooks/useEstudioPublico.js
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { getSlugFromHostname } from '../lib/resolveEstudio';

/**
 * Busca dados públicos do estúdio pelo slug do hostname.
 * Usado em Landing e Login (pré-autenticação), onde o RLS por auth.uid()
 * ainda não está disponível — depende de uma policy pública restrita
 * às colunas selecionadas abaixo.
 *
 * Retorna tudo que useQuery retorna, mais `slug` para mensagens de erro.
 *
 * Casos:
 *  - slug null (localhost sem VITE_DEV_SLUG) → data: undefined, query desabilitada
 *  - slug válido mas não existe no banco     → data: null (maybeSingle)
 *  - slug encontrado                         → data: { id, nome, slug, ... }
 */
export function useEstudioPublico() {
  const slug = getSlugFromHostname();

  if (import.meta.env.DEV && !slug) {
    console.warn('[useEstudioPublico] slug não resolvido a partir do hostname — configure VITE_DEV_SLUG no .env.local');
  }

  const query = useQuery({
    queryKey: ['estudio-publico', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('estudios')
        .select('id, nome, slug, whatsapp, instagram, maps_url, maps_embed_url')
        .eq('slug', slug)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!slug,
    staleTime: 1000 * 60 * 60,
  });

  return { ...query, slug };
}