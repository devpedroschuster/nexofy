// webapp/src/services/cadastroService.js
import { supabase } from '../lib/supabase';
import { extrairMensagemErro } from '../lib/edgeFunctionError'; // CORREÇÃO: DRY — antes duplicado aqui

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

  if (data?.error) throw new Error(data.error);

  return data;
}

export const cadastroService = {
  slugDisponivel,
  criarMeuEstudio,
};