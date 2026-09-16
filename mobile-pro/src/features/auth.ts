// mobile-pro/src/features/auth.ts
import { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

// ── Sessão bruta (idêntico a mobile/src/features/auth.ts) ─────────────────
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCarregando(false);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, novaSession) => {
      setSession(novaSession);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  return { session, carregando };
}

export async function entrar(email: string, senha: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) throw error;
  return data;
}

export async function sair() {
  await supabase.auth.signOut();
}

// ── Papel (admin/professor) ─────────────────────────────────────────────
// Port do trecho relevante de webapp/src/hooks/useAuth.jsx: resolve o papel
// a partir de estudio_membros, restrito a admin/professor (super_admin e
// aluno não são suportados neste app — ver spec).
export type Papel = 'admin' | 'professor';

interface EstadoSessaoComPapel {
  papel: Papel | null;
  estudioId: string | null;
  professorId: number | null;
  nomeUsuario: string | null;
  papelNaoSuportado: boolean;
}

const ESTADO_INICIAL: EstadoSessaoComPapel = {
  papel: null,
  estudioId: null,
  professorId: null,
  nomeUsuario: null,
  papelNaoSuportado: false,
};

export interface SessaoComPapel extends EstadoSessaoComPapel {
  carregando: boolean;
}

export function useSessaoComPapel(): SessaoComPapel {
  const { session, carregando: carregandoSessao } = useSession();
  const [estado, setEstado] = useState<EstadoSessaoComPapel>(ESTADO_INICIAL);
  const [resolvendo, setResolvendo] = useState(true);

  useEffect(() => {
    let cancelado = false;
    const authId = session?.user?.id;

    if (!authId) {
      setEstado(ESTADO_INICIAL);
      setResolvendo(false);
      return;
    }

    setResolvendo(true);
    (async () => {
      // Mesmo padrão de webapp/src/hooks/useAuth.jsx: ordena por created_at
      // ascendente, pega o primeiro vínculo admin/professor.
      const { data: membros, error } = await supabase
        .from('estudio_membros')
        .select('estudio_id, role, created_at')
        .eq('user_id', authId)
        .order('created_at', { ascending: true })
        .limit(5);

      if (cancelado) return;

      if (error) {
        console.error('[useSessaoComPapel] erro ao resolver papel', error);
        setEstado({ ...ESTADO_INICIAL, papelNaoSuportado: true });
        setResolvendo(false);
        return;
      }

      const membro = (membros ?? []).find((m) => m.role === 'admin' || m.role === 'professor') ?? null;

      if (!membro) {
        setEstado({ ...ESTADO_INICIAL, papelNaoSuportado: true });
        setResolvendo(false);
        return;
      }

      if (membro.role === 'admin') {
        setEstado({
          papel: 'admin',
          estudioId: membro.estudio_id,
          professorId: null,
          nomeUsuario: null,
          papelNaoSuportado: false,
        });
        setResolvendo(false);
        return;
      }

      // role === 'professor'
      const { data: professor, error: errProf } = await supabase
        .from('professores')
        .select('id, nome')
        .eq('auth_id', authId)
        .maybeSingle();

      if (cancelado) return;

      if (errProf && errProf.code !== 'PGRST116') {
        console.error('[useSessaoComPapel] erro ao buscar professor', errProf);
      }

      setEstado({
        papel: 'professor',
        estudioId: membro.estudio_id,
        professorId: professor?.id ?? null,
        nomeUsuario: professor?.nome ?? null,
        papelNaoSuportado: false,
      });
      setResolvendo(false);
    })();

    return () => {
      cancelado = true;
    };
  }, [session?.user?.id]);

  return { ...estado, carregando: carregandoSessao || resolvendo };
}

// ── Contexto de sessão resolvida — evita prop-drilling de papel/estudioId/
// professorId por todas as telas. Provido uma vez em AppTabs (Tarefa 8),
// consumido por cada tela via useSessaoAtual() (mesmo racional de
// mobile/src/features/aluno.ts, onde cada tela chama seu próprio hook).
export interface SessaoAtual {
  papel: Papel;
  estudioId: string;
  professorId: number | null;
  nomeUsuario: string | null;
}

export const SessaoContext = createContext<SessaoAtual | null>(null);

export function useSessaoAtual(): SessaoAtual {
  const contexto = useContext(SessaoContext);
  if (!contexto) {
    throw new Error('useSessaoAtual precisa estar dentro de <SessaoContext.Provider> (ver AppTabs em src/navigation).');
  }
  return contexto;
}
