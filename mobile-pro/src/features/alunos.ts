import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface AlunoResumo {
  id: number;
  nome_completo: string;
  email: string | null;
  telefone: string | null;
  status_pagamento: string;
  planos?: { nome: string } | null;
}

// Gestor: todos os alunos ativos do estúdio. Port da consulta base usada em
// webapp/src/pages/Alunos.jsx.
export function useAlunosDoEstudio(estudioId: string | null, busca: string) {
  return useQuery<AlunoResumo[]>({
    queryKey: ['alunos-estudio', estudioId, busca],
    enabled: !!estudioId,
    queryFn: async () => {
      let query = supabase
        .from('alunos')
        .select('id, nome_completo, email, telefone, status_pagamento, planos(nome)')
        .eq('estudio_id', estudioId!)
        .eq('ativo', true)
        .eq('role', 'aluno')
        .order('nome_completo');
      if (busca.trim()) query = query.ilike('nome_completo', `%${busca.trim()}%`);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as AlunoResumo[];
    },
  });
}

// Instrutor: só os alunos das próprias modalidades — port 1:1 de
// webapp/src/pages/Professor/ProfessorAlunos.jsx (carregarAlunos).
export function useMeusAlunos(professorId: number | null, estudioId: string | null, busca: string) {
  return useQuery<AlunoResumo[]>({
    queryKey: ['meus-alunos', estudioId, professorId, busca],
    enabled: !!estudioId && !!professorId,
    queryFn: async () => {
      const [{ data: modalidadesOwn }, { data: aulasDoProf }] = await Promise.all([
        supabase.from('modalidades').select('id').eq('professor_id', professorId!).eq('estudio_id', estudioId!),
        supabase.from('agenda').select('modalidade_id').eq('professor_id', professorId!).eq('estudio_id', estudioId!),
      ]);

      const idsModalidades = [
        ...new Set([
          ...(modalidadesOwn ?? []).map((m: any) => m.id),
          ...(aulasDoProf ?? []).map((a: any) => a.modalidade_id).filter(Boolean),
        ]),
      ];

      if (idsModalidades.length === 0) return [];

      let query = supabase
        .from('alunos')
        .select('id, nome_completo, email, telefone, status_pagamento, planos(nome), modalidades_selecionadas')
        .eq('estudio_id', estudioId!)
        .eq('ativo', true)
        .eq('role', 'aluno')
        .overlaps('modalidades_selecionadas', idsModalidades)
        .order('nome_completo');
      if (busca.trim()) query = query.ilike('nome_completo', `%${busca.trim()}%`);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as AlunoResumo[];
    },
  });
}
