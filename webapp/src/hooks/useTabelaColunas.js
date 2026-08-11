// hooks/useTabelaColunas.js
//
// Hook de leitura/mutação de `tabela_colunas_config` via TanStack Query.
//
// Resolve o `idEfetivo` do estúdio do mesmo jeito que o restante da
// Nexofy já faz (useAuth + ImpersonationContext) — ver o padrão descrito
// nas auditorias de Alunos.jsx/Financeiro.jsx/etc: super_admin em
// impersonation nunca deve operar com o estudioId "cru" de useAuth().

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import { useImpersonation } from '../context/ImpersonationContext';
import * as tabelaColunasService from '../services/tabelaColunasService';

/**
 * @returns {string|null} o estudio_id que deve ser usado em toda
 * leitura/escrita — impersonação tem prioridade sobre o estudioId bruto.
 */
function useEstudioIdEfetivo() {
  const { estudioId } = useAuth();
  const { estudioAtivo } = useImpersonation();
  return estudioAtivo?.id ?? estudioId ?? null;
}

/**
 * @param {'alunos'|'financeiro'} tabela
 */
export function useTabelaColunas(tabela) {
  const estudioId = useEstudioIdEfetivo();
  const queryClient = useQueryClient();

  const queryKey = useMemo(
    () => ['tabela-colunas', estudioId, tabela],
    [estudioId, tabela]
  );

  const query = useQuery({
    queryKey,
    queryFn: () => tabelaColunasService.getTabelaColunas(estudioId, tabela),
    enabled: !!estudioId && !!tabela,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  // Colunas novas no catálogo (campos_dinamicos ativos, ou colunas
  // estáticas de financeiro) ainda sem linha real no banco chegam aqui
  // como `id: "pending-<key>"` (ver tabelaColunasService.getTabelaColunas).
  // Componentes de UI devem chamar seedIfNeeded.mutate() ao detectar
  // qualquer item pendente, antes de permitir toggle/edit/reorder.
  const seedIfNeeded = useMutation({
    mutationFn: () => tabelaColunasService.ensureTabelaColunasSeeded(estudioId, tabela),
    onSuccess: invalidate,
  });

  const updateLabel = useMutation({
    mutationFn: ({ id, label }) =>
      tabelaColunasService.updateTabelaColunaLabel(estudioId, id, label),
    onSuccess: invalidate,
  });

  const toggleVisible = useMutation({
    mutationFn: ({ id, currentVisible }) =>
      tabelaColunasService.toggleTabelaColunaVisivel(estudioId, id, currentVisible),
    onSuccess: invalidate,
  });

  const reorder = useMutation({
    mutationFn: (orderedIds) =>
      tabelaColunasService.reorderTabelaColunas(estudioId, orderedIds),
    onSuccess: invalidate,
  });

  return {
    ...query,
    colunas: query.data ?? [],
    hasPending: (query.data ?? []).some((c) => c.id.startsWith('pending-')),
    seedIfNeeded,
    updateLabel,
    toggleVisible,
    reorder,
  };
}