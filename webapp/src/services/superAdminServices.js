// webapp/src/services/superAdminService.js
//
// Serviço exclusivo do painel super_admin.
// Todas as queries aqui são cross-tenant — leem de TODOS os estúdios.
// O RLS deve permitir isso apenas para usuários com role 'super_admin'.
//
// NOTA: as queries de contagem (alunos, professores) usam `.select('*', { count: 'exact', head: true })`
// com filtros por estudio_id para evitar carregar linhas desnecessárias.

import { supabase } from '../lib/supabase';

// ── LISTA DE ESTÚDIOS ────────────────────────────────────────────────────────

/**
 * Retorna todos os estúdios com contagens de alunos e professores.
 * Cada item: { id, nome, slug, whatsapp, instagram, criado_em, status,
 *              total_alunos, total_professores }
 */
async function listarEstudios() {
  // 1. Busca todos os estúdios
  const { data: estudios, error } = await supabase
    .from('estudios')
    .select('id, nome, slug, whatsapp, instagram, criado_em, status')
    .order('criado_em', { ascending: false });

  if (error) throw error;
  if (!estudios?.length) return [];

  // 2. Para cada estúdio, busca contagens em paralelo
  const comContagens = await Promise.all(
    estudios.map(async (e) => {
      const [{ count: total_alunos }, { count: total_professores }] = await Promise.all([
        supabase
          .from('alunos')
          .select('*', { count: 'exact', head: true })
          .eq('estudio_id', e.id),
        supabase
          .from('professores')
          .select('*', { count: 'exact', head: true })
          .eq('estudio_id', e.id),
      ]);

      return {
        ...e,
        total_alunos:      total_alunos      ?? 0,
        total_professores: total_professores ?? 0,
      };
    })
  );

  return comContagens;
}

// ── MÉTRICAS GLOBAIS ─────────────────────────────────────────────────────────

/**
 * Retorna métricas cross-tenant para os cards do dashboard.
 * { totalEstudios, totalAlunos, receitaTotal }
 */
async function metricasGlobais() {
  const [
    { count: totalEstudios },
    { count: totalAlunos },
    { data: receita },
  ] = await Promise.all([
    supabase.from('estudios').select('*', { count: 'exact', head: true }),
    supabase.from('alunos').select('*', { count: 'exact', head: true }),
    supabase
      .from('mensalidades')
      .select('valor_pago')
      .eq('status', 'pago'),
  ]);

  const receitaTotal = (receita ?? []).reduce(
    (acc, m) => acc + Number(m.valor_pago ?? 0),
    0
  );

  return {
    totalEstudios: totalEstudios ?? 0,
    totalAlunos:   totalAlunos   ?? 0,
    receitaTotal,
  };
}

// ── SUSPENDER / REATIVAR ─────────────────────────────────────────────────────

/**
 * Alterna o status de um estúdio entre 'ativo' e 'suspenso'.
 */
async function alterarStatusEstudio(estudioId, novoStatus) {
  const { error } = await supabase
    .from('estudios')
    .update({ status: novoStatus })
    .eq('id', estudioId);

  if (error) throw error;
}

// ── CRIAR ESTÚDIO (via Edge Function) ────────────────────────────────────────

/**
 * Chama a Edge Function `criar-estudio`.
 * Retorna { estudio: { id, nome, slug }, admin: { auth_id, email, reutilizado } }
 */
async function criarEstudio({ nome, slug, adminEmail, adminNome, whatsapp, instagram }) {
  const { data, error } = await supabase.functions.invoke('criar-estudio', {
    body: { nome, slug, adminEmail, adminNome, whatsapp, instagram },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  return data;
}

export const superAdminService = {
  listarEstudios,
  metricasGlobais,
  alterarStatusEstudio,
  criarEstudio,
};