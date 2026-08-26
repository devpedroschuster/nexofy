// supabase/functions/_shared/repasses.ts
//
// Lógica de geração de repasse para UMA mensalidade — extraída de
// gerar-repasses/index.ts (PED-14) para ser reaproveitada tanto pelo
// endpoint HTTP (admin confirma manualmente) quanto pelo webhook-pagamento
// (Asaas confirma automaticamente), sem duplicar a regra de cálculo.
//
// Esta função NÃO faz autenticação/autorização — isso é responsabilidade
// de quem chama (gerar-repasses/index.ts valida JWT de admin; webhook-pagamento
// chama diretamente com service role, já autenticado pelo token do Asaas).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// REP-07: distribui `total` em centavos exatos entre `n` parcelas.
function distribuirCentavos(total: number, n: number): number[] {
  const totalCentavos = Math.round(total * 100);
  const baseCentavos = Math.floor(totalCentavos / n);
  const parcelasCentavos = Array(n).fill(baseCentavos);
  const restoCentavos = totalCentavos - baseCentavos * n;

  for (let i = 0; i < restoCentavos; i++) {
    parcelasCentavos[n - 1 - i] += 1;
  }
  return parcelasCentavos.map(c => c / 100);
}

interface ConfigRepasse {
  valor_1_modalidade: number;
  valor_multi_modalidade: number;
  plano_livre_pct_casa: number;
  plano_livre_pct_prof: number;
  aula_avulsa_valor: number;
  aula_avulsa_pct_prof: number;
  aula_avulsa_pct_casa: number;
  aula_experimental_valor: number;
  aula_experimental_pct_prof: number;
}

interface Mensalidade {
  id: string;
  estudio_id: string;
  aluno_id: string | null;
  plano_id: string | null;
  tipo_aula: string;
  valor_pago: number;
  professor_id: string | null;
  modalidade_nome: string | null;
  data_pagamento: string | null;
  data_vencimento: string;
}

export interface ResultadoGerarRepasses {
  sucesso?: boolean;
  aviso?: string;
  gerados: number;
  itens?: { modalidade: string; valor: number; tipo: string }[];
}

/**
 * Gera (ou regera) os repasses de UMA mensalidade específica.
 * Lança exceção em erro de banco/config ausente — quem chama decide como
 * reportar (HTTP 500 no endpoint, Sentry no background task do webhook).
 */
