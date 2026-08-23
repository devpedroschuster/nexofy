// webapp/src/context/ImpersonationContext.jsx
//
// Contexto global de impersonation de estúdio para super_admin.
//
// Responsabilidades:
//   - Armazena { estudio: { id, nome, slug, segmento, terminologia, modulos_ativos } | null } em memória (não em localStorage)
//   - Chama set_estudio_override / clear_estudio_override via RPC do Supabase
//   - Invalida o cache do React Query ao entrar/sair do modo impersonation
//   - Reseta automaticamente ao detectar SIGNED_OUT (evita contaminação entre sessões)
//   - Agenda a expiração local do TTL de 4h (ver seção "Expiração de TTL" abaixo)
//   - Expõe useImpersonation() para qualquer componente consumir
//
// DECISÃO DE SEGURANÇA — sem persistência entre sessões:
//   O override é persistido em impersonation_sessions (linked a auth.uid()), com TTL de 4h.
//   O frontend reflete isso: ao recarregar a página o estado em memória é perdido
//   e o override no servidor já expirou.
//
// AUDITORIA (correções aplicadas):
//
//   CR-1 (race condition) — antes, `opRef` só descartava a RESPOSTA local de uma
//   chamada obsoleta, mas não impedia duas chamadas RPC reais (set_estudio_override)
//   de estarem em voo ao mesmo tempo. Se a de estúdio A resolvesse no servidor
//   DEPOIS da de estúdio B, o override real no servidor ficava em A enquanto a UI
//   (banner, queries locais) já mostrava B — um super_admin podia agir sobre o
//   tenant errado. Correção: `acessarEstudio` e `sairImpersonation` agora recusam
//   nova chamada enquanto `carregando` for true (guarda de concorrência na ORIGEM,
//   não só no consumo da resposta). `opRef` é mantido como defesa em profundidade
//   para o caso raro de reentrância via chamada direta ao contexto.
//
//   Expiração de TTL (revisado) — confirmado direto no banco que
//   `estudio_ativo_via_override()` NÃO lança erro ao expirar: ela só filtra
//   por `expira_em > now()` e, se não achar linha, o `COALESCE` em
//   `estudio_id_atual()` cai silenciosamente para o estúdio pessoal do
//   super_admin (se tiver) ou para NULL. Ou seja: não existe nenhum erro de
//   RPC/PostgREST para o client interceptar quando o TTL estoura — a
//   abordagem original de detectar isso por `error.code` (`isErroOverrideInvalido`,
//   mantida abaixo só para os casos em que a sessão FOI revogada/inválida por
//   outro motivo, ex: RLS negada) não cobre a expiração natural por TTL.
//
//   A correção real: uma nova RPC (`obter_impersonation_ativa()`) devolve
//   `expira_em` da sessão, e o client agenda dois timers locais a partir dela:
//     1. Aviso ~5 min antes de expirar (showToast.warning)
//     2. Encerramento local automático no instante exato da expiração —
//        antes que qualquer query passe a silenciosamente devolver dados
//        errados (do estúdio pessoal do admin, ou nenhum).
//   Isso é só uma salvaguarda de UX/consistência local: mesmo que o timer
//   falhe (ex: aba ficou em segundo plano e o navegador atrasa o timer), a
//   fonte de verdade continua sendo o servidor — o pior caso é o client achar
//   que ainda está impersonando por alguns segundos/minutos a mais do que
//   deveria, nunca o contrário.
//
// INTEGRAÇÃO COM useAuth:
//   Quando em modo impersonation, o estudioId do useAuth ainda é null (o super_admin
//   não tem estudio_id próprio). O override existe apenas no lado do Supabase/RLS.
//   Componentes que precisam saber "qual estúdio estou vendo agora" devem usar
//   useImpersonation().estudioAtivo em vez de useAuth().estudioId.
//
// Item 2 do plano multi-segmento (seção 3.1 do PLANO_ITEM_2.md):
//   estudioAtivo passa a incluir segmento/terminologia/modulos_ativos, para
//   que useTerminologia() resolva rótulos corretos do tenant IMPERSONADO,
//   não do perfil do super_admin.
//
//   Trade-off deliberado (foge do "zero round-trip extra" que useAuth
//   conseguiu via join): o objeto `estudio` recebido por acessarEstudio()
//   vem de `superAdminService.listarEstudios` (RPC `listar_estudios_admin`),
//   cujo retorno não temos como garantir que já inclua as 3 colunas novas
//   sem editar essa RPC (fora do escopo deste item — RPC de agregação,
//   não faz parte dos arquivos deste plano). Por isso, ao entrar em
//   impersonation, buscamos `estudios` direto pelo id logo após confirmar
//   o override — 1 SELECT leve, feito em paralelo com a busca do TTL
//   (`obter_impersonation_ativa`) via Promise.all, então não vira uma
//   terceira chamada sequencial — só quando o admin efetivamente troca de
//   estúdio (não em toda navegação), garantindo dado sempre correto e
//   atual independente do que a RPC de listagem retornar.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { showToast } from '../components/shared/Toast';

