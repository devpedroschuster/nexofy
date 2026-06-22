import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
 * Cria um auth user sem senha e envia magic link de primeiro acesso.
 * Retorna o auth_id do usuário criado.
 *
 * Uso: chamado nas ações 'criar' e 'trocar_email' quando o e-mail não existe.
 */
async function criarUsuarioSemSenha(
  admin: ReturnType<typeof createClient>,
  emailNormalizado: string,
  nome: string,
): Promise<string> {
  // 1. Cria o usuário sem password — impossibilita login com senha até ele definir uma.
  const { data, error } = await admin.auth.admin.createUser({
    email: emailNormalizado,
    email_confirm: true,          // pula confirmação — acesso via magic link
    user_metadata: { nome, role: 'professor' },
    // Sem campo `password` → conta nasce bloqueada para signInWithPassword
  });
  if (error) throw error;

  const novoAuthId = data.user.id;

  // 2. Envia magic link de primeiro acesso.
  //    O professor clica, é autenticado automaticamente e cai no fluxo
  //    de /redefinir-senha (detectado via primeiro_acesso = true na tabela professores).
  const { error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: emailNormalizado,
  });

  // Não é fatal — o admin pode reenviar o convite manualmente depois.
  if (linkError) {
    console.warn(
      `[gerenciar-acesso-professor] Falha ao gerar magic link para ${emailNormalizado}: ${linkError.message}`,
    );
  } else {
    console.log(`[gerenciar-acesso-professor] Magic link enviado para ${emailNormalizado}`);
  }

  return novoAuthId;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const admin       = createClient(supabaseUrl, serviceKey);

  try {
    const { acao, professor_id, auth_id, email, nome, estudio_id } = await req.json();

    // ── ISOLAMENTO MULTI-TENANT ────────────────────────────────────────────
    // A service role ignora RLS; estudio_id é obrigatório para todas as ações
    // que criam ou modificam vínculos (criar, trocar_email).
    // A ação 'remover' também exige estudio_id para remover o membro correto.
    if (!estudio_id) {
      return resp({ error: 'estudio_id é obrigatório no payload.' }, 400);
    }
    // ──────────────────────────────────────────────────────────────────────

    // ── CRIAR ────────────────────────────────────────────────────────────────
    if (acao === 'criar') {
      if (!email || !professor_id) return resp({ error: 'email e professor_id são obrigatórios' }, 400);

      const emailNormalizado = email.trim().toLowerCase();

      // Verifica se já existe um auth user com esse email
      const { data: { users }, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
      if (listErr) throw listErr;

      const existente = users.find((u) => u.email === emailNormalizado);

      let novoAuthId: string;
      let reutilizado = false;

      if (existente) {
        // Usuário já existe: apenas vincula, não cria nem envia link
        novoAuthId = existente.id;
        reutilizado = true;
      } else {
        // Cria sem senha + envia magic link de primeiro acesso
        novoAuthId = await criarUsuarioSemSenha(admin, emailNormalizado, nome);
      }

      // Atualiza professores: auth_id, email e primeiro_acesso = true
      const { error: upErr } = await admin
        .from('professores')
        .update({
          auth_id: novoAuthId,
          email: emailNormalizado,
          primeiro_acesso: !reutilizado, // só marca primeiro_acesso para usuários novos
        })
        .eq('id', professor_id)
        .eq('estudio_id', estudio_id);  // ← isolamento: garante que o professor pertence ao estúdio
      if (upErr) throw upErr;

      // Vincula professor ao estúdio na tabela de membros (upsert para idempotência)
      const { error: memErr } = await admin
        .from('estudio_membros')
        .upsert(
          {
            estudio_id,
            user_id: novoAuthId,
            role: 'professor',
          },
          { onConflict: 'estudio_id,user_id' }  // evita duplicatas em chamadas repetidas
        );
      if (memErr) throw memErr;

      return resp({ auth_id: novoAuthId, reutilizado });
    }

    // ── REMOVER ───────────────────────────────────────────────────────────────
    if (acao === 'remover') {
      if (!auth_id || !professor_id) return resp({ error: 'auth_id e professor_id são obrigatórios' }, 400);

      // Remove o vínculo do estúdio antes de qualquer deleção de usuário
      const { error: memErr } = await admin
        .from('estudio_membros')
        .delete()
        .eq('estudio_id', estudio_id)  // ← isolamento: remove só do estúdio correto
        .eq('user_id', auth_id);
      if (memErr) throw memErr;

      const { data: aluno } = await admin
        .from('alunos')
        .select('id')
        .eq('auth_id', auth_id)
        .maybeSingle();

      let userDeletado = false;
      if (!aluno) {
        // Verifica se o usuário ainda tem vínculo com algum outro estúdio antes de deletar
        const { data: outrosVinculos } = await admin
          .from('estudio_membros')
          .select('id')
          .eq('user_id', auth_id)
          .limit(1);

        if (!outrosVinculos || outrosVinculos.length === 0) {
          const { error: delErr } = await admin.auth.admin.deleteUser(auth_id);
          if (delErr && !delErr.message.includes('User not found')) throw delErr;
          userDeletado = true;
        }
      }

      const { error: upErr } = await admin
        .from('professores')
        .update({ auth_id: null, email: null, primeiro_acesso: false })
        .eq('id', professor_id)
        .eq('estudio_id', estudio_id);  // ← isolamento
      if (upErr) throw upErr;

      return resp({ removido: true, user_deletado: userDeletado });
    }

    // ── TROCAR EMAIL ──────────────────────────────────────────────────────────
    if (acao === 'trocar_email') {
      if (!auth_id || !email || !professor_id) {
        return resp({ error: 'auth_id, email e professor_id são obrigatórios' }, 400);
      }

      const { data: aluno } = await admin
        .from('alunos')
        .select('id')
        .eq('auth_id', auth_id)
        .maybeSingle();

      if (!aluno) {
        const { error: delErr } = await admin.auth.admin.deleteUser(auth_id);
        if (delErr && !delErr.message.includes('User not found')) throw delErr;
      }

      const emailNormalizado = email.trim().toLowerCase();
      const { data: { users }, error: listErr2 } = await admin.auth.admin.listUsers({ perPage: 1000 });
      if (listErr2) throw listErr2;
      const existente = users.find((u) => u.email === emailNormalizado);

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

      return resp({ auth_id: novoAuthId, reutilizado });
    }

    return resp({ error: `Ação desconhecida: ${acao}` }, 400);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro interno';
    console.error('[gerenciar-acesso-professor]', msg);
    return resp({ error: msg }, 500);
  }
});