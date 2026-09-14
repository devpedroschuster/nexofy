import { supabase } from '../lib/supabase';

// ─────────────────────────────────────────────────────────────────────────
// listaEsperaService
//
// Lista de espera automática para turma lotada. O aluno nunca lê/escreve a
// tabela `lista_espera` diretamente (RLS só libera estudio_membros, mesmo
// padrão de `presencas`) — toda a superfície passa pelas RPCs
// `entrar_lista_espera`/`sair_lista_espera`/`listar_minha_fila`
// (SECURITY DEFINER, ver supabase/migrations/20260913200000_*.sql).
// A promoção em si é automática (trigger em `presencas`) — este service
// não tem nenhuma chamada de "promover".
// ─────────────────────────────────────────────────────────────────────────

export const listaEsperaService = {
  async entrar({ alunoId, aulaId, dataAula }, estudioId) {
    const { data, error } = await supabase.rpc('entrar_lista_espera', {
      p_estudio_id: estudioId,
      p_aluno_id: alunoId,
      p_aula_id: aulaId,
      p_data_aula: dataAula,
    });
    if (error) throw error;
    return data;
  },

  async sair(listaEsperaId, estudioId) {
    const { data, error } = await supabase.rpc('sair_lista_espera', {
      p_estudio_id: estudioId,
      p_lista_espera_id: listaEsperaId,
    });
    if (error) throw error;
    return data;
  },

  async listarMinhaFila(alunoId, estudioId) {
    const { data, error } = await supabase.rpc('listar_minha_fila', {
      p_estudio_id: estudioId,
      p_aluno_id: alunoId,
    });
    if (error) throw error;
    return data || [];
  },
};
