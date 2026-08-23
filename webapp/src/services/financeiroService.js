import { supabase } from '../lib/supabase';
import { gerarRepassesDaMensalidade } from './repasseService';

export const financeiroService = {
  /**
   * Lista mensalidades cujo período de cobertura [data_vencimento, periodo_fim]
   * tem QUALQUER sobreposição com o intervalo [inicio, fim] solicitado (mês
   * selecionado no Financeiro).
   *
   * ANTES: filtrava por igualdade estrita de data_vencimento dentro do mês.
   * Isso fazia pagamentos à vista de planos multi-mês (trimestral/semestral/
   * anual) desaparecerem da visão financeira nos meses seguintes ao mês em
   * que foram lançados — mesmo o aluno estando em dia. Ver migration
   * cobertura_pagamento_periodo (2026-08-22).
   *
   * Pagamentos parcelados/mensais não mudam de comportamento: para eles,
   * periodo_fim = data_vencimento, então a sobreposição de intervalo se
   * reduz exatamente à igualdade de mês que já existia.
   */
  async listarMensalidades(inicio, fim, estudioId) {
    const { data, error } = await supabase
      .from('mensalidades')
      .select(`
        *,
        alunos (nome_completo),
        planos (nome, preco, is_plano_livre, duracao_meses)
      `)
      .eq('estudio_id', estudioId)
      .lte('data_vencimento', fim)
      .gte('periodo_fim', inicio)
      .order('data_vencimento', { ascending: true });

    if (error) throw error;
    return data;
  },

  /**
   * Gera mensalidades para um determinado mês/ano.
   *
   * @param {number} mesNumero - Mês 1-indexed (1 = janeiro, 12 = dezembro).
   * @param {number} ano       - Ano com 4 dígitos (ex: 2025).
   * @param {string} estudioId - UUID do estúdio (Sprint 02 — obrigatório).
   */
  async gerarMensalidades(mesNumero, ano, estudioId) {
    if (mesNumero < 1 || mesNumero > 12) {
      throw new Error(
        `gerarMensalidades: mesNumero deve ser 1-indexed (1–12). Recebido: ${mesNumero}. ` +
        `Se estiver usando Date.getMonth(), lembre-se de somar 1.`
      );
    }

    // FIX (sprint RLS): estudioId é obrigatório — sem ele, os INSERTs abaixo
    // gravariam estudio_id: undefined. Falhar alto e claro aqui é melhor do
    // que descobrir isso só quando o RLS começar a rejeitar o INSERT.
    if (!estudioId) {
      throw new Error('gerarMensalidades: estudioId é obrigatório.');
    }

    const { data: alunos, error: errAlunos } = await supabase
      .from('alunos')
      .select('id, plano_id')
      .eq('estudio_id', estudioId)
      .eq('ativo', true)
      .not('plano_id', 'is', null);

    if (errAlunos) throw errAlunos;

    const tresMesesAtras = new Date();
    tresMesesAtras.setMonth(tresMesesAtras.getMonth() - 3);
    const filtroData = tresMesesAtras.toISOString().split('T')[0];

    const { data: ultimasMensalidades, error: errUltimas } = await supabase
      .from('mensalidades')
      .select('aluno_id, data_vencimento')
      .eq('estudio_id', estudioId)
      .gte('data_vencimento', filtroData)
      .order('data_vencimento', { ascending: false });

  if (errUltimas) throw errUltimas;

    const mapaUltimasDatas = new Map();
    ultimasMensalidades?.forEach(m => {
      if (!mapaUltimasDatas.has(m.aluno_id)) {
        mapaUltimasDatas.set(m.aluno_id, m.data_vencimento);
      }
    });

    const novasCobrancas = [];

    alunos.forEach(aluno => {
      const ultimaDataStr = mapaUltimasDatas.get(aluno.id);

      let proximaData;
      if (ultimaDataStr) {
        const d = new Date(ultimaDataStr + 'T12:00:00');
d.setMonth(d.getMonth() + 1);
        proximaData = d.toISOString().split('T')[0];
      } else {
        proximaData = `${ano}-${String(mesNumero).padStart(2, '0')}-10`;
      }

      const [pAno, pMes] = proximaData.split('-').map(Number);

      if (pAno === ano && pMes === mesNumero) {
        novasCobrancas.push({
          aluno_id: aluno.id,
          plano_id: aluno.plano_id,
          data_vencimento: proximaData,
          periodo_fim: proximaData, // cobrança mensal normal: cobre só o próprio mês
          status: 'pendente',
          estudio_id: estudioId, // Sprint 02
        });
      }
    });

    if (novasCobrancas.length > 0) {
      const { error: errInsert } = await supabase
        .from('mensalidades')
        .insert(novasCobrancas);
      if (errInsert) throw errInsert;
    }

    return true;
  },

  /**
   * Calcula até quando um pagamento cobre o aluno.
   *
   * @param {string} dataVencimento - 'YYYY-MM-DD'
   * @param {boolean} pagoAVista - se true, cobre os `duracaoMeses` inteiros do plano
   * @param {number} duracaoMeses - duração do plano em meses (1 para mensal)
   * @returns {string} 'YYYY-MM-DD' — igual a dataVencimento quando não é à vista
   *   ou quando o plano é mensal (duracaoMeses <= 1).
   */
  calcularPeriodoFim(dataVencimento, pagoAVista, duracaoMeses) {
    if (!pagoAVista || !duracaoMeses || duracaoMeses <= 1) {
      return dataVencimento;
    }
    const d = new Date(dataVencimento + 'T12:00:00');
    d.setMonth(d.getMonth() + (duracaoMeses - 1));
    return d.toISOString().split('T')[0];
  },

  // Sprint 02: estudioId obrigatório no INSERT de mensalidades manuais
  async adicionarPagamentoManual(dados, estudioId) {
    if (!estudioId) {
      throw new Error('adicionarPagamentoManual: estudioId é obrigatório.');
    }

    const dataVencimento = dados.data_vencimento;
    // pagoAVista + duracaoMeses vêm do formulário (ver ModalAdicionarPagamentoManual)
    // apenas quando tipo_aula === 'regular' e o plano selecionado tem duracao_meses > 1.
    const periodoFim = financeiroService.calcularPeriodoFim(
      dataVencimento,
      dados.pago_a_vista,
      dados.duracao_meses
    );

    const payload = {
      aluno_id: dados.aluno_id ? dados.aluno_id : null,
      nome_visitante: dados.nome_visitante ? dados.nome_visitante : null,
      plano_id: dados.plano_id ? dados.plano_id : null,
      professor_id: dados.professor_id ? dados.professor_id : null,
      modalidade_nome: dados.modalidade_nome ? dados.modalidade_nome : null,

      tipo_aula: dados.tipo_aula,
      valor_pago: Number(dados.valor_pago),
      status: dados.status || 'pago',

      forma_pagamento: dados.forma_pagamento,

      data_vencimento: dataVencimento,
      periodo_fim: periodoFim,
      data_pagamento: dados.status === 'pago' ? (dados.data_pagamento ?? dataVencimento) : null,

      estudio_id: estudioId, // Sprint 02
    };

    const { data, error } = await supabase
      .from('mensalidades')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error("Erro detalhado do Supabase:", error);
      throw error;
    }

    if (dados.status === 'pago') {
      try {
        // FIX (sprint RLS): gerarRepassesDaMensalidade agora exige estudioId
        // (a edge function gerar-repasses usa service role e precisa do
        // isolamento manual no body).
        await gerarRepassesDaMensalidade(data.id, estudioId);
      } catch (repasseError) {
        console.warn('[financeiroService] Repasse não gerado automaticamente.', repasseError);
        return { ...data, _avisoRepasse: 'Repasse não gerado automaticamente. Verifique manualmente.' };
      }
    }
    return data;
  },

  /**
   * Gera uma idempotency key estável para o fluxo de cobrança Asaas.
   * Chamar UMA VEZ ao abrir o modal/tela de cobrança (ex: useState(() =>
   * financeiroService.criarIdempotencyKey())), nunca dentro do onClick —
   * senão cada clique gera uma key nova e a proteção contra duplo-clique
   * não funciona.
   */
  criarIdempotencyKey() {
    return crypto.randomUUID();
  },

  /**
   * Cria (ou reaproveita, se já existir) uma cobrança Asaas para o aluno.
   *
   * @param {Object} params
   * @param {number} params.alunoId
   * @param {number|null} [params.planoId] - obrigatório se tipoCobranca='mensalidade'
   * @param {number} params.valor
   * @param {string} [params.formaPagamento='PIX']
   * @param {'mensalidade'|'avulso'} params.tipoCobranca
   * @param {string} [params.mesReferencia] - 'YYYY-MM', obrigatório se tipoCobranca='mensalidade'
   *   (usado para localizar a pendência já criada pelo cron de gerarMensalidades)
   * @param {boolean} [params.cobrePeriodoCompleto=false] - true se este pagamento único
   *   cobre os duracao_meses inteiros do plano (ex: semestral pago de uma vez)
   * @param {string} [params.descricao]
   * @param {string} params.idempotencyKey - gerado via criarIdempotencyKey(), estável
   *   durante o fluxo (não regenerar em retry/duplo-clique)
   * @returns {Promise<{link_pagamento: string, asaas_payment_id: string, reaproveitada?: boolean}>}
   */
  async criarCobrancaAsaas({
    alunoId,
    planoId = null,
    valor,
    formaPagamento = 'PIX',
    tipoCobranca,
    mesReferencia = null,
    cobrePeriodoCompleto = false,
    descricao = null,
    idempotencyKey,
  }) {
    const { data: { session } } = await supabase.auth.getSession();

    const { data, error } = await supabase.functions.invoke('criar-cobranca-asaas', {
      body: {
        aluno_id: alunoId,
        plano_id: planoId,
        valor,
        forma_pagamento: formaPagamento,
        tipo_cobranca: tipoCobranca,
        mes_referencia: mesReferencia,
        cobre_periodo_completo: cobrePeriodoCompleto,
        descricao,
        idempotency_key: idempotencyKey,
      },
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });

    if (error) throw new Error(error.message ?? 'Falha ao criar cobrança Asaas.');
    return data;
  },

  /**
   * @param {string} id     - id da mensalidade
   * @param {object} dados
   * @param {string} estudioId - UUID do estúdio (obrigatório — necessário
   *   para repassar à edge function gerar-repasses via gerarRepassesDaMensalidade).
   */
  async confirmarPagamento(id, dados, estudioId) {
    if (!estudioId) {
      throw new Error('confirmarPagamento: estudioId é obrigatório.');
    }

    const payload = {
      status: 'pago',
      valor_pago: dados.valor_pago,
      forma_pagamento: dados.forma_pagamento,
      tipo_aula: dados.tipo_aula || 'regular',
      professor_id: dados.professor_id || null,
      modalidade_nome: dados.modalidade_nome || null,
      data_pagamento: dados.data_pagamento || new Date().toISOString().split('T')[0],
    };

    const { error } = await supabase
      .from('mensalidades')
      .update(payload)
      .eq('id', id)
      .eq('estudio_id', estudioId);
    if (error) throw error;

try {
      // FIX (sprint RLS): mesmo tratamento de adicionarPagamentoManual —
      // a mensalidade já foi marcada como 'pago' acima; se a geração do
      // repasse falhar (edge function fora do ar, config ausente etc.),
      // isso não pode derrubar a confirmação inteira nem esconder do
      // usuário que o repasse ficou pendente.
      const resultado = await gerarRepassesDaMensalidade(id, estudioId);
      return { ok: true, resultado };
    } catch (repasseError) {
      console.warn('[financeiroService.confirmarPagamento] Repasse não gerado automaticamente.', repasseError);
      return { ok: true, _avisoRepasse: 'Pagamento confirmado, mas repasse não gerado automaticamente. Verifique manualmente.' };
    }
  },
};