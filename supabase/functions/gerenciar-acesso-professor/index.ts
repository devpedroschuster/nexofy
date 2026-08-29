import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getUserByEmail } from '../_shared/getUserByEmail.ts';
import { withSentry } from "../_shared/sentry.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// SENHA_PADRAO removida — professores nascem sem senha e recebem magic link.

function resp(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Cria um auth user sem senha e ENVIA o convite por e-mail via
 * inviteUserByEmail (diferente de generateLink, este método efetivamente
 * dispara o e-mail através do provedor SMTP configurado no projeto).
 * Retorna o auth_id do usuário criado.
 */
async function criarUsuarioSemSenha(
  admin: SupabaseClient,
  emailNormalizado: string,
  nome: string,
): Promise<string> {

  const { data, error } = await admin.auth.admin.inviteUserByEmail(emailNormalizado, {
    data: { nome, role: 'professor' },
  });
  if (error) throw error;

  console.log(`[gerenciar-acesso-professor] Convite enviado para ${emailNormalizado}`);
  return data.user.id;
}

serve(withSentry("gerenciar-acesso-professor", async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const admin       = createClient(supabaseUrl, serviceKey);

  try {
    // ── AUTENTICAÇÃO ────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return resp({ error: 'Não autorizado.' }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return resp({ error: 'Não autorizado.' }, 401);
    }

    const { acao, professor_id, auth_id, email, nome, estudio_id } = await req.json();

    // ── ISOLAMENTO MULTI-TENANT ────────────────────────────────────────────
    // A service role ignora RLS; estudio_id é obrigatório para todas as ações
    // que criam ou modificam vínculos (criar, trocar_email).
    // A ação 'remover' também exige estudio_id para remover o membro correto.
    if (!estudio_id) {
      return resp({ error: 'estudio_id é obrigatório no payload.' }, 400);
    }
    // ──────────────────────────────────────────────────────────────────────

    // ── AUTORIZAÇÃO ──────────────────────────────────────────────────────────
    // Exige que o usuário autenticado seja admin/super_admin do estúdio-alvo,
    // caso contrário qualquer usuário autenticado poderia gerenciar acesso de
    // professores em estúdios de terceiros (IDOR).
    const { data: membro, error: membroErr } = await admin
      .from('estudio_membros')
      .select('role')
      .eq('user_id', user.id)
      .eq('estudio_id', estudio_id)
      .maybeSingle();
    if (membroErr) throw membroErr;
    if (!membro || !['admin', 'super_admin'].includes(membro.role)) {
      return resp({ error: 'Acesso negado.' }, 403);
    }

    // CRIAR

if (acao === 'criar') {
  if (!email || !professor_id) return resp({ error: 'email e professor_id são obrigatórios' }, 400);

  const emailNormalizado = email.trim().toLowerCase();
  const { user: existente, error: getUserErr } = await getUserByEmail(admin, emailNormalizado);
  if (getUserErr) throw getUserErr;

  let novoAuthId: string;
  let reutilizado = false;
  let authCriadoNestaChamada = false;

  if (existente) {
    novoAuthId = existente.id;
    reutilizado = true;
  } else {
    novoAuthId = await criarUsuarioSemSenha(admin, emailNormalizado, nome);
    authCriadoNestaChamada = true;
  }

  try {
    const { error: upErr } = await admin
      .from('professores')
      .update({
        auth_id: novoAuthId,
        email: emailNormalizado,
        primeiro_acesso: !reutilizado,
      })
      .eq('id', professor_id)
      .eq('estudio_id', estudio_id);
    if (upErr) throw upErr;

    const { error: memErr } = await admin
      .from('estudio_membros')
      .upsert(
        { estudio_id, user_id: novoAuthId, role: 'professor' },
        { onConflict: 'estudio_id,user_id' },
      );
    if (memErr) throw memErr;
  } catch (err) {
    if (authCriadoNestaChamada) {
      await admin.auth.admin.deleteUser(novoAuthId).catch((delErr) =>
        console.error(`[gerenciar-acesso-professor] Falha ao reverter auth user órfão ${novoAuthId}:`, delErr),
      );
    }
    throw err;
  }

  return resp({ auth_id: novoAuthId, reutilizado });
}

    // REMOVER
    if (acao === 'remover') {
  if (!auth_id || !professor_id) return resp({ error: 'auth_id e professor_id são obrigatórios' }, 400);

  const { error: upErr } = await admin
    .from('professores')
    .update({ auth_id: null, email: null, primeiro_acesso: false })
    .eq('id', professor_id)
    .eq('estudio_id', estudio_id);
  if (upErr) throw upErr;

  const { error: memErr } = await admin
    .from('estudio_membros')
    .delete()
    .eq('estudio_id', estudio_id)
    .eq('user_id', auth_id);
  if (memErr) throw memErr;

  const { data: aluno } = await admin
    .from('alunos')
    .select('id')
    .eq('auth_id', auth_id)
    .maybeSingle();

  let userDeletado = false;
  if (!aluno) {
    const { data: outrosVinculos } = await admin
      .from('estudio_membros')
      .select('id')
      .eq('user_id', auth_id)
      .limit(1);

    if (!outrosVinculos || outrosVinculos.length === 0) {
      const { error: delErr } = await admin.auth.admin.deleteUser(auth_id);
      if (delErr && !delErr.message.includes('User not found')) {
        console.warn(`[gerenciar-acesso-professor] Falha ao deletar auth ${auth_id} após remoção:`, delErr.message);
      } else {
        userDeletado = true;
      }
    }
  }

  return resp({ removido: true, user_deletado: userDeletado });
}

    // TROCAR EMAIL
    if (acao === 'trocar_email') {
      if (!auth_id || !email || !professor_id) {
        return resp({ error: 'auth_id, email e professor_id são obrigatórios' }, 400);
      }

      const { data: aluno } = await admin
        .from('alunos')
        .select('id')
        .eq('auth_id', auth_id)
        .maybeSingle();

      const { data: outrosVinculos } = await admin
        .from('estudio_membros')
        .select('id')
        .eq('user_id', auth_id)
        .neq('estudio_id', estudio_id)
        .limit(1);

      const podeDeletarAuthAntigo = !aluno && (!outrosVinculos || outrosVinculos.length === 0);

      const emailNormalizado = email.trim().toLowerCase();

      // ANTES: await admin.auth.admin.getUserByEmail(emailNormalizado)
      // — mesmo método inexistente, mesma correção do bloco 'criar' acima.
      const { user: existente, error: getUserErr2 } = await getUserByEmail(admin, emailNormalizado);
      if (getUserErr2) throw getUserErr2;

      let novoAuthId: string;
      let reutilizado = false;

      if (existente) {
        novoAuthId = existente.id;
        reutilizado = true;
      } else {
        // Cria sem senha + envia magic link de primeiro acesso
        novoAuthId = await criarUsuarioSemSenha(admin, emailNormalizado, nome);
      }

      const { error: upErr } = await admin
        .from('professores')
        .update({
          auth_id: novoAuthId,
          email: emailNormalizado,
          primeiro_acesso: !reutilizado,
        })
        .eq('id', professor_id)
        .eq('estudio_id', estudio_id);  // ← isolamento
      if (upErr) throw upErr;

      // Atualiza o vínculo na estudio_membros com o novo auth_id
      // Remove o vínculo antigo e insere o novo (upsert não funciona bem para troca de user_id)
      await admin
        .from('estudio_membros')
        .delete()
        .eq('estudio_id', estudio_id)
        .eq('user_id', auth_id);         // remove vínculo do auth_id antigo

      const { error: memErr } = await admin
        .from('estudio_membros')
        .upsert(
          {
            estudio_id,
            user_id: novoAuthId,
            role: 'professor',
          },
          { onConflict: 'estudio_id,user_id' }
        );
      if (memErr) throw memErr;

      // Só agora, com tudo confirmado, deleta a conta auth antiga —
      // e só se ela não tiver outros vínculos (aluno ou professor em outro estúdio).
      let authAntigoDeletado = false;
      if (podeDeletarAuthAntigo && novoAuthId !== auth_id) {
        const { error: delErr } = await admin.auth.admin.deleteUser(auth_id);
        if (delErr && !delErr.message.includes('User not found')) {
          console.warn(
            `[gerenciar-acesso-professor] Falha ao deletar auth antigo ${auth_id} após troca de e-mail: ${delErr.message}`,
          );
        } else {
          authAntigoDeletado = true;
        }
      }

      return resp({ auth_id: novoAuthId, reutilizado, auth_antigo_deletado: authAntigoDeletado });
    }

    return resp({ error: `Ação desconhecida: ${acao}` }, 400);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro interno';
    console.error('[gerenciar-acesso-professor]', msg);
    return resp({ error: msg }, 500);
  }
}));