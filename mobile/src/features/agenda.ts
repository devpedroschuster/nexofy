import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Aula } from '@/types';

export interface ProximaAula extends Aula {
  data_aula: string; // vem de presencas.data_aula (a ocorrência específica agendada)
}

// Usado no Dashboard: busca a próxima aula com presença 'agendado' do aluno,
// a partir de hoje — join presencas -> agenda pra trazer o card completo.
export function useProximaAula(alunoId: number | undefined, estudioId: string | undefined) {
  return useQuery<ProximaAula | null>({
    queryKey: ['proxima-aula', alunoId],
    enabled: !!alunoId && !!estudioId,
    queryFn: async () => {
      const hojeIso = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('presencas')
        .select('data_aula, agenda!inner(*, professores(nome), modalidades(area))')
        .eq('aluno_id', alunoId!)
        .eq('estudio_id', estudioId!)
        .eq('status', 'agendado')
        .gte('data_aula', hojeIso)
        .order('data_aula', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { ...(data.agenda as unknown as Aula), data_aula: data.data_aula } as ProximaAula;
    },
  });
}

// Espelha a query de aulas do dia em webapp/src/pages/AreaAluno.jsx —
// filtro por dia da semana OU data específica, isolado por estudio_id.
export function useAulasDoDia(estudioId: string | undefined, dataIso: string, diaSemanaBanco: string) {
  return useQuery<Aula[]>({
    queryKey: ['agenda', estudioId, dataIso],
    enabled: !!estudioId,
    queryFn: async () => {
      const diaCurto = diaSemanaBanco.split('-')[0];
      const { data, error } = await supabase
        .from('agenda')
        .select('*, professores (nome), modalidades (area), presencas (aluno_id)')
        .eq('estudio_id', estudioId!)
        .or(`dia_semana.ilike.*${diaCurto}*,data_especifica.eq.${dataIso}`)
        .order('horario', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Aula[];
    },
  });
}

export interface AgendarInput {
  aulaId: number;
  dataAula: string; // 'YYYY-MM-DD' — ocorrência específica, não o id da agenda recorrente
}

// FIX: `agendar_aula` não existe no banco (nem staging nem produção) — a
// própria Área do Aluno web chama uma função inexistente (ver PED-185). A
// function real, já usada pelo admin/professor em ModalAgendamento.jsx, é
// `agendar_avulso(p_estudio_id, p_aluno_id, p_aula_id, p_data_aula, p_ignorar_avisos)`.
// Regra de antecedência (P0103) e de inadimplência (P0102) são validadas
// dentro da RPC (ver supabase/migrations/20260909190000_*.sql) — o client só
// repassa o erro (error.message / error.details) que voltar.
export function useAgendarAula(alunoId: number | undefined, estudioId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ aulaId, dataAula }: AgendarInput) => {
      const { error } = await supabase.rpc('agendar_avulso', {
        p_estudio_id: estudioId,
        p_aluno_id: alunoId,
        p_aula_id: aulaId,
        p_data_aula: dataAula,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agenda'] }),
  });
}

// FIX: assinatura real exige p_data e p_estudio_id, não só p_aluno_id/p_aula_id
// (a chamada anterior — copiada do bug do webapp, PED-185 — nunca teria funcionado).
export function useCancelarAgendamento(alunoId: number | undefined, estudioId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ aulaId, dataAula }: AgendarInput) => {
      const { error } = await supabase.rpc('cancelar_agendamento', {
        p_aluno_id: alunoId,
        p_aula_id: aulaId,
        p_data: dataAula,
        p_estudio_id: estudioId,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agenda'] }),
  });
}
