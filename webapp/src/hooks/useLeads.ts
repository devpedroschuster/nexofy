import { useQuery, useInfiniteQuery, useMutation, useQueryClient, InfiniteData } from '@tanstack/react-query';
import { leadsService } from '../services/leadsService';
import { showToast } from '../components/shared/Toast';
import { Lead } from '../types/leads';
import { useAuth } from './useAuth';

export function useLeadsPendentes() {
  const { estudioId } = useAuth();

  return useQuery<Lead[]>({
    queryKey: ['leads', estudioId, 'pendentes'],
    queryFn: async () => {
      const data = await leadsService.listarLeadsPendentes(estudioId);
      return data as unknown as Lead[];
    },
    enabled: !!estudioId,
    staleTime: 1000 * 30,
  });
}

/**
 * Leads pendentes filtrados por mês/ano específico (data da aula experimental).
 * `mes` é 0-indexado (0 = Janeiro, 11 = Dezembro).
 */
export function useLeadsPendentesPorMes(ano: number, mes: number, enabled = true) {
  const { estudioId } = useAuth();
  return useQuery<Lead[]>({
    queryKey: ['leads', estudioId, 'pendentes', 'mes', ano, mes],
    queryFn: async () => {
      const data = await leadsService.listarLeadsPendentesPorMes({ ano, mes, estudioId });
      return data as unknown as Lead[];
    },
    enabled: !!estudioId && enabled, // FIX
    staleTime: 1000 * 30,
  });
}

export function useHistoricoLeads() {
  const { estudioId } = useAuth();

  return useInfiniteQuery<Lead[], Error, InfiniteData<Lead[]>, (string | null)[], number>({
    queryKey: ['leads', estudioId, 'historico'],
    queryFn: async ({ pageParam = 0 }) => {
      const data = await leadsService.listarHistoricoLeads({ pageParam, limit: 30, estudioId });
      return data as unknown as Lead[];
    },
    enabled: !!estudioId,
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length === 30 ? allPages.length * 30 : undefined;
    },
    staleTime: 1000 * 60,
  });
}

/**
 * Histórico de leads filtrado por mês/ano específico.
 * `mes` é 0-indexado (0 = Janeiro, 11 = Dezembro).
 */
export function useHistoricoLeadsPorMes(ano: number, mes: number, enabled = true) {
  const { estudioId } = useAuth();

  return useQuery<Lead[]>({
    queryKey: ['leads', estudioId, 'historico', 'mes', ano, mes],
    queryFn: async () => {
      const data = await leadsService.listarHistoricoLeadsPorMes({ ano, mes, estudioId });
      return data as unknown as Lead[];
    },
    enabled: !!estudioId && enabled, // FIX real: antes o 3º arg passado por Leads.jsx era descartado
    staleTime: 1000 * 60,
  });
}

// FIX (Bug #3): o campo real retornado pelo service é `data_visita`,
// não `data_checkin`. O mismatch fazia `new Date(...)` gerar Invalid Date
// e quebrava o agrupamento mensal (chave "NaN-NaN").
interface ResumoLead {
  id: string;
  data_visita: string;
  status_conversao: 'pendente' | 'convertido' | 'perdido';
}

export interface ResumoMensal {
  ano: number;
  mes: number; // 0-indexado
  chave: string; // 'AAAA-MM'
  label: string; // 'Junho 2026'
  total: number;
  convertidos: number;
  pendentes: number;
  perdidos: number;
  taxa: number | null;
}

function agruparPorMes(data: ResumoLead[]): ResumoMensal[] {
  const mapa = new Map<string, ResumoMensal>();

  for (const lead of data) {
    const d = new Date(lead.data_visita);
    if (Number.isNaN(d.getTime())) continue; // guarda contra dados malformados

    const ano = d.getFullYear();
    const mes = d.getMonth();
    const chave = `${ano}-${String(mes).padStart(2, '0')}`;

    if (!mapa.has(chave)) {
      mapa.set(chave, {
        ano,
        mes,
        chave,
        label: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
        total: 0,
        convertidos: 0,
        pendentes: 0,
        perdidos: 0,
        taxa: null,
      });
    }

    const item = mapa.get(chave)!;
    item.total += 1;
    if (lead.status_conversao === 'convertido') item.convertidos += 1;
    else if (lead.status_conversao === 'pendente') item.pendentes += 1;
    else if (lead.status_conversao === 'perdido') item.perdidos += 1;
  }

  const resultado = Array.from(mapa.values()).map(item => ({
    ...item,
    taxa: item.total > 0 ? item.convertidos / item.total : null,
    label: item.label.charAt(0).toUpperCase() + item.label.slice(1),
  }));

  resultado.sort((a, b) => b.chave.localeCompare(a.chave));

  return resultado;
}

/**
 * Carrega todos os leads (campos leves) e agrupa por mês/ano,
 * gerando contagens e taxa de conversão para cada período.
 * Usado para alimentar o seletor de meses na Visão Histórico.
 */
export function useResumoMensalLeads() {
  const { estudioId } = useAuth();

  return useQuery<ResumoMensal[]>({
    queryKey: ['leads', estudioId, 'resumo-mensal'],
    queryFn: async () => {
      // FIX (Bug #4): faltava passar estudioId — sem ele o filtro
      // `.eq('estudio_id', estudioId)` no service vira `estudio_id = 'undefined'`,
      // resultando em resumo vazio (ou, na ausência de RLS, risco de leitura indevida).
      const data = await leadsService.listarResumoLeads(estudioId) as unknown as ResumoLead[];
      return agruparPorMes(data);
    },
    enabled: !!estudioId,
    staleTime: 1000 * 60,
  });
}

