// webapp/src/lib/supabase.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Falha alto e cedo, no boot do app, em vez de deixar o erro
  // aparecer só na primeira chamada de rede (ex: tela de login
  // travada com "Failed to fetch" sem explicação nenhuma).
  throw new Error(
    '[supabase] VITE_SUPABASE_URL e/ou VITE_SUPABASE_ANON_KEY não definidas. ' +
    'Verifique as variáveis de ambiente do build.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // necessário para o fluxo de magic link visto em Login.jsx
  },
});