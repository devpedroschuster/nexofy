import { supabase } from '../lib/supabase';
import { gerarRepassesDaMensalidade } from './repasseService';

export const financeiroService = {
  async listarMensalidades(inicio, fim) {
    const { data, error } = await supabase
      .from('mensalidades')
      .select(`
        *,
        alunos (nome_completo),
        planos (nome, preco, is_plano_livre)
      `)
      .gte('data_vencimento', inicio)
      .lte('data_vencimento', fim)
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
      .eq('ativo', true)
      .not('plano_id', 'is', null);

    if (errAlunos) throw errAlunos;

    const tresMesesAtras = new Date();
    tresMesesAtras.setMonth(tresMesesAtras.getMonth() - 3);
    const filtroData = tresMesesAtras.toISOString().split('T')[0];

    const { data: ultimasMensalidades } = await supabase
      .from('mensalidades')
      .select('aluno_id, data_vencimento')
      .gte('data_vencimento', filtroData)
      .order('data_vencimento', { ascending: false });

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
        d.setDate(d.getDate() + 30);
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

  // Sprint 02: estudioId obrigatório no INSERT de mensalidades manuais
  async adicionarPagamentoManual(dados, estudioId) {
    if (!estudioId) {
      throw new Error('adicionarPagamentoManual: estudioId é obrigatório.');
    }

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

      data_vencimento: dados.data_vencimento,
      data_pagamento: dados.status === 'pago' ? (dados.data_pagamento ?? dados.data_vencimento) : null,

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
      .eq('id', id);
    if (error) throw error;

    const resultado = await gerarRepassesDaMensalidade(id, estudioId);
    return { ok: true, resultado };
  },
};