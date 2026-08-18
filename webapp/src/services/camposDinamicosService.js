import { supabase } from '../lib/supabase';
import { validarFieldName } from '../lib/camposSistema';

const ENTIDADE_PADRAO = 'aluno';

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

  async atualizar(id, dados, estudioId) {
    try {
      const { field_name, ...permitido } = filtrarCamposPermitidos(dados);
      void field_name;

      const { data, error } = await supabase
        .from('campos_dinamicos')
        .update(permitido)
        .eq('id', id)
        .eq('estudio_id', estudioId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('[camposDinamicosService.atualizar]', error);
      throw error;
    }
  },

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

  async reordenar(itens, estudioId) {
    try {
      if (!itens?.length) return true;
 
      const resultados = await Promise.all(
        itens.map(({ id, display_order }) =>
          supabase
            .from('campos_dinamicos')
            .update({ display_order })
            .eq('id', id)
            .eq('estudio_id', estudioId)
        )
      );
 
      const erro = resultados.find((r) => r.error)?.error;
      if (erro) throw erro;
 
      return true;
    } catch (error) {
      console.error('[camposDinamicosService.reordenar]', error);
      throw error;
    }
  },
};