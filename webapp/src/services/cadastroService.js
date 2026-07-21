// webapp/src/services/cadastroService.js
//
// Serviço do fluxo de cadastro self-service (novo cliente Nexofy).
// Diferente do superAdminService.criarEstudio(), aqui quem chama é o
// próprio usuário recém-autenticado — não um super_admin.
//
// A Edge Function `criar-meu-estudio` reaproveita a mesma RPC transacional
// `criar_estudio_transacional` usada no fluxo admin, então a garantia de
// atomicidade (estudios + profiles + estudio_membros + configuracoes_repasse
// em uma única transação) é a mesma.

import { supabase } from '../lib/supabase';

/**
 * Verifica se um slug está disponível.
 * Usa a mesma tabela/policy pública que useEstudioPublico já consulta,
 * então funciona tanto autenticado quanto não.
 */
async function slugDisponivel(slug) {
  const slugNorm = slug.trim().toLowerCase();
  if (!slugNorm) return null;

  const { data, error } = await supabase
    .from('estudios')
    .select('id')
    .eq('slug', slugNorm)
    .maybeSingle();

  if (error) throw error;
  return !data;
}

/**
 * Chama a Edge Function `criar-meu-estudio`.
 * Requer sessão autenticada (a function usa o JWT do caller).
 * Retorna { estudio: { id, nome, slug } }
 */
async function criarMeuEstudio({ nome, slug, whatsapp, instagram }) {
  const { data, error } = await supabase.functions.invoke('criar-meu-estudio', {
    body: {
      nome: nome.trim(),
      slug: slug.trim(),
      whatsapp: whatsapp?.trim() || undefined,
      instagram: instagram?.trim() || undefined,
    },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  return data;
}

export const cadastroService = {
  slugDisponivel,
  criarMeuEstudio,
};