// ── Contexto ─────────────────────────────────────────────────────────────────

const ImpersonationContext = createContext(null);

// Quanto antes da expiração real o aviso é disparado.
const AVISO_ANTECEDENCIA_MS = 5 * 60 * 1000; // 5 minutos

// setTimeout tem limite prático de ~24.8 dias (2^31-1 ms); o TTL de
// impersonation é de 4h, então está bem dentro do limite — sem necessidade
// de setInterval/polling.

// ── Helpers de erro ──────────────────────────────────────────────────────────

/**
 * Classifica erros de RPC/PostgREST relacionados a um override de
 * impersonation invalidado por outro motivo que não a expiração natural
 * do TTL (ex.: sessão revogada manualmente, RLS negada por outro motivo).
 * A expiração natural por TTL é tratada à parte, por timer local
 * (ver `agendarExpiracaoLocal` mais abaixo) — não gera erro nenhum de RPC.
 *
 * Preferimos `error.code` (SQLSTATE / código customizado via RAISE ... USING
 * ERRCODE) a `error.message`, que é texto livre e quebra silenciosamente se a
 * mensagem no banco mudar. O fallback por substring é mantido só para o caso
 * de a RPC ainda não expor um código estruturado.
 */
function isErroOverrideInvalido(error) {
  if (!error) return false;
  if (error.code === 'PGRST301' || error.code === '42501') return true; // JWT/RLS
  const msg = (error.message ?? '').toLowerCase();
  return msg.includes('override') && (msg.includes('expirad') || msg.includes('inválid'));
}