export async function gerarRepassesParaMensalidade(
  supabase: SupabaseClient,
  params: { estudioId: string; mensalidadeId: string },
): Promise<ResultadoGerarRepasses> {
  const { estudioId, mensalidadeId } = params;

  const { data: mens, error: errMens } = await supabase
    .from('mensalidades')
    .select('id, estudio_id, aluno_id, plano_id, tipo_aula, valor_pago, professor_id, modalidade_nome, data_pagamento, data_vencimento')
    .eq('id', mensalidadeId)
    .eq('estudio_id', estudioId)
    .single();

  if (errMens || !mens) {
    throw new Error('Mensalidade não encontrada.');
  }

  const mensalidade = mens as Mensalidade;

  if (!mensalidade.aluno_id) {
    return { aviso: 'Mensalidade sem aluno vinculado. Nenhum repasse gerado.', gerados: 0 };
  }

  const { data: config, error: errConfig } = await supabase
    .from('configuracoes_repasse')
    .select('valor_1_modalidade, valor_multi_modalidade, plano_livre_pct_casa, plano_livre_pct_prof, aula_avulsa_valor, aula_avulsa_pct_prof, aula_avulsa_pct_casa, aula_experimental_valor, aula_experimental_pct_prof')
    .eq('estudio_id', estudioId)
    .single();

  if (errConfig || !config) throw new Error('Configurações de repasse não encontradas.');
  const cfg = config as ConfigRepasse;

  const dataBase = mensalidade.data_pagamento || mensalidade.data_vencimento;
  const [anoRef, mesRef] = dataBase.substring(0, 7).split('-').map(Number);
  const mesStr = String(mesRef).padStart(2, '0');
  const dataReferencia = `${anoRef}-${mesStr}-01`;
  const ultimoDia = new Date(anoRef, mesRef, 0).getDate();
  const inicioPeriodo = dataReferencia;
  const fimPeriodo = `${anoRef}-${mesStr}-${String(ultimoDia).padStart(2, '0')}`;

  const itens: {
    estudio_id: string;
    professor_id: string;
    aluno_id: string;
    mensalidade_id: string;
    tipo_aula: string;
    modalidade: string;
    valor: number;
    data_referencia: string;
  }[] = [];

  const idsLoteRemover: string[] = [];

  const { data: repassesLote } = await supabase
    .from('repasses_lancamentos')
    .select('id, modalidade, tipo_aula')
    .eq('estudio_id', estudioId)
    .eq('aluno_id', mensalidade.aluno_id)
    .eq('data_referencia', dataReferencia)
    .is('mensalidade_id', null);

  const loteJaGerado = new Map<string, string>();
  for (const r of repassesLote ?? []) {
    loteJaGerado.set(`${r.modalidade}|${r.tipo_aula}`, r.id);
  }

  if (mensalidade.tipo_aula === 'plano_livre') {
    const { data: presencas, error: errPresencas } = await supabase
      .from('presencas')
      .select(`
        aula_id,
        agenda (
          modalidades (
            id,
            nome,
            professor_id
          )
        )
      `)
      .eq('estudio_id', estudioId)
      .eq('aluno_id', mensalidade.aluno_id)
      .gte('data_checkin', `${inicioPeriodo}T00:00:00`)
      .lte('data_checkin', `${fimPeriodo}T23:59:59`)
      .not('aula_id', 'is', null);

    if (errPresencas) throw errPresencas;

    if (!presencas || presencas.length === 0) {
      return { aviso: 'Plano livre sem presenças no mês. Nenhum repasse gerado para professores.', gerados: 0 };
    }

    const modMap = new Map<string, { nome: string; professor_id: string }>();
    for (const p of presencas) {
      // deno-lint-ignore no-explicit-any
      const mod = (p.agenda as any)?.modalidades;
      if (mod?.id && mod?.professor_id) {
        modMap.set(mod.id, { nome: mod.nome, professor_id: mod.professor_id });
      }
    }

    if (modMap.size === 0) {
      return { aviso: 'Plano livre: presenças encontradas mas nenhuma modalidade com professor vinculado.', gerados: 0 };
    }

    const valorTotal = Number(mensalidade.valor_pago);
    const pctProf = Number(cfg.plano_livre_pct_prof) / 100;
    const parteProfs = valorTotal * pctProf;
    const modsArray = [...modMap.values()];
    const valoresPorMod = distribuirCentavos(parteProfs, modsArray.length);

    for (let i = 0; i < modsArray.length; i++) {
      const mod = modsArray[i];
      const chave = `${mod.nome}|plano_livre`;
      const idLote = loteJaGerado.get(chave);
      if (idLote) idsLoteRemover.push(idLote);
      itens.push({
        estudio_id: estudioId,
        professor_id: mod.professor_id,
        aluno_id: mensalidade.aluno_id!,
        mensalidade_id: mensalidadeId,
        tipo_aula: 'plano_livre',
        modalidade: mod.nome,
        valor: valoresPorMod[i],
        data_referencia: dataReferencia,
      });
    }
  } else if (mensalidade.tipo_aula === 'regular') {
    const { data: aluno } = await supabase
      .from('alunos')
      .select('modalidades_selecionadas')
      .eq('id', mensalidade.aluno_id)
      .eq('estudio_id', estudioId)
      .single();

    const modIds: string[] = aluno?.modalidades_selecionadas ?? [];

    if (modIds.length === 0) {
      return { aviso: 'Aluno sem modalidades vinculadas. Repasse não gerado.', gerados: 0 };
    }

    const { data: mods } = await supabase
      .from('modalidades')
      .select('id, nome, professor_id')
      .eq('estudio_id', estudioId)
      .in('id', modIds)
      .not('professor_id', 'is', null);

    const modsValidas = (mods ?? []) as { id: string; nome: string; professor_id: string }[];

    if (modsValidas.length === 0) {
      return { aviso: 'Modalidades sem professor vinculado. Repasse não gerado.', gerados: 0 };
    }

    const valorPorMod = modsValidas.length === 1
      ? Number(cfg.valor_1_modalidade)
      : Number(cfg.valor_multi_modalidade);

    for (const mod of modsValidas) {
      const chave = `${mod.nome}|regular`;
      const idLote = loteJaGerado.get(chave);
      if (idLote) idsLoteRemover.push(idLote);
      itens.push({
        estudio_id: estudioId,
        professor_id: mod.professor_id,
        aluno_id: mensalidade.aluno_id!,
        mensalidade_id: mensalidadeId,
        tipo_aula: 'regular',
        modalidade: mod.nome,
        valor: valorPorMod,
        data_referencia: dataReferencia,
      });
    }
  } else if (mensalidade.tipo_aula === 'avulsa') {
    if (!mensalidade.professor_id) {
      return { aviso: 'Aula avulsa sem professor. Repasse não gerado.', gerados: 0 };
    }

    const valorRepasse = Math.round(Number(mensalidade.valor_pago) * (cfg.aula_avulsa_pct_prof / 100) * 100) / 100;

    itens.push({
      estudio_id: estudioId,
      professor_id: mensalidade.professor_id,
      aluno_id: mensalidade.aluno_id!,
      mensalidade_id: mensalidadeId,
      tipo_aula: 'avulsa',
      modalidade: mensalidade.modalidade_nome ?? 'Avulsa',
      valor: valorRepasse,
      data_referencia: dataReferencia,
    });
  } else if (mensalidade.tipo_aula === 'experimental') {
    const pctProf = Number(cfg.aula_experimental_pct_prof);

    if (pctProf <= 0) {
      return { aviso: 'Aula experimental com percentual 0. Nenhum repasse gerado.', gerados: 0 };
    }
    if (!mensalidade.professor_id) {
      return { aviso: 'Aula experimental sem professor vinculado. Repasse não gerado.', gerados: 0 };
    }

    const valorRepasse = Math.round(Number(mensalidade.valor_pago) * (pctProf / 100) * 100) / 100;

    itens.push({
      estudio_id: estudioId,
      professor_id: mensalidade.professor_id,
      aluno_id: mensalidade.aluno_id!,
      mensalidade_id: mensalidadeId,
      tipo_aula: 'experimental',
      modalidade: mensalidade.modalidade_nome ?? 'Experimental',
      valor: valorRepasse,
      data_referencia: dataReferencia,
    });
  }

  if (itens.length === 0) {
    return { aviso: 'Nenhum repasse calculado para este tipo de aula.', gerados: 0 };
  }

  const { error: errRpc } = await supabase.rpc('substituir_repasses_mensalidade', {
    p_estudio_id: estudioId,
    p_mensalidade_id: mensalidadeId,
    p_ids_lote_remover: idsLoteRemover,
    p_itens: itens,
  });

  if (errRpc) throw errRpc;

  return {
    sucesso: true,
    gerados: itens.length,
    itens: itens.map(i => ({ modalidade: i.modalidade, valor: i.valor, tipo: i.tipo_aula })),
  };
}
