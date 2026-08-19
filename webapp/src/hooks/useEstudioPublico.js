// webapp/src/hooks/useEstudioPublico.js
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { getSlugFromHostname } from '../lib/resolveEstudio';

/**
 * Busca dados públicos do estúdio pelo slug do hostname.
 * Usado em Landing e Login (pré-autenticação), onde ainda não há sessão
 * — logo `estudio_id_atual()` (usado pela RLS de `estudios`) sempre
 * resolve null e a tabela `estudios` não tem (nem deve ter) policy
 * pública de SELECT, já que guarda credenciais sensíveis
 * (asaas_api_key, asaas_account_id etc).
 *
 * Por isso a busca passa pela RPC `estudio_publico(slug)`
 * (SECURITY DEFINER), que expõe só as colunas seguras de marketing.
 * Ver migration `add_estudio_publico_rpc`.
 *
 * Retorna tudo que useQuery retorna, mais `slug` para mensagens de erro.
 *
 * Casos:
 *  - slug null (localhost sem VITE_DEV_SLUG) → data: undefined, query desabilitada
 *  - slug válido mas não existe/inativo        → data: null (RPC não retorna linha)
 *  - slug encontrado                            → data: { id, nome, slug, segmento, ... }
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
        .rpc('estudio_publico', { p_slug: slug })
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!slug,
    staleTime: 1000 * 60 * 60,
  });

  return { ...query, slug };
}