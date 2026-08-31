// criarEstudio agora usa a mesma lógica de extração de mensagem
// de erro que cadastroService.criarMeuEstudio já usa — sem isso, qualquer
// erro de negócio retornado pela Edge Function `criar-estudio` (slug em
// uso, campo obrigatório ausente etc.) virava a mensagem genérica do
// supabase-js "Edge Function returned a non-2xx status code" na UI do
// super_admin.
//
// Extraído para um módulo compartilhado para não duplicar a lógica entre
// os dois services (DRY) — ver webapp/src/lib/edgeFunctionError.js abaixo.

import { supabase } from '../lib/supabase';
import { extrairMensagemErro } from '../lib/edgeFunctionError';

const DEFAULT_PAGE_SIZE = 50;

async function listarEstudios({ page = 0, pageSize = DEFAULT_PAGE_SIZE, busca = '' } = {}) {
  const { data, error } = await supabase.rpc('listar_estudios_admin', {
    p_limit: pageSize,
    p_offset: page * pageSize,
    p_busca: busca?.trim() || null,
  });

  if (error) throw error;
  if (!data?.length) return { estudios: [], totalCount: 0 };

  const totalCount = Number(data[0].total_count ?? 0);
  const estudios = data.map(({ total_count, ...e }) => e);

  return { estudios, totalCount };
}

async function metricasGlobais() {
  const [
    { count: totalEstudios, error: errEstudios },
    { count: totalAlunos, error: errAlunos },
    { data: receitaTotal, error: errReceita },
  ] = await Promise.all([
    supabase.from('estudios').select('*', { count: 'exact', head: true }),
    supabase.from('alunos').select('*', { count: 'exact', head: true }),
    supabase.rpc('receita_total_paga'),
  ]);

  if (errEstudios) throw errEstudios;
  if (errAlunos) throw errAlunos;
  if (errReceita) throw errReceita;

  return {
    totalEstudios: totalEstudios ?? 0,
    totalAlunos:   totalAlunos   ?? 0,
    receitaTotal:  Number(receitaTotal ?? 0),
  };
}

async function saudeSistema() {
  const [
    { data: mensalidades, error: errMensalidades },
    { data: latencia, error: errLatencia },
  ] = await Promise.all([
    supabase.rpc('mensalidades_geradas_vs_esperado_mes').single(),
    supabase.rpc('latencia_webhook_pagamento_mes').single(),
  ]);

  if (errMensalidades) throw errMensalidades;
  if (errLatencia) throw errLatencia;

  return {
    mensalidadesGeradas: Number(mensalidades?.gerado ?? 0),
    mensalidadesEsperadas: Number(mensalidades?.esperado ?? 0),
    webhookP95Ms: latencia?.p95_ms != null ? Number(latencia.p95_ms) : null,
    webhookAmostras: Number(latencia?.amostras ?? 0),
  };
}

const STATUS_VALIDOS = ['ativo', 'suspenso'];

async function alterarStatusEstudio(estudioId, novoStatus) {
  if (!STATUS_VALIDOS.includes(novoStatus)) {
    throw new Error(`Status inválido: "${novoStatus}". Valores aceitos: ${STATUS_VALIDOS.join(', ')}.`);
  }

  const { error } = await supabase
    .from('estudios')
    .update({ status: novoStatus })
    .eq('id', estudioId);

  if (error) throw error;
}

/**
 * Chama a Edge Function `criar-estudio`.
 * Retorna { estudio: { id, nome, slug }, admin: { auth_id, email, reutilizado } }
 */
async function criarEstudio({ nome, slug, adminEmail, adminNome, whatsapp, instagram }) {
  const { data, error } = await supabase.functions.invoke('criar-estudio', {
    body: { nome, slug, adminEmail, adminNome, whatsapp, instagram },
  });

  if (error) {
    // CORREÇÃO: antes era `throw error` cru — mensagem genérica do
    // supabase-js em vez do erro de negócio real vindo da Edge Function.
    const mensagem = await extrairMensagemErro(error, 'Erro ao criar estúdio.');
    throw new Error(mensagem);
  }

  if (data?.error) throw new Error(data.error);

  return data;
}

/**
 * Verifica se um slug já está em uso por outro estúdio — usado para dar
 * feedback em tempo real no formulário de criação, antes do submit (a
 * Edge Function `criar-estudio` já valida unicidade no backend; isto é
 * só uma checagem antecipada de UX, não substitui a validação server-side).
 */
async function verificarSlugDisponivel(slug) {
  const { data, error } = await supabase
    .from('estudios')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw error;
  return !data;
}

export const superAdminService = {
  listarEstudios,
  metricasGlobais,
  saudeSistema,
  alterarStatusEstudio,
  criarEstudio,
  verificarSlugDisponivel,
};