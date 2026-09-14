import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

// Mesmo racional do webapp: sessão vem do Supabase Auth, sem estado próprio
// de "logado" — a UI reage a `session` ser null ou não.
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
