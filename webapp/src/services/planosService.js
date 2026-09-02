import { supabase } from '../lib/supabase';

const COLUNAS_PLANO =
  'id, nome, preco, frequencia_semanal, duracao_meses, regras_acesso, ' +
  'comissao_professor, comissao_espaco, comissao_diretor, is_plano_livre, estudio_id';

const MAX_REGRAS_ACESSO = 10;

// Mesma regra usada em modalidadeService.salvar: a soma das comissões deve
// ser 100 (rateio definido) ou 0 (ainda não definido — permitido pela
// constraint check_soma_comissoes do banco). Qualquer outro valor é bloqueado
// aqui, antes de chegar no banco, para dar um erro claro ao usuário em vez
// de deixar a constraint estourar como um Postgres error genérico.
function validarComissoes(plano) {
  const professor = Number(plano.comissao_professor) || 0;
  const espaco = Number(plano.comissao_espaco) || 0;
  const diretor = Number(plano.comissao_diretor) || 0;
  const soma = professor + espaco + diretor;

  if (soma !== 100 && soma !== 0) {
    throw new Error('A soma das comissões (professor + espaço + direção) deve ser exatamente 100% ou 0%.');
  }
  return { professor, espaco, diretor };
}

function validarPayload(plano) {
  const preco = Number(plano.preco);
  if (!Number.isFinite(preco) || preco <= 0) {
    throw new Error('Preço inválido.');
  }
  const duracao = Number(plano.duracao_meses);
  if (!Number.isInteger(duracao) || duracao < 1 || duracao > 24) {
    throw new Error('Duração inválida.');
  }
  const regras = Array.isArray(plano.regras_acesso) ? plano.regras_acesso : [];
  if (regras.length > MAX_REGRAS_ACESSO) {
    throw new Error('Número de regras de acesso excede o limite permitido.');
  }
  const { professor, espaco, diretor } = validarComissoes(plano);

  return {
    preco,
    duracao,
    regras,
    comissao_professor: professor,
    comissao_espaco: espaco,
    comissao_diretor: diretor,
  };
}

export const planosService = {
  async listar(estudioId) {
    const { data, error } = await supabase
      .from('planos')
      .select(COLUNAS_PLANO)
      .eq('estudio_id', estudioId)
      .order('id', { ascending: true });

    if (error) throw error;
    return data;
  },

  async contar(estudioId) {
    const { count, error } = await supabase
      .from('planos')
      .select('id', { count: 'exact', head: true })
      .eq('estudio_id', estudioId);
    if (error) throw error;
    return count || 0;
  },

  // Sprint 02: estudioId obrigatório no INSERT de planos.
  // FIX: validação defensiva no service — não confia apenas no formulário do client.
  // FIX: inclui comissao_* e is_plano_livre, antes ausentes do payload (campos
  // usados por outros módulos — relatório financeiro, mensalidades — mas nunca
  // graváveis pela tela de Planos).
  async salvar(plano, estudioId) {
    const {
      preco, duracao, regras,
      comissao_professor, comissao_espaco, comissao_diretor,
    } = validarPayload(plano);

    const payload = {
      nome: plano.nome,
      preco,
      frequencia_semanal: plano.frequencia_semanal,
      duracao_meses: duracao,
      regras_acesso: regras,
      comissao_professor,
      comissao_espaco,
      comissao_diretor,
      is_plano_livre: !!plano.is_plano_livre,
    };

    if (plano.id) {
      const { data, error } = await supabase
        .from('planos')
        .update(payload)
        .eq('id', plano.id)
        .eq('estudio_id', estudioId)
        .select(COLUNAS_PLANO);
      if (error) throw error;
      return data;
    } else {
      const { data, error } = await supabase
        .from('planos')
        .insert([{ ...payload, estudio_id: estudioId }])
        .select(COLUNAS_PLANO);
      if (error) throw error;
      return data;
    }
  },

  async excluir(id, estudioId) {
    const { error } = await supabase
      .from('planos')
      .delete()
      .eq('id', id)
      .eq('estudio_id', estudioId);
    if (error) throw error;
    return true;
  },
};