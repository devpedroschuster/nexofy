import { supabase } from '../lib/supabase';

export const comissoesService = {
  async listarProfessores(estudioId) {
    const { data, error } = await supabase
      .from('professores')
      .select('*')
      .eq('estudio_id', estudioId)
      .eq('ativo', true)
      .order('nome');
    if (error) throw error;
    return data;
  },

  async buscarDetalhes(professorId, mesAno, estudioId) {
  const inicio = `${mesAno}-01`;
  const [ano, mes] = mesAno.split('-').map(Number);
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const fim = `${mesAno}-${String(ultimoDia).padStart(2, '0')}`;

  // Corrigido: as duas queries não dependem uma da outra — rodam em paralelo,
  // e o erro de AMBAS agora é verificado (antes, o erro de `fechamento` era
  // silenciosamente ignorado, fazendo a UI achar que o mês nunca foi fechado
  // quando na verdade a checagem só tinha falhado).
  const [{ data: fechamento, error: errFechamento }, { data: lancamentos, error: errLancamentos }] =
    await Promise.all([
      supabase
        .from('fechamento_comissoes')
        .select('*')
        .eq('estudio_id', estudioId)
        .eq('professor_id', professorId)
        .eq('mes_referencia', `${mesAno}-01`)
        .maybeSingle(),

      supabase
        .from('repasses_lancamentos')
        .select('id, valor, tipo_aula, modalidade, data_referencia, pago_em, status, alunos(nome_completo)')
        .eq('estudio_id', estudioId)
        .eq('professor_id', professorId)
        .gte('data_referencia', inicio)
        .lte('data_referencia', fim)
        .order('data_referencia', { ascending: false }),
    ]);

  if (errFechamento) throw errFechamento;
  if (errLancamentos) throw errLancamentos;

  const total = (lancamentos || []).reduce((s, l) => s + Number(l.valor), 0);

  const porTipo = (lancamentos || []).reduce((acc, l) => {
    acc[l.tipo_aula] = (acc[l.tipo_aula] || 0) + Number(l.valor);
    return acc;
  }, {});

  return {
    fechamento,
    professor_id: professorId,
    mes: mesAno,
    resumo: { total_comissao: total },
    porTipo,
    lancamentos: lancamentos || [],
  };
},

// UX-04: resumo consolidado de todos os professores para um mês.
async resumoMensal(mesAno, estudioId) {
  const inicio = `${mesAno}-01`;
  const [ano, mes] = mesAno.split('-').map(Number);
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const fim = `${mesAno}-${String(ultimoDia).padStart(2, '0')}`;

  const [{ data: lancamentos, error: errLancamentos }, { data: fechamentos, error: errFechamentos }] =
    await Promise.all([
      supabase
        .from('repasses_lancamentos')
        .select('professor_id, valor, tipo_aula, status, professores(id, nome)')
        .eq('estudio_id', estudioId)
        .gte('data_referencia', inicio)
        .lte('data_referencia', fim),

      supabase
  .from('fechamento_comissoes')
  .select('professor_id, valor_total, created_at')
  .eq('estudio_id', estudioId)
  .eq('mes_referencia', `${mesAno}-01`),
    ]);

  if (errLancamentos) throw errLancamentos;
  if (errFechamentos) throw errFechamentos; // antes, ignorado

  const fechamentosPorProf = new Map(
    (fechamentos || []).map(f => [f.professor_id, f])
  );

  const porProf = new Map();
  for (const l of lancamentos || []) {
    if (!l.professor_id) continue;
    if (!porProf.has(l.professor_id)) {
      porProf.set(l.professor_id, {
        professor_id: l.professor_id,
        nome: l.professores?.nome ?? 'Professor',
        total: 0,
        pendente: 0,
        pago: 0,
        qtd: 0,
        porTipo: {},
        fechamento: fechamentosPorProf.get(l.professor_id) ?? null,
      });
    }
    const entry = porProf.get(l.professor_id);
    const valor = Number(l.valor);
    entry.total += valor;
    entry.qtd += 1;
    if (l.status === 'pago') {
      entry.pago += valor;
    } else {
      entry.pendente += valor;
    }
    entry.porTipo[l.tipo_aula] = (entry.porTipo[l.tipo_aula] || 0) + valor;
  }

  return [...porProf.values()].sort((a, b) => b.total - a.total);
},

  // FIX: trocado de upsert para insert puro. O upsert anterior (com
  // onConflict) permitia que dois "Aprovar Fechamento" quase simultâneos
  // (dois admins, ou duplo clique) sobrescrevessem silenciosamente o
  // fechamento um do outro — sem erro, sem aviso — o que contradiz a
  // premissa de negócio de que "mês fechado não pode ser alterado".
  // Agora, se já existir um fechamento para (professor_id, mes_referencia),
  // o insert falha com unique_violation (23505) e isso é reportado à UI
  // como 'ALREADY_CLOSED', permitindo que Comissoes.jsx avise o usuário
  // em vez de sobrescrever o registro anterior.
  //
  // Requer constraint UNIQUE (professor_id, mes_referencia) na tabela
  // fechamento_comissoes — a mesma que já era usada como onConflict no
  // upsert antigo, então nenhuma migração adicional é necessária.
  async fecharMes(professorId, mesAno, valorTotal, estudioId) {
    // Defesa em profundidade: garante que o professor pertence ao estúdio
    // antes de gravar o fechamento, mesmo que a RLS de insert não faça esse join.
    const { data: prof, error: errProf } = await supabase
      .from('professores')
      .select('id')
      .eq('id', professorId)
      .eq('estudio_id', estudioId)
      .maybeSingle();
    if (errProf) throw errProf;
    if (!prof) throw new Error('PROFESSOR_FORA_DO_ESTUDIO');

    const { error } = await supabase
  .from('fechamento_comissoes')
  .insert([{ professor_id: professorId, estudio_id: estudioId, mes_referencia: `${mesAno}-01`, valor_total: valorTotal }]);
    if (error) {
      if (error.code === '23505') throw new Error('ALREADY_CLOSED');
      throw error;
    }
    return true;
  }
};