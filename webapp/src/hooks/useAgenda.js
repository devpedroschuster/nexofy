// webapp/src/hooks/useAgenda.js
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { gradeService } from '../services/gradeService';
import { useAuth } from './useAuth';
import { useImpersonation } from '../context/ImpersonationContext';

// Mesma janela usada para feriados (ver gradeService.listarFeriados) — mantém
// consistência e evita que a grade volte a ser uma consulta sem limite.
const JANELA_MESES_PASSADO = 12;
const JANELA_MESES_FUTURO  = 12;

function calcularJanela() {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - JANELA_MESES_PASSADO, 1)
    .toISOString().split('T')[0];
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + JANELA_MESES_FUTURO + 1, 0)
    .toISOString().split('T')[0];
  return { inicio, fim };
}

export function useAgenda() {
  const { perfil, professorId, estudioId } = useAuth();
  // FIX (PED-101): em modo impersonation, useAuth().estudioId é null — o
  // estúdio efetivo pro super_admin vem do ImpersonationContext (mesmo
  // padrão já usado em Alunos.jsx/Dashboard.jsx/Planos.jsx). Sem isso, as
  // queries abaixo ficavam desabilitadas (enabled: !!estudioId) durante
  // impersonation e a Agenda aparecia vazia sem nenhum erro.
  const { estudioAtivo } = useImpersonation();
  const idEfetivo = estudioAtivo?.id ?? estudioId;

  // Memoizado para não gerar um novo objeto de datas a cada render
  // (evitaria invalidação desnecessária se a janela entrar na queryKey).
  const janela = useMemo(() => calcularJanela(), []);

  const queryGrade = useQuery({
    queryKey: ['agenda', perfil, professorId, idEfetivo, janela.inicio, janela.fim],
    queryFn: () => gradeService.listarGrade(perfil, professorId, idEfetivo, janela),
    enabled: perfil !== null && !!idEfetivo,
    staleTime: 1000 * 60 * 2, // 2 min — dados de agenda mudam mais que feriados,
                              // mas não precisam refetch a cada foco de aba.
  });

  const queryFeriados = useQuery({
    queryKey: ['feriados', idEfetivo],
    queryFn: () => gradeService.listarFeriados(idEfetivo),
    enabled: !!idEfetivo,
    staleTime: 1000 * 60 * 10, // 10 minutos — feriados raramente mudam
  });

  // Corrigido: agora retorna a Promise combinada, então `await refetch()`
  // só resolve depois que os dados realmente chegaram.
  const refetch = () => Promise.all([queryGrade.refetch(), queryFeriados.refetch()]);

  return {
    aulas: queryGrade.data || [],
    feriados: queryFeriados.data || [],
    loading: queryGrade.isLoading || queryFeriados.isLoading,
    // Novo: permite à UI diferenciar "carregando do zero" de "atualizando em segundo plano"
    fetching: queryGrade.isFetching || queryFeriados.isFetching,
    isError: queryGrade.isError || queryFeriados.isError,
    error: queryGrade.error || queryFeriados.error,
    refetch,
  };
}