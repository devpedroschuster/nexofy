import { supabase } from '../lib/supabase';
import { sanitizarMetadata } from '../lib/camposSistema';
import { ehMenorDeIdade } from '../lib/utils';

// PED-170 (LGPD art. 14): dado sensível de saúde (anamnese/observações
// médicas) de aluno menor de idade nunca pode ser gravado sem consentimento
// do responsável legal já registrado em `consentimentos_responsavel_legal`.
// Esta checagem é defesa em profundidade — a validação "de verdade" (que
// nenhum client pode contornar, nem chamando o REST direto) é o trigger
// `bloquear_dados_sensiveis_menor_sem_consentimento` no banco; aqui existe
// só pra dar um erro claro na tela em vez do operador ver a mensagem crua
// do Postgres.
const CAMPOS_SENSIVEIS_SAUDE = ['link_anamnese', 'observacoes_medicas'];

function tocaCampoSensivelSaude(payload) {
  return CAMPOS_SENSIVEIS_SAUDE.some((campo) => campo in payload && payload[campo]);
}

const ERRO_MENOR_SEM_CONSENTIMENTO =
  'Este aluno é menor de idade e ainda não há consentimento do responsável legal ' +
  'registrado. Registre o consentimento (nome, CPF e parentesco do responsável) ' +
  'antes de preencher dados sensíveis de saúde.';

