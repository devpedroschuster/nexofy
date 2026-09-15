import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface ItemInadimplente {
  id: number;
  valor_pago: number | null;
  data_vencimento: string;
  alunos?: { nome_completo: string; telefone: string | null } | null;
}

// Port de dashboardService.obterInadimplentes (webapp).
export function useInadimplencia(estudioId: string | null) {
  return useQuery<ItemInadimplente[]>({
    queryKey: ['inadimplencia', estudioId],
    enabled: !!estudioId,
    queryFn: async () => {
      const hojeIso = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('mensalidades')
        .select('id, valor_pago, data_vencimento, alunos(nome_completo, telefone)')
        .eq('estudio_id', estudioId!)
        .in('status', ['pendente', 'atrasado'])
        .lt('data_vencimento', hojeIso)
        .order('data_vencimento', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ItemInadimplente[];
    },
  });
}

export interface RepasseProfessor {
  id: number;
  valor: number;
  tipo_aula: string;
  modalidade: string | null;
  data_referencia: string;
  status: 'pago' | 'pendente' | 'cancelado' | string;
  pago_em: string | null;
  alunos?: { nome_completo: string } | null;
}

// Port de webapp/src/services/repasseService.js (listarRepassesProfessor).
export function useRepassesProfessor(professorId: number | null, estudioId: string | null, mesAno: string) {
  return useQuery<RepasseProfessor[]>({
    queryKey: ['repasses', estudioId, professorId, mesAno],
    enabled: !!estudioId && !!professorId,
    queryFn: async () => {
      const inicio = `${mesAno}-01`;
      const [ano, mes] = mesAno.split('-').map(Number);
      const ultimoDia = new Date(ano, mes, 0).getDate();
      const fim = `${mesAno}-${String(ultimoDia).padStart(2, '0')}`;

      const { data, error } = await supabase
        .from('repasses_lancamentos')
        .select('id, valor, tipo_aula, modalidade, data_referencia, status, pago_em, alunos(nome_completo)')
        .eq('professor_id', professorId!)
        .eq('estudio_id', estudioId!)
        .gte('data_referencia', inicio)
        .lte('data_referencia', fim)
        .order('data_referencia', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RepasseProfessor[];
    },
  });
}
