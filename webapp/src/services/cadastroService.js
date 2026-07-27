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
  const slugNorm = (slug ?? '').trim().toLowerCase();
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
 * Extrai a mensagem de erro real do corpo de uma resposta não-2xx da Edge
 * Function. O supabase-js (functions.invoke) NÃO parseia automaticamente o
 * corpo JSON quando o status é não-2xx — ele só seta `error` como um
 * FunctionsHttpError genérico ("Edge Function returned a non-2xx status
 * code") e guarda a Response original em `error.context`. Sem isso, todas
 * as mensagens de negócio da function (slug em uso, conta já vinculada,
 * e-mail não confirmado etc.) ficam invisíveis pro usuário.
 */
async function extrairMensagemErro(error, fallback) {
  try {
    const corpo = await error?.context?.json();
    if (corpo?.error) return corpo.error;
  } catch {
    // corpo ausente, já consumido, ou não era JSON — usa o fallback
  }
  return error?.message || fallback;
}

/**
 * Chama a Edge Function `criar-meu-estudio`.
 * Requer sessão autenticada (a function usa o JWT do caller).
 * Retorna { estudio: { id, nome, slug } }
 */
async function criarMeuEstudio({ nome, slug, whatsapp, instagram }) {
  if (!nome?.trim() || !slug?.trim()) {
    throw new Error('Nome e slug do estúdio são obrigatórios.');
  }

  const { data, error } = await supabase.functions.invoke('criar-meu-estudio', {
    body: {
      nome: nome.trim(),
      slug: slug.trim(),
      whatsapp: whatsapp?.trim() || undefined,
      instagram: instagram?.trim() || undefined,
    },
  });

  if (error) {
    const mensagem = await extrairMensagemErro(error, 'Erro ao criar estúdio.');
    throw new Error(mensagem);
  }

  // Fallback defensivo, caso a function algum dia passe a retornar 200 com
  // um payload de erro em vez de status HTTP não-2xx.
  if (data?.error) throw new Error(data.error);

  return data;
}

export const cadastroService = {
  slugDisponivel,
  criarMeuEstudio,
};