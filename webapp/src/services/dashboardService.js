import { supabase } from '../lib/supabase';

export const dashboardService = {
  async obterTotalAlunos(estudioId) {
    const { count, error } = await supabase
      .from('alunos')
      .select('*', { count: 'exact', head: true })
      .eq('estudio_id', estudioId)
      .eq('ativo', true)
      .eq('role', 'aluno');
    if (error) throw error;
    return count || 0;
  },

  async obterPagamentosMes(inicioMes, estudioId) {
    const { data, error } = await supabase
      .from('mensalidades')
      .select('valor_pago')
      .eq('estudio_id', estudioId)
      .eq('status', 'pago')
      .gte('data_pagamento', inicioMes);
    if (error) throw error;
    return data || [];
  },

  async obterInadimplentes(hojeIso, estudioId) {
    const { data, error } = await supabase
      .from('mensalidades')
      .select('id, valor_pago, data_vencimento, alunos(nome_completo, telefone)')
      .eq('estudio_id', estudioId)
      .in('status', ['pendente', 'atrasado'])
      .lt('data_vencimento', hojeIso)
      .order('data_vencimento', { ascending: true });
    if (error) throw error;
    return data || [];
  },

async obterComissoes(inicioMes, estudioId) {
  const [ano, mes] = inicioMes.substring(0, 7).split('-');
  const fim = new Date(Number(ano), Number(mes), 0).toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('repasses_lancamentos')
    .select('id, valor, professor_id, professores(nome)')
    .eq('estudio_id', estudioId)
    .gte('created_at', `${inicioMes.substring(0, 7)}-01T00:00:00`)
    .lte('created_at', `${fim}T23:59:59`);

  if (error) throw error;
  return data || [];
},

  async obterHistorico(dataLimite, estudioId) {
    const { data, error } = await supabase
      .from('mensalidades')
      .select('data_pagamento, valor_pago')
      .eq('estudio_id', estudioId)
      .eq('status', 'pago')
      .gte('data_pagamento', dataLimite)
      .order('data_pagamento');
    if (error) throw error;
    return data || [];
  },

  async obterUltimasAtividades(estudioId) {
    const { data, error } = await supabase
      .from('mensalidades')
      .select('id, valor_pago, data_pagamento, status, alunos(nome_completo)')
      .eq('estudio_id', estudioId)
      .order('data_pagamento', { ascending: false })
      .limit(5);
    if (error) throw error;
    return data || [];
  },

  /**
   * Busca todos os dados do Dashboard em paralelo com Promise.all.
   * Reduz o tempo de carregamento de ~600 ms (soma sequencial) para
   * ~150 ms (latência da query mais lenta).
   *
   * @param {{ hojeIso: string, inicioMes: string, limite7Dias: string, estudioId: string }} params
   */
  async obterTudoDashboard({ hojeIso, inicioMes, limite7Dias, estudioId }) {
    const { supabase } = await import('../lib/supabase');

    const [
      totalAlunos,
      pagamentosMes,
      listaInadimplentes,
      alunosPlanosVencendo,
      todosAlunos,
    ] = await Promise.all([
      this.obterTotalAlunos(estudioId),
      this.obterPagamentosMes(inicioMes, estudioId),
      this.obterInadimplentes(hojeIso, estudioId),
      this.obterAlunosPlanosVencendo(hojeIso, limite7Dias, estudioId),
      supabase
        .from('alunos')
        .select('id, nome_completo, data_nascimento, telefone')
        .eq('estudio_id', estudioId)
        .eq('ativo', true)
        .eq('role', 'aluno')
        .not('data_nascimento', 'is', null)
        .then(({ data }) => data || []),
    ]);

    return { totalAlunos, pagamentosMes, listaInadimplentes, alunosPlanosVencendo, todosAlunos };
  },

  /**
   * Retorna alunos cujo plano vence entre `hojeIso` e `limiteIso` (inclusive).
   * Usado para o alerta âmbar de "planos vencendo em ≤7 dias".
   */
  async obterAlunosPlanosVencendo(hojeIso, limiteIso, estudioId) {
    const { data, error } = await supabase
      .from('alunos')
      .select('id, nome_completo, data_fim_plano')
      .eq('estudio_id', estudioId)
      .eq('ativo', true)
      .eq('role', 'aluno')
      .not('data_fim_plano', 'is', null)
      .gte('data_fim_plano', hojeIso)
      .lte('data_fim_plano', limiteIso)
      .order('data_fim_plano', { ascending: true });
    if (error) throw error;
    return data || [];
  },
};