export function useResumoMensalLeadsPendentes() {
  const { estudioId } = useAuth();

  return useQuery<ResumoMensal[]>({
    queryKey: ['leads', estudioId, 'resumo-mensal-pendentes'],
    queryFn: async () => {
      const data = await leadsService.listarResumoLeadsPendentes(estudioId) as unknown as ResumoLead[];
      return agruparPorMes(data);
    },
    enabled: !!estudioId,
    staleTime: 1000 * 30,
  });
}

export function useAtualizarStatusLead() {
  const queryClient = useQueryClient();
  const { estudioId } = useAuth();
 
  return useMutation({
    mutationFn: async ({ id, status }: { id: string, status: 'convertido' | 'perdido' | 'pendente' }) => {
      if (!estudioId) throw new Error('Estúdio não identificado. Recarregue a página.');
      return await leadsService.atualizarStatusLead(id, status, estudioId);
    },
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['leads', estudioId] });
 
      const previousPendentes = queryClient.getQueriesData<Lead[]>({
        queryKey: ['leads', estudioId, 'pendentes'], exact: false,
      });
      const previousHistorico = queryClient.getQueriesData<InfiniteData<Lead[]> | Lead[]>({
        queryKey: ['leads', estudioId, 'historico'], exact: false,
      });
 
      // Listas simples
      queryClient.setQueriesData<Lead[]>({ queryKey: ['leads', estudioId, 'pendentes'], exact: false }, (old) => {
        if (!old) return old;
        return status !== 'pendente' ? old.filter(l => l.id !== id) : old.map(l => l.id === id ? { ...l, status_conversao: status } : l);
      });
      queryClient.setQueriesData<Lead[]>({ queryKey: ['leads', estudioId, 'historico', 'mes'], exact: false }, (old) =>
        old?.map(l => l.id === id ? { ...l, status_conversao: status } : l) ?? old
      );
 
      // Histórico paginado
      queryClient.setQueriesData<InfiniteData<Lead[]>>({ queryKey: ['leads', estudioId, 'historico'], exact: false }, (oldData) => {
        if (!oldData || !('pages' in oldData)) return oldData;
        return {
          ...oldData,
          pages: oldData.pages.map((page) =>
            page.map((l) => l.id === id ? { ...l, status_conversao: status } : l)
          ),
        };
      });
 
      return { previousPendentes, previousHistorico };
    },
    onError: (err, variables, context) => {
      context?.previousPendentes?.forEach(([key, data]) => queryClient.setQueryData(key, data));
      context?.previousHistorico?.forEach(([key, data]) => queryClient.setQueryData(key, data));
      showToast.error("Erro de conexão. Ação desfeita.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['leads', estudioId] });
    },
  });
}

/**
 * Salva a observação livre da administração sobre o lead.
 * Atualiza o cache otimisticamente nas listas de pendentes e histórico
 * (incluindo páginas paginadas e filtradas por mês), com rollback em caso
 * de erro (padrão consistente com useAtualizarStatusLead).
 */
export function useAtualizarObservacaoLead() {
  const queryClient = useQueryClient();
  const { estudioId } = useAuth();

  return useMutation({
    mutationFn: async ({ id, observacao }: { id: string, observacao: string }) => {
      // FIX (Bug #2): mesmo problema do Bug #1 — estudioId não era enviado.
      if (!estudioId) throw new Error('Estúdio não identificado. Recarregue a página.');
      return await leadsService.atualizarObservacaoLead(id, observacao, estudioId);
    },
    onMutate: async ({ id, observacao }) => {
      await queryClient.cancelQueries({ queryKey: ['leads', estudioId] });

      // FIX (edge case #2): agora capturamos snapshots para permitir rollback
      // real em onError, em vez de depender só de um invalidateQueries tardio.
      const previousPendentes = queryClient.getQueryData<Lead[]>(['leads', estudioId, 'pendentes']);
      const previousHistoricoMes = queryClient.getQueriesData<Lead[]>({ queryKey: ['leads', estudioId, 'historico', 'mes'] });
      const previousHistoricoInfinite = queryClient.getQueriesData<InfiniteData<Lead[]>>({ queryKey: ['leads', estudioId, 'historico'], exact: false });

      const atualizarLista = (old?: Lead[]) =>
        old?.map(l => l.id === id ? { ...l, observacao_lead: observacao } : l);

      queryClient.setQueriesData<Lead[]>({ queryKey: ['leads', estudioId, 'pendentes'] }, (old) => atualizarLista(old) ?? old);
      queryClient.setQueriesData<Lead[]>({ queryKey: ['leads', estudioId, 'historico', 'mes'] }, (old) => atualizarLista(old) ?? old);

      queryClient.setQueriesData<InfiniteData<Lead[]>>({ queryKey: ['leads', estudioId, 'historico'], exact: false }, (oldData) => {
        if (!oldData || !('pages' in oldData)) return oldData;
        return {
          ...oldData,
          pages: oldData.pages.map((page) =>
            page.map((l) => l.id === id ? { ...l, observacao_lead: observacao } : l)
          ),
        };
      });

      return { previousPendentes, previousHistoricoMes, previousHistoricoInfinite };
    },
    onError: (err, variables, context) => {
      if (context?.previousPendentes) {
        queryClient.setQueryData<Lead[]>(['leads', estudioId, 'pendentes'], context.previousPendentes);
      }
      context?.previousHistoricoMes?.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      context?.previousHistoricoInfinite?.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      showToast.error("Erro ao salvar observação. Tente novamente.");
    },
    onSuccess: () => {
      showToast.success("Observação salva.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['leads', estudioId] });
    },
  });
}