async function possuiConsentimentoResponsavel(alunoId, estudioId) {
  const { data, error } = await supabase
    .from('consentimentos_responsavel_legal')
    .select('id')
    .eq('aluno_id', alunoId)
    .eq('estudio_id', estudioId)
    .limit(1);

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

// Campos que o cliente pode efetivamente gravar em `alunos` a partir destes
// dois métodos. `role`, `estudio_id`, `id`, `auth_id` e afins nunca entram
// por aqui — mudança de papel/tenant deve passar por um fluxo dedicado e
// autorizado no backend (Edge Function/RPC), nunca por um update genérico.
//
// 'metadata' foi adicionado para suportar campos_dinamicos (item 1 do plano
// multi-segmento). O valor passado aqui NUNCA é gravado direto — sempre
// passa por sanitizarMetadata() (remove chaves reservadas do sistema) e,
// em atualizar(), por um merge com o metadata já existente (ver função
// mesclarMetadata abaixo), para uma edição parcial não apagar campos
// dinâmicos que não fazem parte do form que originou esta chamada.
const CAMPOS_ATUALIZAVEIS = [
  'nome_completo', 'email', 'cpf', 'telefone', 'data_nascimento',
  'plano_id', 'data_inicio_plano', 'data_fim_plano',
  'modalidades_selecionadas', 'contato_emergencia',
  'cep', 'rua', 'numero', 'complemento', 'bairro', 'cidade',
  'link_anamnese', 'observacoes_medicas',
  'metadata',
];

function filtrarCamposPermitidos(dados) {
  const filtrado = Object.fromEntries(
    Object.entries(dados).filter(([chave]) => CAMPOS_ATUALIZAVEIS.includes(chave))
  );

  if ('metadata' in filtrado) {
    filtrado.metadata = sanitizarMetadata(filtrado.metadata ?? {});
  }

  return filtrado;
}

/**
 * Faz merge raso entre o metadata já gravado no banco e os valores novos
 * enviados nesta chamada. Sem isso, um `update` parcial (ex.: só o form de
 * "dados médicos") sobrescreveria o jsonb inteiro e apagaria valores de
 * outros campos dinâmicos que não estavam nesse form específico.
 *
 * Só é chamada dentro de `atualizar` — em `criar` não há metadata prévio,
 * então o valor sanitizado já é o final.
 */
async function mesclarMetadata(alunoId, estudioId, metadataNovo) {
  const { data, error } = await supabase
    .from('alunos')
    .select('metadata')
    .eq('id', alunoId)
    .eq('estudio_id', estudioId)
    .single();

  if (error) throw error;

  return {
    ...(data?.metadata ?? {}),
    ...metadataNovo,
  };
}

export const alunosService = {
  async listar(filtros = {}, paginacao = {}, estudioId) {
    try {
      const { pagina = 1, tamanho = 25 } = paginacao;
      const inicio = (pagina - 1) * tamanho;
      const fim    = inicio + tamanho - 1;

      let query = supabase
  .from('alunos')
  .select(
    'id, nome_completo, email, role, ativo, plano_id, data_fim_plano, planos(nome)',
    { count: 'exact' }
  )
  .eq('estudio_id', estudioId);

      if (filtros.role && filtros.role !== 'todos')
        query = query.eq('role', filtros.role);

      if (filtros.busca) {
  const termo = filtros.busca.replace(/[,()%_]/g, '\\$&');
  query = query.or(`nome_completo.ilike.%${termo}%,email.ilike.%${termo}%`);
}

      if (filtros.letraInicial) {
        const letra = filtros.letraInicial.replace(/[,()%_]/g, '\\$&');
        query = query.ilike('nome_completo', `${letra}%`);
      }

      const { data, error, count } = await query
        .order('nome_completo')
        .range(inicio, fim);

      if (error) throw error;
      return { data, count };
    } catch (error) {
      console.error('[alunosService.listar]', error);
      throw error;
    }
  },

  async listarAtivos(estudioId) {
    try {
      const { data, error } = await supabase
        .from('alunos')
        .select('id, nome_completo')
        .eq('estudio_id', estudioId)
        .eq('ativo', true)
        .eq('role', 'aluno')
        .order('nome_completo');

      if (error) throw error;
      return data ?? [];
    } catch (error) {
      console.error('[alunosService.listarAtivos]', error);
      throw error;
    }
  },

  // Sprint 02: estudioId obrigatório em todos os INSERTs
  // SEC-01 (defense-in-depth): role, estudio_id, id etc. nunca vêm de `dados` —
  // só os campos em CAMPOS_ATUALIZAVEIS são gravados; role fica sempre 'aluno'
  // por padrão do banco, e estudio_id é sempre o do parâmetro autenticado.
  async criar(dados, estudioId) {
    try {
      const payload = filtrarCamposPermitidos(dados);

      // Na criação não há como já existir um registro de consentimento
      // (o aluno_id do vínculo nem existe ainda) — então dado sensível de
      // saúde preenchido já no cadastro de um menor é sempre rejeitado.
      // Na prática o form de cadastro (NovoAluno.jsx) nunca envia esses
      // campos nesta chamada; isso cobre outros caminhos (import, etc.).
      if (tocaCampoSensivelSaude(payload) && ehMenorDeIdade(dados.data_nascimento)) {
        throw new Error(ERRO_MENOR_SEM_CONSENTIMENTO);
      }

      const { data, error } = await supabase
        .from('alunos')
        .insert([{ ...payload, estudio_id: estudioId }])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('[alunosService.criar]', error);
      throw error;
    }
  },

  async atualizar(id, dados, estudioId) {
    try {
      const payload = filtrarCamposPermitidos(dados);

      if (tocaCampoSensivelSaude(payload)) {
        const { data: alunoAtual, error: errAluno } = await supabase
          .from('alunos')
          .select('data_nascimento')
          .eq('id', id)
          .eq('estudio_id', estudioId)
          .single();
        if (errAluno) throw errAluno;

        if (ehMenorDeIdade(alunoAtual?.data_nascimento)) {
          const temConsentimento = await possuiConsentimentoResponsavel(id, estudioId);
          if (!temConsentimento) throw new Error(ERRO_MENOR_SEM_CONSENTIMENTO);
        }
      }

      // Merge parcial: só entra em ação se este update de fato tocar em
      // metadata. Uma edição que não envolve campos dinâmicos (ex.: só
      // trocar o telefone) nem chama mesclarMetadata, evitando um SELECT
      // extra desnecessário no caminho mais comum.
      if ('metadata' in payload) {
        payload.metadata = await mesclarMetadata(id, estudioId, payload.metadata);
      }

      const { data, error } = await supabase
        .from('alunos')
        .update(payload)
        .eq('id', id)
        .eq('estudio_id', estudioId) // Bug #4: impede UPDATE cross-tenant
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('[alunosService.atualizar]', error);
      throw error;
    }
  },

  async excluir(id, estudioId) {
    try {
      const { error } = await supabase
        .from('alunos')
        .delete()
        .eq('id', id)
        .eq('estudio_id', estudioId); // Bug #4: impede DELETE cross-tenant

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('[alunosService.excluir]', error);
      throw error;
    }
  },

  // Bug #4: estudioId adicionado como parâmetro e aplicado como filtro no UPDATE.
  // A versão anterior filtrava apenas por id — sem o filtro de tenant, um admin
  // de outro estúdio que conhecesse o UUID poderia desativar/reativar o aluno.
  // O padrão segue o já aplicado em `atualizar` e `excluir` (defense-in-depth
  // além do RLS).
  async alterarStatus(id, novoStatus, estudioId) {
    try {
      const { error } = await supabase
        .from('alunos')
        .update({ ativo: novoStatus })
        .eq('id', id)
        .eq('estudio_id', estudioId); // barreira cross-tenant

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('[alunosService.alterarStatus]', error);
      throw error;
    }
  },

  async listarAniversariantes(estudioId) {
    try {
      const { data, error } = await supabase
        .from('alunos')
        .select('id, nome_completo, data_nascimento, telefone, planos(nome)')
        .eq('estudio_id', estudioId)
        .not('data_nascimento', 'is', null);

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('[alunosService.listarAniversariantes]', error);
      throw error;
    }
  },

  async buscarPerfilCompleto(alunoId, estudioId) {
    try {
      const { data, error } = await supabase
        .from('alunos')
        .select(`
          *,
          planos (nome, regras_acesso)
        `)
        .eq('id', alunoId)
        .eq('estudio_id', estudioId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('[alunosService.buscarPerfilCompleto]', error);
      throw error;
    }
  },

  async buscarHistoricoPlanos(alunoId, estudioId) {
    try {
      const { data, error } = await supabase
        .from('historico_planos')
        .select(`
          *,
          planos (nome, regras_acesso)
        `)
        .eq('aluno_id', alunoId)
        .eq('estudio_id', estudioId)
        .order('data_inicio', { ascending: false });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('[alunosService.buscarHistoricoPlanos]', error);
      throw error;
    }
  },

  async buscarHistoricoFrequencia(alunoId, estudioId) {
    try {
      const { data, error } = await supabase
        .from('presencas')
        .select(`
          *,
          agenda (atividade)
        `)
        .eq('aluno_id', alunoId)
        .eq('estudio_id', estudioId)
        .order('data_checkin', { ascending: false });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('[alunosService.buscarHistoricoFrequencia]', error);
      throw error;
    }
  },

  // ─────────────────────────────────────────────────────────────
  // BP-01 FIX: operações encadeadas substituídas por RPC
  // Todas as escritas ocorrem dentro de uma única transação
  // Postgres — se qualquer etapa falhar, o banco faz rollback
  // automático e nenhuma escrita parcial é persistida.
  // ─────────────────────────────────────────────────────────────

  /**
   * Renova o plano de um aluno de forma atômica via RPC.
   * Função SQL correspondente: renovar_plano_aluno()
   */
  async renovarPlano(alunoId, dadosRenovacao, estudioId) {
    try {
      const { error } = await supabase.rpc('renovar_plano_aluno', {
        p_aluno_id:    alunoId,
        p_plano_id:    dadosRenovacao.plano_id,
        p_data_inicio: dadosRenovacao.data_inicio,
        p_data_fim:    dadosRenovacao.data_fim,
        p_valor_pago:  dadosRenovacao.valor_pago ?? 0,
        p_estudio_id:  estudioId,
      });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('[alunosService.renovarPlano]', error);
      throw error;
    }
  },

  /**
   * Matricula um aluno em um plano de forma atômica via RPC.
   * Função SQL correspondente: matricular_aluno()
   */
  async matricular(alunoId, planoId, { dataVencimento, modalidades = [] }, estudioId) {
    try {
      const { data: plano, error: errPlano } = await supabase
        .from('planos')
        .select('id, nome, preco, duracao_meses')
        .eq('estudio_id', estudioId)
        .eq('id', planoId)
        .single();

      if (errPlano) throw errPlano;

      const dataInicio = new Date().toISOString().split('T')[0];
      const dataFimObj = new Date(`${dataVencimento}T12:00:00`);
      dataFimObj.setMonth(dataFimObj.getMonth() + (plano.duracao_meses || 1));
      dataFimObj.setDate(dataFimObj.getDate() - 1);
      const dataFim = dataFimObj.toISOString().split('T')[0];

      const descricao = `Matrícula: ${plano.nome} (${plano.duracao_meses} ${
        plano.duracao_meses === 1 ? 'mês' : 'meses'
      })`;

      const { error } = await supabase.rpc('matricular_aluno', {
        p_aluno_id:    alunoId,
        p_plano_id:    planoId,
        p_data_inicio: dataInicio,
        p_data_fim:    dataFim,
        p_vencimento:  dataVencimento,
        p_modalidades: modalidades,
        p_valor_pago:  plano.preco ?? 0,
        p_descricao:   descricao,
        p_estudio_id:  estudioId,
      });

      if (error) throw error;
      return { plano, dataInicio, dataFim };
    } catch (error) {
      console.error('[alunosService.matricular]', error);
      throw error;
    }
  },

  /**
   * Matricula um aluno importado num plano SEM gerar mensalidade — usado
   * pelo import de planilha (PED-106). Ao contrário de `matricular`, não
   * recebe vencimento/descrição/modalidades: o import não cobra
   * automaticamente nem seleciona modalidade.
   * Função SQL correspondente: importar_matricula_aluno()
   */
  async matricularSemMensalidade(alunoId, planoId, estudioId) {
    try {
      const { data: plano, error: errPlano } = await supabase
        .from('planos')
        .select('id, duracao_meses')
        .eq('estudio_id', estudioId)
        .eq('id', planoId)
        .single();

      if (errPlano) throw errPlano;

      const dataInicio = new Date().toISOString().split('T')[0];
      const dataFimObj = new Date(`${dataInicio}T12:00:00`);
      dataFimObj.setMonth(dataFimObj.getMonth() + (plano.duracao_meses || 1));
      dataFimObj.setDate(dataFimObj.getDate() - 1);
      const dataFim = dataFimObj.toISOString().split('T')[0];

      const { error } = await supabase.rpc('importar_matricula_aluno', {
        p_aluno_id:    alunoId,
        p_plano_id:    planoId,
        p_data_inicio: dataInicio,
        p_data_fim:    dataFim,
        p_estudio_id:  estudioId,
      });

      if (error) throw error;
      return { dataInicio, dataFim };
    } catch (error) {
      console.error('[alunosService.matricularSemMensalidade]', error);
      throw error;
    }
  },

  async normalizarHistoricoPlanos(estudioId) {
    try {
      const { data: alunos, error: errAlunos } = await supabase
        .from('alunos')
        .select('id, plano_id, data_inicio_plano, data_fim_plano, created_at')
        .eq('estudio_id', estudioId)
        .not('plano_id', 'is', null);

      if (errAlunos) throw errAlunos;
      if (!alunos?.length) return { normalizados: 0, ignorados: 0 };

      const { data: historicosAtivos, error: errHistoricos } = await supabase
        .from('historico_planos')
        .select('aluno_id')
        .eq('status', 'ativo')
        .in('aluno_id', alunos.map(a => a.id));

      if (errHistoricos) throw errHistoricos;

      const comHistorico = new Set(historicosAtivos?.map(h => h.aluno_id));

      const hoje = new Date();
      const calcularDataFimFallback = () => {
        const fallback = new Date(hoje);
        fallback.setDate(fallback.getDate() + 30);
        return fallback.toISOString().split('T')[0];
      };

      const alunosSemHistorico = alunos.filter(a => !comHistorico.has(a.id));
      const ignorados = alunos.length - alunosSemHistorico.length;

      if (!alunosSemHistorico.length) {
        console.info('[normalizarHistoricoPlanos] Nenhum aluno sem histórico ativo.');
        return { normalizados: 0, ignorados };
      }

      const inserts = alunosSemHistorico.map(a => ({
        aluno_id:    a.id,
        plano_id:    a.plano_id,
        data_inicio: a.data_inicio_plano || a.created_at?.split('T')[0] || hoje.toISOString().split('T')[0],
        data_fim:    a.data_fim_plano    || calcularDataFimFallback(),
        status:      'ativo',
        estudio_id:  estudioId,
      }));

      const { error: errInsert } = await supabase
        .from('historico_planos')
        .insert(inserts);

      if (errInsert) throw errInsert;
      return { normalizados: inserts.length, ignorados };
    } catch (error) {
      console.error('[alunosService.normalizarHistoricoPlanos]', error);
      throw error;
    }
  },

  /**
   * Registra o consentimento do responsável legal para um aluno menor de
   * idade (PED-170 / LGPD art. 14). Sempre um INSERT novo — nunca um
   * update — em `consentimentos_responsavel_legal`, mesmo padrão
   * append-only de `consentimentos` (a linha é a própria prova do
   * consentimento; alterá-la depois destruiria esse valor probatório).
   */
  async registrarConsentimentoResponsavel(alunoId, estudioId, { nome, cpf, parentesco }) {
    try {
      const { data, error } = await supabase
        .from('consentimentos_responsavel_legal')
        .insert([{
          aluno_id: alunoId,
          estudio_id: estudioId,
          nome_responsavel: nome,
          cpf_responsavel: cpf || null,
          parentesco,
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('[alunosService.registrarConsentimentoResponsavel]', error);
      throw error;
    }
  },

  /** Consentimento mais recente do responsável legal, ou null se nenhum foi registrado. */
  async buscarConsentimentoResponsavel(alunoId, estudioId) {
    try {
      const { data, error } = await supabase
        .from('consentimentos_responsavel_legal')
        .select('*')
        .eq('aluno_id', alunoId)
        .eq('estudio_id', estudioId)
        .order('aceito_em', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('[alunosService.buscarConsentimentoResponsavel]', error);
      throw error;
    }
  },
};