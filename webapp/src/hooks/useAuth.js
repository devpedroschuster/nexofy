// webapp/src/hooks/useAuth.js
//
// PATCH: adicionado suporte ao role 'super_admin'.
//
// Mudanças mínimas em relação à versão anterior:
//  - `estudio_membros` com role 'super_admin' → setPerfil('super_admin')
//  - Nenhuma outra lógica alterada; compatibilidade total com admin/professor/aluno.
//
// O super_admin não tem estudio_id próprio (atua cross-tenant).
// Por isso setEstudioId(null) é correto para ele.

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

export function useAuth() {
  const [sessao, setSessao] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [professorId, setProfessorId] = useState(null);
  const [nomeUsuario, setNomeUsuario] = useState(null);
  const [estudioId, setEstudioId] = useState(null);
  const [loading, setLoading] = useState(true);

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
        const { data: membro, error: errMembro } = await supabase
          .from('estudio_membros')
          .select('estudio_id, role, referencia_id')
          .eq('user_id', authId)
          .single();

        if (errMembro && errMembro.code !== 'PGRST116') {
          console.error('Erro ao buscar estudio_membros:', errMembro);
        }

        if (cancelled) return;

        if (membro) {
          perfilJaCarregado.current = true;
          perfilCarregadoParaId.current = authId;

          // ── SUPER ADMIN ────────────────────────────────────────────────────
          // Não tem estudio_id próprio — atua cross-tenant.
          if (membro.role === 'super_admin') {
            setPerfil('super_admin');
            setEstudioId(null);
            setProfessorId(null);
            setNomeUsuario(session.user.user_metadata?.nome ?? session.user.email ?? null);
            setLoading(false);
            return;
          }
          // ──────────────────────────────────────────────────────────────────

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
            setProfessorId(professor?.id ?? membro.referencia_id ?? null);
            setNomeUsuario(professor?.nome ?? null);
            setLoading(false);
            return;
          }

          // Papel 'aluno' ou qualquer outro papel futuro
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
        perfilJaCarregado.current = true;
        perfilCarregadoParaId.current = authId;
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
  }, []);

  return { sessao, perfil, professorId, estudioId, nomeUsuario, loading };
}