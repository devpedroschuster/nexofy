import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ItemInadimplente } from '@/features/financeiro';

export interface KpisDashboardAdmin {
  totalAlunos: number;
  faturamentoMes: number;
  inadimplentes: ItemInadimplente[];
}

// Port reduzido de webapp/src/services/dashboardService.js
// (obterTotalAlunos + obterPagamentosMes + obterInadimplentes), em paralelo.
export function useDashboardAdmin(estudioId: string | null) {
  const agora = new Date();
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString();
  const hojeIso = agora.toISOString().split('T')[0];

  return useQuery<KpisDashboardAdmin>({
    queryKey: ['dashboard-admin', estudioId, hojeIso, inicioMes],
    enabled: !!estudioId,
    queryFn: async () => {
      const [
        { count: totalAlunos, error: errTotal },
        { data: pagamentosMes, error: errPag },
        { data: inadimplentes, error: errInad },
      ] = await Promise.all([
        supabase
          .from('alunos')
          .select('*', { count: 'exact', head: true })
          .eq('estudio_id', estudioId!)
          .eq('ativo', true)
          .eq('role', 'aluno'),
        supabase
          .from('mensalidades')
          .select('valor_pago')
          .eq('estudio_id', estudioId!)
          .eq('status', 'pago')
          .gte('data_pagamento', inicioMes),
        supabase
          .from('mensalidades')
          .select('id, valor_pago, data_vencimento, alunos(nome_completo, telefone)')
          .eq('estudio_id', estudioId!)
          .in('status', ['pendente', 'atrasado'])
          .lt('data_vencimento', hojeIso)
          .order('data_vencimento', { ascending: true }),
      ]);

      if (errTotal) throw errTotal;
      if (errPag) throw errPag;
      if (errInad) throw errInad;

      const faturamentoMes = (pagamentosMes ?? []).reduce((acc: number, m: any) => acc + Number(m.valor_pago ?? 0), 0);

      return {
        totalAlunos: totalAlunos ?? 0,
        faturamentoMes,
        inadimplentes: (inadimplentes ?? []) as unknown as ItemInadimplente[],
      };
    },
  });
}
