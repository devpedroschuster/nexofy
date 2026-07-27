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

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [sessao, setSessao] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [professorId, setProfessorId] = useState(null);
  const [nomeUsuario, setNomeUsuario] = useState(null);
  const [estudioId, setEstudioId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erroPerfil, setErroPerfil] = useState(null); // novo: expõe falhas ao consumidor

  const perfilJaCarregado = useRef(false);
  const perfilCarregadoParaId = useRef(null);

  useEffect(() => {
    let cancelled = false;

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
        const { data: membros, error: errMembro } = await supabase
  .from('estudio_membros')
  .select('estudio_id, role')
  .eq('user_id', authId);

if (errMembro) {
  console.error('Erro ao buscar estudio_membros:', errMembro);
}

if (cancelled) return;

// Prioriza super_admin caso existam múltiplos vínculos
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
            setLoading(false);
            return;
          }

          setEstudioId(membro.estudio_id);

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

  const value = { sessao, perfil, professorId, estudioId, nomeUsuario, loading, erroPerfil };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  }
  return ctx;
}