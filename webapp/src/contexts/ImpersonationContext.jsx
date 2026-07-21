// webapp/src/contexts/ImpersonationContext.jsx
//
// Contexto global de impersonation de estúdio para super_admin.
//
// Responsabilidades:
//   - Armazena { estudio: { id, nome, slug } | null } em memória (não em localStorage)
//   - Chama set_estudio_override / clear_estudio_override via RPC do Supabase
//   - Invalida o cache do React Query ao entrar/sair do modo impersonation
//     (garante que queries usem o novo estudio_id override do servidor)
//   - Expõe useImpersonation() para qualquer componente consumir
//
// DECISÃO DE SEGURANÇA — sem persistência entre sessões:
//   O override é persistido em impersonation_sessions (linked a auth.uid()), com TTL de 4h.
//   Não depende de estado de conexão Postgres — seguro sob qualquer modo de pooling.
//   O frontend reflete isso: ao recarregar a página o estado em memória é perdido
//   e o override no servidor já expirou. Não há risco de "override esquecido".
//
// INTEGRAÇÃO COM useAuth:
//   Quando em modo impersonation, o estudioId do useAuth ainda é null (o super_admin
//   não tem estudio_id próprio). O override existe apenas no lado do Supabase/RLS.
//   Componentes que precisam saber "qual estúdio estou vendo agora" devem usar
//   useImpersonation().estudioAtivo em vez de useAuth().estudioId.

import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// ── Contexto ─────────────────────────────────────────────────────────────────

const ImpersonationContext = createContext(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function ImpersonationProvider({ children }) {
  // estudioAtivo: { id, nome, slug } | null
  const [estudioAtivo, setEstudioAtivo] = useState(null);
  const [carregando,   setCarregando  ] = useState(false);
  const qc = useQueryClient();

  // Ref para rastrear a última operação e ignorar respostas de chamadas stale
  const opRef = useRef(0);

  // ── Entrar em modo impersonation ──────────────────────────────────────────
  const acessarEstudio = useCallback(async (estudio) => {
    if (!estudio?.id) return;

    const op = ++opRef.current;
    setCarregando(true);

    try {
      const { error } = await supabase.rpc('set_estudio_override', {
        p_estudio_id: estudio.id,
      });

      if (error) throw error;
      if (op !== opRef.current) return; // chamada stale, ignora

      setEstudioAtivo({ id: estudio.id, nome: estudio.nome, slug: estudio.slug });

      // Invalida todo o cache — queries vão reexecutar com o novo override ativo
      await qc.invalidateQueries();

    } catch (err) {
      console.error('[ImpersonationContext] Erro ao definir override:', err);
      throw err; // re-lança para o chamador exibir toast
    } finally {
      if (op === opRef.current) setCarregando(false);
    }
  }, [qc]);

  // ── Sair do modo impersonation ────────────────────────────────────────────
  const sairImpersonation = useCallback(async () => {
    const op = ++opRef.current;
    setCarregando(true);

    try {
      const { error } = await supabase.rpc('clear_estudio_override');
      if (error) throw error;
      if (op !== opRef.current) return;

      setEstudioAtivo(null);

      // Invalida cache para as queries voltarem ao comportamento cross-tenant
      await qc.invalidateQueries();

    } catch (err) {
      console.error('[ImpersonationContext] Erro ao limpar override:', err);
      throw err;
    } finally {
      if (op === opRef.current) setCarregando(false);
    }
  }, [qc]);

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