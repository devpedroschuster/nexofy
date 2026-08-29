// Este helper reproduz getUserByEmail de forma segura, paginando listUsers()
// até encontrar o e-mail (case-insensitive) ou esgotar os resultados.
// Para bases muito grandes de usuários, o ideal a médio prazo é substituir
// por uma RPC SECURITY DEFINER que consulta auth.users diretamente
// (ex: get_user_id_by_email(p_email text) returns uuid), evitando paginação
// no client. Mantido aqui como correção mínima e imediata.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

type AdminClient = SupabaseClient;

const PAGE_SIZE = 200;
const MAX_PAGES = 25;

export async function getUserByEmail(
  admin: AdminClient,
  email: string,
): Promise<{ user: { id: string } | null; error: Error | null }> {
  const alvo = email.trim().toLowerCase();
  if (!alvo) return { user: null, error: new Error('E-mail vazio.') };

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: PAGE_SIZE,
    });

    if (error) return { user: null, error };

    const encontrado = data.users.find(
      (u) => (u.email ?? '').toLowerCase() === alvo,
    );
    if (encontrado) return { user: { id: encontrado.id }, error: null };

    if (data.users.length < PAGE_SIZE) break;
  }

  return { user: null, error: null };
}