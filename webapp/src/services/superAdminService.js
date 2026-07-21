// webapp/src/services/superAdminService.js
//
// Serviço exclusivo do painel super_admin.
// Todas as queries aqui são cross-tenant — leem de TODOS os estúdios.
// O RLS deve permitir isso apenas para usuários com role 'super_admin'.
//
// NOTA: listarEstudios e metricasGlobais usam RPCs com agregação no banco
// (receita_total_paga, listar_estudios_admin) em vez de somar/contar no
// client, evitando carregar tabelas inteiras em memória e o truncamento
// silencioso imposto pelo max_rows (1000) do PostgREST.

import { supabase } from '../lib/supabase';

// ── LISTA DE ESTÚDIOS ────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 50;

/**
 * Retorna uma página de estúdios com contagens de alunos e professores,
 * agregadas no banco via RPC (sem N+1, sem carregar tudo em memória).
 * A busca é feita no servidor (nome/slug) para continuar funcionando
 * corretamente junto com a paginação.
 *
 * @param {{ page?: number, pageSize?: number, busca?: string }} opts  page é 0-based.
 * @returns {Promise<{ estudios: Array, totalCount: number }>}
 */
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

// ── MÉTRICAS GLOBAIS ─────────────────────────────────────────────────────────

/**
 * Retorna métricas cross-tenant para os cards do dashboard.
 * { totalEstudios, totalAlunos, receitaTotal }
 */
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

// ── Exemplo de uso no hook (TabelaEstudios.jsx) ──────────────────────────────
//
// const { data, isLoading } = useQuery({
//   queryKey: ['super-admin', 'estudios', busca, pagina],
//   queryFn: () => superAdminService.listarEstudios({ page: pagina, busca }),
//   staleTime: 1000 * 60,
//   keepPreviousData: true,
// });
// const estudios   = data?.estudios ?? [];
// const totalCount = data?.totalCount ?? 0;
//
// A filtragem client-side com `estudios.filter(...)` deve ser removida —
// a busca agora acontece no servidor via p_busca.

export const superAdminService = {
  listarEstudios,
  metricasGlobais,
  alterarStatusEstudio,
  criarEstudio,
};