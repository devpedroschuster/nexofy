import { supabase } from '../lib/supabase';
import { validarFieldName } from '../lib/camposSistema';

const ENTIDADE_PADRAO = 'aluno';

// Campos que o client pode efetivamente gravar em `campos_dinamicos`.
// estudio_id, id, created_at, updated_at nunca entram por aqui — mesmo
// racional de CAMPOS_ATUALIZAVEIS em alunosService.js.
const CAMPOS_GRAVAVEIS = [
  'field_name', 'label', 'field_type', 'opcoes',
  'is_required', 'is_active', 'display_order',
];

function filtrarCamposPermitidos(dados) {
  return Object.fromEntries(
    Object.entries(dados).filter(([chave]) => CAMPOS_GRAVAVEIS.includes(chave))
  );
}

export const camposDinamicosService = {
  /**
   * Lista campos ativos de um estúdio, ordenados para montar form/tabela.
   * Por padrão só traz is_active=true; passe incluirInativos=true para telas
   * de administração que precisam listar tudo (ex.: reativar um campo).
   */
  async listar(estudioId, { entidade = ENTIDADE_PADRAO, incluirInativos = false } = {}) {
    try {
      let query = supabase
        .from('campos_dinamicos')
        .select('id, field_name, label, field_type, opcoes, is_required, is_active, display_order')
        .eq('estudio_id', estudioId)
        .eq('entidade', entidade);

      if (!incluirInativos) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query.order('display_order').order('label');

      if (error) throw error;
      return data ?? [];
    } catch (error) {
      console.error('[camposDinamicosService.listar]', error);
      throw error;
    }
  },

  /**
   * Cria um campo dinâmico. Revalida field_name no server (defense-in-depth,
   * não confia apenas na validação Yup do client) e força entidade/estudio_id
   * a partir dos parâmetros autenticados, nunca de `dados`.
   */
  async criar(dados, estudioId, entidade = ENTIDADE_PADRAO) {
    try {
      const { valido, erro } = validarFieldName(dados.field_name);
      if (!valido) {
        throw new Error(erro);
      }

      const payload = {
        ...filtrarCamposPermitidos(dados),
        estudio_id: estudioId,
        entidade,
      };

      const { data, error } = await supabase
        .from('campos_dinamicos')
        .insert([payload])
        .select()
        .single();

      if (error) {
        // 23505 = unique_violation — já existe esse field_name neste estúdio
        if (error.code === '23505') {
          throw new Error(`Já existe um campo com o identificador "${dados.field_name}" neste estúdio.`);
        }
        throw error;
      }
      return data;
    } catch (error) {
      console.error('[camposDinamicosService.criar]', error);
      throw error;
    }
  },

  /**
   * Atualiza um campo dinâmico existente. field_name propositalmente NÃO é
   * atualizável aqui — mudar o slug depois de já existir alunos com valor
   * gravado sob a chave antiga órfã o dado no metadata. Quem precisar
   * "renomear" deve criar um novo campo e migrar os dados manualmente.
   */
  async atualizar(id, dados, estudioId) {
    try {
      const { field_name, ...permitido } = filtrarCamposPermitidos(dados);
      void field_name; // ignorado deliberadamente — ver comentário acima

      const { data, error } = await supabase
        .from('campos_dinamicos')
        .update(permitido)
        .eq('id', id)
        .eq('estudio_id', estudioId) // impede update cross-tenant, mesmo padrão de alunosService
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('[camposDinamicosService.atualizar]', error);
      throw error;
    }
  },

  /**
   * Desativação lógica (soft delete). Nunca fazemos DELETE físico aqui:
   * alunos antigos podem ter valor gravado em metadata sob esse field_name,
   * e apagar a definição sem apagar o dado quebraria a exibição de histórico.
   */
  async desativar(id, estudioId) {
    try {
      const { error } = await supabase
        .from('campos_dinamicos')
        .update({ is_active: false })
        .eq('id', id)
        .eq('estudio_id', estudioId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('[camposDinamicosService.desativar]', error);
      throw error;
    }
  },

  async reativar(id, estudioId) {
    try {
      const { error } = await supabase
        .from('campos_dinamicos')
        .update({ is_active: true })
        .eq('id', id)
        .eq('estudio_id', estudioId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('[camposDinamicosService.reativar]', error);
      throw error;
    }
  },

  /**
   * Reordena em lote (drag-and-drop na tela de admin). Recebe uma lista de
   * { id, display_order } já calculada no client. Usa upsert para uma única
   * viagem ao banco em vez de N updates sequenciais.
   */
  async reordenar(itens, estudioId) {
    try {
      if (!itens?.length) return true;

      const payload = itens.map(({ id, display_order }) => ({
        id,
        display_order,
        estudio_id: estudioId, // reforça tenant em cada linha do upsert
      }));

      const { error } = await supabase
        .from('campos_dinamicos')
        .upsert(payload, { onConflict: 'id' });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('[camposDinamicosService.reordenar]', error);
      throw error;
    }
  },
};