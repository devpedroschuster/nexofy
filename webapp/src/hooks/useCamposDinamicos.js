import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { camposDinamicosService } from '../services/camposDinamicosService';
import { useAuth } from './useAuth';
import { useImpersonation } from '../context/ImpersonationContext';

const ENTIDADE_PADRAO = 'aluno';

/**
 * Resolve o estudio_id efetivo, seguindo o mesmo padrão já corrigido em
 * praticamente todos os módulos de página: super_admin em impersonation
 * usa o estúdio acessado (estudioAtivo), senão usa o do próprio perfil.
 * Sem isso, super_admin em impersonation vê estudioId: null e a query
 * fica `enabled: false` pra sempre.
 */
function useEstudioIdEfetivo() {
  const { estudioId } = useAuth();
  const { estudioAtivo } = useImpersonation();
  return estudioAtivo?.id ?? estudioId;
}

/**
 * Lista os campos dinâmicos de um estúdio para uso em formulários (form de
 * NovoAluno/PerfilAluno) e montagem de colunas de tabela.
 * Por padrão só traz campos ativos — para telas de administração que
 * precisam ver/reativar campos desativados, use useCamposDinamicosAdmin.
 */
export function useCamposDinamicos(entidade = ENTIDADE_PADRAO) {
  const idEfetivo = useEstudioIdEfetivo();
  const key = ['campos-dinamicos', idEfetivo, entidade];

  const query = useQuery({
    queryKey: key,
    queryFn: () => camposDinamicosService.listar(idEfetivo, { entidade }),
    enabled: !!idEfetivo,
    staleTime: 5 * 60 * 1000, // 5 min — catálogo de campos muda pouco
  });

  return {
    campos: query.data ?? [],
    loading: query.isLoading,
    fetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Variante para a tela de administração de campos: inclui inativos, para
 * permitir reativar. Chave de cache separada da pública de propósito —
 * misturar as duas faria a tela de admin (com inativos) invalidar/poluir
 * o cache que o form de aluno usa (só ativos), e vice-versa.
 */
export function useCamposDinamicosAdmin(entidade = ENTIDADE_PADRAO) {
  const idEfetivo = useEstudioIdEfetivo();
  const key = ['campos-dinamicos-admin', idEfetivo, entidade];

  const query = useQuery({
    queryKey: key,
    queryFn: () => camposDinamicosService.listar(idEfetivo, { entidade, incluirInativos: true }),
    enabled: !!idEfetivo,
    staleTime: 2 * 60 * 1000,
  });

  return {
    campos: query.data ?? [],
    loading: query.isLoading,
    fetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Invalida as duas chaves de cache (pública e admin) para o estúdio atual.
 * Toda mutation abaixo chama isso em onSuccess — criar/editar/desativar um
 * campo precisa refletir tanto no form de aluno quanto na tela de admin.
 */
function useInvalidarCamposDinamicos() {
  const qc = useQueryClient();
  const idEfetivo = useEstudioIdEfetivo();

  return (entidade = ENTIDADE_PADRAO) => {
    qc.invalidateQueries({ queryKey: ['campos-dinamicos', idEfetivo, entidade] });
    qc.invalidateQueries({ queryKey: ['campos-dinamicos-admin', idEfetivo, entidade] });
  };
}

export function useCriarCampoDinamico(entidade = ENTIDADE_PADRAO) {
  const idEfetivo = useEstudioIdEfetivo();
  const invalidar = useInvalidarCamposDinamicos();

  return useMutation({
    mutationFn: (dados) => {
      if (!idEfetivo) return Promise.reject(new Error('estudioId ausente ao criar campo dinâmico.'));
      return camposDinamicosService.criar(dados, idEfetivo, entidade);
    },
    onSuccess: () => {
      invalidar(entidade);
      toast.success('Campo criado com sucesso.');
    },
    onError: (e) => {
      console.error('[useCriarCampoDinamico] erro ao criar', e);
      // Mensagens de validação (field_name inválido/duplicado) já vêm
      // amigáveis do service — reaproveita e.message em vez de genérico.
      toast.error(e.message || 'Erro ao criar campo. Tente novamente.');
    },
  });
}

export function useAtualizarCampoDinamico(entidade = ENTIDADE_PADRAO) {
  const idEfetivo = useEstudioIdEfetivo();
  const invalidar = useInvalidarCamposDinamicos();

  return useMutation({
    mutationFn: ({ id, dados }) => {
      if (!idEfetivo) return Promise.reject(new Error('estudioId ausente ao atualizar campo dinâmico.'));
      return camposDinamicosService.atualizar(id, dados, idEfetivo);
    },
    onSuccess: () => {
      invalidar(entidade);
      toast.success('Campo atualizado.');
    },
    onError: (e) => {
      console.error('[useAtualizarCampoDinamico] erro ao atualizar', e);
      toast.error('Erro ao atualizar campo. Tente novamente.');
    },
  });
}

export function useDesativarCampoDinamico(entidade = ENTIDADE_PADRAO) {
  const idEfetivo = useEstudioIdEfetivo();
  const invalidar = useInvalidarCamposDinamicos();

  return useMutation({
    mutationFn: (id) => {
      if (!idEfetivo) return Promise.reject(new Error('estudioId ausente ao desativar campo dinâmico.'));
      return camposDinamicosService.desativar(id, idEfetivo);
    },
    onSuccess: () => {
      invalidar(entidade);
      toast.success('Campo desativado.');
    },
    onError: (e) => {
      console.error('[useDesativarCampoDinamico] erro ao desativar', e);
      toast.error('Erro ao desativar campo. Tente novamente.');
    },
  });
}

export function useReativarCampoDinamico(entidade = ENTIDADE_PADRAO) {
  const idEfetivo = useEstudioIdEfetivo();
  const invalidar = useInvalidarCamposDinamicos();

  return useMutation({
    mutationFn: (id) => {
      if (!idEfetivo) return Promise.reject(new Error('estudioId ausente ao reativar campo dinâmico.'));
      return camposDinamicosService.reativar(id, idEfetivo);
    },
    onSuccess: () => {
      invalidar(entidade);
      toast.success('Campo reativado.');
    },
    onError: (e) => {
      console.error('[useReativarCampoDinamico] erro ao reativar', e);
      toast.error('Erro ao reativar campo. Tente novamente.');
    },
  });
}

/**
 * Reordenação em lote (drag-and-drop). Usa update otimista da lista local
 * na tela de admin antes de chamar a mutation seria responsabilidade do
 * componente — aqui só expomos a mutation crua com invalidação ao final.
 */
export function useReordenarCamposDinamicos(entidade = ENTIDADE_PADRAO) {
  const idEfetivo = useEstudioIdEfetivo();
  const invalidar = useInvalidarCamposDinamicos();

  return useMutation({
    mutationFn: (itens) => {
      if (!idEfetivo) return Promise.reject(new Error('estudioId ausente ao reordenar campos dinâmicos.'));
      return camposDinamicosService.reordenar(itens, idEfetivo);
    },
    onSuccess: () => {
      invalidar(entidade);
    },
    onError: (e) => {
      console.error('[useReordenarCamposDinamicos] erro ao reordenar', e);
      toast.error('Erro ao salvar a nova ordem. Tente novamente.');
    },
  });
}