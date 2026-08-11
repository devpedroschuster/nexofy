// webapp/src/context/AuthContext.jsx  (novo arquivo)
//
// Fonte única de verdade para sessão/perfil do usuário.
// Substitui o antigo hook `useAuth` "solto" (sem Provider), que fazia
// cada componente consumidor rodar sua própria cópia da lógica de
// resolução de sessão/perfil — múltiplas queries redundantes a
// estudio_membros/professores e múltiplos listeners de auth por página.
//
// Uso: <AuthProvider> uma única vez em App.jsx, no topo da árvore.
// A API pública de useAuth() é idêntica à anterior — nenhum consumidor
// existente precisa mudar.
//
// Item 2 do plano multi-segmento: passa a carregar também `segmento`,
// `terminologia` e `modulosAtivos` do estúdio do membro, ampliando a
// MESMA query que já busca estudio_id/role (join em vez de round-trip
// novo) — ver seção 3 do PLANO_ITEM_2.md.

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

// Defaults de segmento/terminologia/modulos_ativos — usados sempre que não
// há estúdio resolvido ainda (loading, super_admin sem tenant, logout).
// Mesmos defaults da migration (coluna `segmento` e `modulos_ativos` têm
// default idêntico no banco) — nunca deve faltar rótulo/menu na tela por
// ausência momentânea de dado.
const SEGMENTO_DEFAULT = 'danca_fitness';
const TERMINOLOGIA_DEFAULT = {};
const MODULOS_ATIVOS_DEFAULT = [];

