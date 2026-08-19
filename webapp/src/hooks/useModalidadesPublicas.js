// webapp/src/hooks/useModalidadesPublicas.js
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

/**
 * Busca as modalidades públicas de um estúdio (para a landing page),
 * agrupadas por `area` — usado pra renderizar os cards de modalidade
 * dinamicamente em vez do "Funcional/Dança" fixo.
 *
 * Passa pela RPC `modalidades_publicas(estudio_id)` (SECURITY DEFINER)
 * em vez de `.from('modalidades')` direto: a tabela tem colunas de
 * comissão (taxa_professor/espaco/direcao) que não podem ficar acessíveis
 * via policy RLS ampla por estudio_id. Ver migration
 * `fix_anon_execute_grants_and_modalidades_publicas`.
 *
 * @param {string|undefined} estudioId
 * @returns {{ grupos: Array<{ area: string, modalidades: Array<{id,nome}> }>, loading: boolean, error: Error|null }}
 */
export function useModalidadesPublicas(estudioId) {
  const query = useQuery({
    queryKey: ['modalidades-publicas', estudioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('modalidades_publicas', { p_estudio_id: estudioId });

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!estudioId,
    staleTime: 1000 * 60 * 30,
  });

  const modalidades = query.data ?? [];

  // Agrupa por área (ex: "Dança", "Funcional") preservando a ordem em que
  // cada área apareceu primeiro. Modalidades sem área caem num grupo
  // "Modalidades" genérico no fim.
  const gruposMap = new Map();
  for (const m of modalidades) {
    const area = m.area?.trim() || 'Modalidades';
    if (!gruposMap.has(area)) gruposMap.set(area, []);
    gruposMap.get(area).push(m);
  }

  const grupos = Array.from(gruposMap.entries()).map(([area, itens]) => ({
    area,
    modalidades: itens,
  }));

  return {
    grupos,
    loading: query.isLoading,
    error: query.isError ? query.error : null,
  };
}