/** Erro amigável para exibir na UI quando o super_admin tenta uma ação sem ser super_admin. */
export function isErroAcessoNegado(error) {
  if (!error) return false;
  if (error.code === '42501') return true;
  const msg = (error.message ?? '').toLowerCase();
  return msg.includes('acesso negado') || msg.includes('super_admin');
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function ImpersonationProvider({ children }) {
  // estudioAtivo: { id, nome, slug, segmento, terminologia, modulos_ativos } | null
  const [estudioAtivo, setEstudioAtivo] = useState(null);
  const [carregando,   setCarregando  ] = useState(false);
  const qc = useQueryClient();

  // Ref para rastrear a última operação e ignorar respostas de chamadas stale.
  // Mantido como defesa em profundidade; a guarda principal contra concorrência
  // agora é o early-return por `carregando` em acessarEstudio/sairImpersonation.
  const opRef = useRef(0);

  // Refs para os estados mais recentes, usados dentro dos callbacks estáveis
  // (evita recriar acessarEstudio/sairImpersonation a cada mudança de estado,
  // o que por sua vez evita re-renders em cascata de qualquer componente que
  // dependa da identidade dessas funções).
  const estudioAtivoRef = useRef(estudioAtivo);
  const carregandoRef   = useRef(carregando);
  useEffect(() => { estudioAtivoRef.current = estudioAtivo; }, [estudioAtivo]);
  useEffect(() => { carregandoRef.current   = carregando;   }, [carregando]);

  // Timers do TTL local (aviso + expiração automática). Guardados em ref
  // porque são efeitos colaterais imperativos, não estado de renderização.
  const avisoTimeoutRef     = useRef(null);
  const expiracaoTimeoutRef = useRef(null);

  const limparTimersExpiracao = useCallback(() => {
    if (avisoTimeoutRef.current)     clearTimeout(avisoTimeoutRef.current);
    if (expiracaoTimeoutRef.current) clearTimeout(expiracaoTimeoutRef.current);
    avisoTimeoutRef.current     = null;
    expiracaoTimeoutRef.current = null;
  }, []);

  // ── Reset "duro": limpa estado local + purga (não só invalida) queries
  //    do cache que podem conter dados do tenant impersonado.
  //    Usar `clear()` aqui em vez de `invalidateQueries()` evita qualquer
  //    flash de dados do estúdio anterior antes do próximo fetch.
  const resetDuro = useCallback(() => {
    opRef.current += 1; // invalida qualquer RPC em voo
    limparTimersExpiracao();
    setEstudioAtivo(null);
    setCarregando(false);
  }, [limparTimersExpiracao]);

  // qc.clear() fica fora de resetDuro para poder ser chamado sem
  // depender da identidade do queryClient no array de deps de outros hooks.
  const resetDuroComCache = useCallback(() => {
    resetDuro();
    qc.clear();
  }, [resetDuro, qc]);

  // ── Expiração automática por TTL local ────────────────────────────────────
  // Agenda o aviso (5 min antes) e o encerramento local exatamente no
  // instante em que `expira_em` (vindo do servidor) é atingido. Não depende
  // de nenhuma query falhar — é puramente proativo, baseado no timestamp
  // real da sessão no banco.
  const expirarLocalmente = useCallback(() => {
    console.warn('[ImpersonationContext] TTL de impersonation expirou — encerrando sessão local.');
    resetDuroComCache();
    showToast.error('Sua sessão de visualização deste estúdio expirou. Acesse novamente se precisar continuar.');
  }, [resetDuroComCache]);

  const agendarExpiracaoLocal = useCallback((expiraEmIso) => {
    limparTimersExpiracao();
    if (!expiraEmIso) return; // sem TTL conhecido — sem timer (comportamento anterior, degrada com segurança)

    const expiraEmMs   = new Date(expiraEmIso).getTime();
    if (Number.isNaN(expiraEmMs)) return;

    const delayExpiracao = expiraEmMs - Date.now();

    if (delayExpiracao <= 0) {
      // Relógio local atrasado ou latência de rede fez a sessão já nascer expirada.
      expirarLocalmente();
      return;
    }

    const delayAviso = delayExpiracao - AVISO_ANTECEDENCIA_MS;
    if (delayAviso > 0) {
      avisoTimeoutRef.current = setTimeout(() => {
        showToast.warning('Sua sessão de visualização deste estúdio expira em 5 minutos.');
      }, delayAviso);
    }

    expiracaoTimeoutRef.current = setTimeout(expirarLocalmente, delayExpiracao);
  }, [limparTimersExpiracao, expirarLocalmente]);

  // Limpa os timers ao desmontar o provider (nunca deveria acontecer em uso
  // normal, já que ele envolve a aplicação inteira, mas é higiene básica
  // contra memory leak em testes/HMR).
  useEffect(() => () => limparTimersExpiracao(), [limparTimersExpiracao]);

  // ── Reage a logout/troca de usuário para evitar contaminação entre sessões ──
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        resetDuroComCache();
      }
    });
    return () => subscription.unsubscribe();
  }, [resetDuroComCache]);

  // ── Entrar em modo impersonation ──────────────────────────────────────────
  const acessarEstudio = useCallback(async (estudio) => {
    if (!estudio?.id) {
      console.warn('[ImpersonationContext] acessarEstudio chamado sem estudio.id — ignorado.');
      return;
    }

    // CR-1 FIX: recusa nova chamada enquanto outra estiver em voo. Antes,
    // apenas a linha clicada na tabela ficava desabilitada — outra linha
    // podia disparar uma segunda chamada RPC concorrente, e a ordem de
    // conclusão no SERVIDOR (não no client) decidia o override real,
    // podendo dessincronizar da UI. Esta guarda é a correção na origem;
    // a UI (TabelaEstudios) também foi ajustada para desabilitar todas as
    // linhas durante `carregando`, como reforço de UX.
    if (carregandoRef.current) {
      console.warn('[ImpersonationContext] acessarEstudio ignorado: já há uma troca de estúdio em andamento.');
      return;
    }

    // No-op se já estamos impersonando exatamente este estúdio.
    if (estudioAtivoRef.current?.id === estudio.id) return;

    const op = ++opRef.current;
    setCarregando(true);

    try {
      const { error } = await supabase.rpc('set_estudio_override', {
        p_estudio_id: estudio.id,
      });

      if (error) throw error;
      if (op !== opRef.current) return; // reset/logout aconteceu nesse meio-tempo

      // Busca segmento/terminologia/modulos_ativos (ver trade-off no cabeçalho
      // do arquivo) e o TTL da sessão (para agendar a expiração local) em
      // paralelo — não adiciona uma terceira chamada sequencial.
      const [
        { data: estudioRow,  error: errEstudio },
        { data: sessaoRows,  error: errSessao  },
      ] = await Promise.all([
        supabase
          .from('estudios')
          .select('segmento, terminologia, modulos_ativos')
          .eq('id', estudio.id)
          .maybeSingle(),
        supabase.rpc('obter_impersonation_ativa'),
      ]);

      if (errEstudio) {
        // Não bloqueia a impersonation por isso — é dado cosmético
        // (terminologia/menu), não crítico de segurança. Loga e segue
        // com os defaults do useTerminologia (fallback em cascata).
        console.error('[ImpersonationContext] Erro ao buscar segmento do estúdio:', errEstudio);
      }
      if (errSessao) {
        // Idem: não bloqueia a entrada em impersonation por isso — só significa
        // que não teremos o timer de expiração local nesta sessão (degrada
        // com segurança: pior caso é o usuário não receber o aviso de TTL).
        console.error('[ImpersonationContext] Erro ao buscar TTL da sessão de impersonation:', errSessao);
      }
      if (op !== opRef.current) return;

      setEstudioAtivo({
        id: estudio.id,
        nome: estudio.nome,
        slug: estudio.slug,
        segmento: estudioRow?.segmento ?? 'danca_fitness',
        terminologia: estudioRow?.terminologia ?? {},
        modulos_ativos: estudioRow?.modulos_ativos ?? [],
      });

      // obter_impersonation_ativa() é uma função de retorno de tabela — vem
      // como array; pega a primeira (e única) linha.
      agendarExpiracaoLocal(sessaoRows?.[0]?.expira_em ?? null);

      // Invalida todo o cache — queries vão reexecutar com o novo override ativo.
      // (Trade-off conhecido: invalida também queries globais não tenant-scoped;
      // aceito por segurança/simplicidade. Ver nota de performance na auditoria.)
      await qc.invalidateQueries();

    } catch (err) {
      console.error('[ImpersonationContext] Erro ao definir override:', err);
      throw err; // re-lança para o chamador exibir toast
    } finally {
      if (op === opRef.current) setCarregando(false);
    }
  }, [qc, agendarExpiracaoLocal]);

  // ── Sair do modo impersonation ────────────────────────────────────────────
  const sairImpersonation = useCallback(async () => {
    // Mesma guarda de concorrência do acessarEstudio.
    if (carregandoRef.current) {
      console.warn('[ImpersonationContext] sairImpersonation ignorado: operação em andamento.');
      return;
    }

    const op = ++opRef.current;
    setCarregando(true);

    try {
      const { error } = await supabase.rpc('clear_estudio_override');
      if (error) throw error;
      if (op !== opRef.current) return;

      limparTimersExpiracao(); // saída manual cancela o timer de expiração agendado
      setEstudioAtivo(null);

      // Invalida cache para as queries voltarem ao comportamento cross-tenant
      await qc.invalidateQueries();

    } catch (err) {
      console.error('[ImpersonationContext] Erro ao limpar override:', err);
      throw err;
    } finally {
      if (op === opRef.current) setCarregando(false);
    }
  }, [qc, limparTimersExpiracao]);

  // ── Interceptação de override expirado/inválido ───────────────────────────
  // Exposto para qualquer camada de dados (ex.: um wrapper central de query
  // do React Query, ou cada service) reportar que uma chamada falhou porque
  // o override não é mais válido por algum motivo QUE NÃO a expiração natural
  // de TTL (essa já é tratada proativamente por `agendarExpiracaoLocal`) —
  // ex.: sessão revogada manualmente por outro processo, ou erro de RLS.
  const reportarErroDados = useCallback((error) => {
    if (estudioAtivoRef.current && isErroOverrideInvalido(error)) {
      console.warn('[ImpersonationContext] Override de impersonation inválido — encerrando sessão local.');
      resetDuroComCache();
      return true; // sinaliza ao chamador que o erro foi tratado
    }
    return false;
  }, [resetDuroComCache]);

  const value = {
    /** Estúdio sendo impersonado, ou null se não estiver em modo impersonation */
    estudioAtivo,
    /** true enquanto set/clear_estudio_override está sendo chamado */
    carregando,
    /** true se há um override ativo */
    emImpersonation: estudioAtivo !== null,
    /** Ativa o modo impersonation para o estúdio dado */
    acessarEstudio,
    /** Desativa o modo impersonation */
    sairImpersonation,
    /** Verifica se um erro de query indica override inválido; se sim, já reseta o estado. */
    reportarErroDados,
  };

  return (
    <ImpersonationContext.Provider value={value}>
      {children}
    </ImpersonationContext.Provider>
  );
}

// ── Hook público ──────────────────────────────────────────────────────────────

/**
 * useImpersonation()
 *
 * Retorna o estado e as ações de impersonation.
 * Lança se chamado fora de <ImpersonationProvider>.
 *
 * Exemplo:
 *   const { emImpersonation, estudioAtivo, acessarEstudio, sairImpersonation } = useImpersonation();
 */
export function useImpersonation() {
  const ctx = useContext(ImpersonationContext);
  if (!ctx) {
    throw new Error('useImpersonation deve ser usado dentro de <ImpersonationProvider>');
  }
  return ctx;
}