export function AuthProvider({ children }) {
  const [sessao, setSessao] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [professorId, setProfessorId] = useState(null);
  const [nomeUsuario, setNomeUsuario] = useState(null);
  const [estudioId, setEstudioId] = useState(null);
  const [segmento, setSegmento] = useState(SEGMENTO_DEFAULT);
  const [terminologia, setTerminologia] = useState(TERMINOLOGIA_DEFAULT);
  const [modulosAtivos, setModulosAtivos] = useState(MODULOS_ATIVOS_DEFAULT);
  const [loading, setLoading] = useState(true);
  const [erroPerfil, setErroPerfil] = useState(null); // novo: expõe falhas ao consumidor

  const perfilJaCarregado = useRef(false);
  const perfilCarregadoParaId = useRef(null);

  useEffect(() => {
    let cancelled = false;

    // Helper local: reseta os três campos de segmento pros defaults —
    // chamado em todo ponto onde estudioId também volta pra null (logout,
    // erro, super_admin sem tenant, fallback sem membro).
    const resetarSegmento = () => {
      setSegmento(SEGMENTO_DEFAULT);
      setTerminologia(TERMINOLOGIA_DEFAULT);
      setModulosAtivos(MODULOS_ATIVOS_DEFAULT);
    };

    // Helper local: aplica os dados de `estudios` vindos do join —
    // tolera null/undefined (estúdio ainda não migrado, join falho) caindo
    // nos defaults em vez de deixar `undefined` vazar pra UI.
    const aplicarSegmentoDoEstudio = (estudioRow) => {
      setSegmento(estudioRow?.segmento ?? SEGMENTO_DEFAULT);
      setTerminologia(estudioRow?.terminologia ?? TERMINOLOGIA_DEFAULT);
      setModulosAtivos(estudioRow?.modulos_ativos ?? MODULOS_ATIVOS_DEFAULT);
    };

    const carregarPerfilUsuario = async (session) => {
      if (cancelled) return;

      if (!session) {
        if (!cancelled) {
          setSessao(null);
          setPerfil(null);
          setProfessorId(null);
          setNomeUsuario(null);
          setEstudioId(null);
          setErroPerfil(null);
          resetarSegmento();
          setLoading(false);
        }
        return;
      }

      if (!cancelled) setSessao((prev) => (prev?.user?.id === session.user.id ? prev : session));

      if (perfilJaCarregado.current && perfilCarregadoParaId.current === session.user.id) {
        if (!cancelled) setLoading(false);
        return;
      }

      perfilJaCarregado.current = false;
      const authId = session.user.id;

      try {
        // Join direto na query existente (Opção A da seção 3 do
        // PLANO_ITEM_2.md): zero round-trips adicionais — o dado de
        // segmento/terminologia/modulos_ativos chega no mesmo response.
        const { data: membros, error: errMembro } = await supabase
          .from('estudio_membros')
          .select('estudio_id, role, estudios(segmento, terminologia, modulos_ativos)')
          .eq('user_id', authId)
          .limit(5);

        if (errMembro) {
          throw errMembro;
        }

        if (cancelled) return;

        const membro = membros?.find((m) => m.role === 'super_admin') ?? membros?.[0] ?? null;

        if (membro) {
          perfilJaCarregado.current = true;
          perfilCarregadoParaId.current = authId;
          setErroPerfil(null);

          if (membro.role === 'super_admin') {
            setPerfil('super_admin');
            setEstudioId(null);
            setProfessorId(null);
            setNomeUsuario(session.user.user_metadata?.nome ?? session.user.email ?? null);
            // super_admin sem tenant selecionado usa os defaults — troca
            // para o segmento do tenant impersonado é responsabilidade do
            // ImpersonationContext (useTerminologia combina os dois).
            resetarSegmento();
            setLoading(false);
            return;
          }

          setEstudioId(membro.estudio_id);
          aplicarSegmentoDoEstudio(membro.estudios);

          if (membro.role === 'admin') {
            setPerfil('admin');
            setProfessorId(null);
            setNomeUsuario(null);
            setLoading(false);
            return;
          }

          if (membro.role === 'professor') {
            const { data: professor, error: errProf } = await supabase
              .from('professores')
              .select('id, nome')
              .eq('auth_id', authId)
              .maybeSingle();

            if (errProf && errProf.code !== 'PGRST116') {
              console.error('Erro ao buscar professor:', errProf);
            }

            if (cancelled) return;

            setPerfil('professor');
            // Fallback via membro.referencia_id removido: o campo nunca era
            // selecionado na query de estudio_membros (sempre undefined).
            // Se o vínculo professores.auth_id existir, use-o; senão, null
            // explícito — mais seguro que um fallback que nunca funcionou.
            setProfessorId(professor?.id ?? null);
            setNomeUsuario(professor?.nome ?? null);
            setLoading(false);
            return;
          }

          setPerfil(membro.role ?? 'aluno');
          setProfessorId(null);
          setNomeUsuario(null);
          setLoading(false);
          return;
        }

        // --- Fallback: tabelas legadas ---
        const { data: usuario, error: errAluno } = await supabase
          .from('alunos').select('id, role').eq('auth_id', authId).maybeSingle();
        if (errAluno && errAluno.code !== 'PGRST116') console.error('Erro ao verificar aluno:', errAluno);

        if (cancelled) return;

        if (usuario) {
          perfilJaCarregado.current = true;
          perfilCarregadoParaId.current = authId;
          setErroPerfil(null);
          setPerfil(usuario.role === 'admin' ? 'admin' : 'aluno');
          setProfessorId(null);
          setNomeUsuario(null);
          // Fallback legado não tem join com estudios (não passa por
          // estudio_membros) — fica nos defaults.
          resetarSegmento();
          setLoading(false);
          return;
        }

        const { data: professor, error: errProf } = await supabase
          .from('professores').select('id, nome').eq('auth_id', authId).maybeSingle();
        if (errProf && errProf.code !== 'PGRST116') console.error('Erro ao verificar professor:', errProf);

        if (cancelled) return;

        if (professor) {
          perfilJaCarregado.current = true;
          perfilCarregadoParaId.current = authId;
          setErroPerfil(null);
          setPerfil('professor');
          setProfessorId(professor.id);
          setNomeUsuario(professor.nome ?? null);
          resetarSegmento();
          setLoading(false);
          return;
        }

        perfilJaCarregado.current = true;
        perfilCarregadoParaId.current = authId;
        console.warn('Nenhum perfil encontrado para auth_id:', authId);
        setPerfil(null);
        setProfessorId(null);
        setNomeUsuario(null);
        setEstudioId(null);
        resetarSegmento();
      } catch (error) {
        console.error('Erro fatal ao carregar perfil:', error);
        if (cancelled) return;
        // Não trava mais o usuário permanentemente: em erro transitório,
        // NÃO marca perfilJaCarregado — permite nova tentativa no próximo
        // evento de auth (ex.: reconexão) em vez de exigir reload manual.
        setErroPerfil(error);
        setPerfil(null);
        setProfessorId(null);
        setNomeUsuario(null);
        setEstudioId(null);
        resetarSegmento();
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) carregarPerfilUsuario(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;

      if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') return;

      if (event === 'SIGNED_OUT') {
        perfilJaCarregado.current = false;
        perfilCarregadoParaId.current = null;
        setSessao(null);
        setPerfil(null);
        setProfessorId(null);
        setNomeUsuario(null);
        setEstudioId(null);
        setErroPerfil(null);
        resetarSegmento();
        setLoading(false);

      } else if (event === 'SIGNED_IN') {
        if (perfilJaCarregado.current && perfilCarregadoParaId.current === session?.user?.id) {
          setSessao(session);
          return;
        }
        perfilJaCarregado.current = false;
        setLoading(true);
        carregarPerfilUsuario(session);

      } else {
        if (perfilJaCarregado.current && perfilCarregadoParaId.current === session?.user?.id) {
          setSessao(session);
        } else {
          carregarPerfilUsuario(session);
        }
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []); // roda uma única vez — agora para a aplicação inteira, não por componente

  const value = {
    sessao,
    perfil,
    professorId,
    estudioId,
    nomeUsuario,
    loading,
    erroPerfil,
    segmento,
    terminologia,
    modulosAtivos,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  }
  return ctx;
}