import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Mensalidade } from '@/types';

// Espelha a query de mensalidades em webapp/src/pages/AreaAluno.jsx:
// exclui 'cancelado' (mensalidade anulada por reassinatura no mesmo mês —
// ver comentário original PED-160) e ordena pela mais recente primeiro.
export function useMensalidades(alunoId: number | undefined, estudioId: string | undefined) {
  return useQuery<Mensalidade[]>({
    queryKey: ['mensalidades', alunoId],
    enabled: !!alunoId && !!estudioId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mensalidades')
        .select('*')
        .eq('aluno_id', alunoId!)
        .eq('estudio_id', estudioId!)
        .neq('status', 'cancelado')
        .order('data_vencimento', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Mensalidade[];
    },
  });
}

export function statusExibicao(status: string, dataVencimento: string): 'Pago' | 'Atrasado' | 'Pendente' {
  if (status === 'pago') return 'Pago';
  if (dataVencimento && new Date(dataVencimento) < new Date()) return 'Atrasado';
  return 'Pendente';
}

// Chama a Edge Function criar-cobranca-asaas para (re)gerar o link_pagamento
// de uma mensalidade pendente. IMPORTANTE: hoje essa function só aceita
// admin/super_admin (ver spec, "Trabalho de backend novo" item 2) — este
// hook já está pronto para quando a branch de auto-atendimento existir.
export function useGerarCobranca() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (mensalidade: Mensalidade) => {
      const { data, error } = await supabase.functions.invoke('criar-cobranca-asaas', {
        body: {
          aluno_id: mensalidade.aluno_id,
          valor: mensalidade.valor_cobranca,
          tipo_cobranca: 'mensalidade',
          mes_referencia: mensalidade.data_vencimento.slice(0, 7),
        },
      });
      if (error) throw error;
      return data as { link_pagamento: string; asaas_payment_id: string };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mensalidades'] }),
  });
}
