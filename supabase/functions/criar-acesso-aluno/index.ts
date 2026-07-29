import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
 * IMPORTANTE: user_metadata inclui `estudio_id`. É esse dado que a trigger
 * `cria_perfil_automatico` (em auth.users) usa para escopar o match/insert
 * em `public.alunos` por tenant — sem isso, a trigger fica sujeita ao mesmo
 * bug de account takeover / cross-tenant que já corrigimos nela.
 */
async function criarUsuarioSemSenha(
  admin: ReturnType<typeof createClient>,
  emailNormalizado: string,
  nome: string,
  estudioId: string,
): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: emailNormalizado,
    email_confirm: true,          // pula confirmação — acesso via magic link
    user_metadata: { nome, role: 'aluno', estudio_id: estudioId },
    // Sem campo `password` → conta nasce bloqueada para signInWithPassword
  });
  if (error) throw error;

  const novoAuthId = data.user.id;

  // Envia magic link de primeiro acesso.
  // O aluno clica, é autenticado automaticamente e cai no fluxo de
  // /redefinir-senha (detectado via primeiro_acesso = true na tabela alunos).
  const { error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: emailNormalizado,
  });

  // Não é fatal — o admin pode reenviar o convite manualmente depois.
  if (linkError) {
    console.warn(
      `[criar-acesso-aluno] Falha ao gerar magic link para ${emailNormalizado}: ${linkError.message}`,
    );
  } else {
    console.log(`[criar-acesso-aluno] Magic link enviado para ${emailNormalizado}`);
  }

  return novoAuthId;
}

serve(async (req: Request) => {
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

    const { aluno_id, email, nome, estudio_id } = await req.json();

    // ── ISOLAMENTO MULTI-TENANT ────────────────────────────────────────────
    // A service role ignora RLS; estudio_id é obrigatório e NUNCA deve vir
    // confiado sem checagem — é resolvido/validado contra estudio_membros
    // logo abaixo, nunca aceito "de graça" do body.
    if (!estudio_id) {
      return resp({ error: 'estudio_id é obrigatório no payload.' }, 400);
    }
    if (!email || !aluno_id) {
      return resp({ error: 'email e aluno_id são obrigatórios.' }, 400);
    }
    // ──────────────────────────────────────────────────────────────────────

    // ── AUTORIZAÇÃO ──────────────────────────────────────────────────────────
    // Exige que o usuário autenticado seja admin/super_admin do estúdio-alvo,
    // caso contrário qualquer usuário autenticado poderia criar acesso de
    // aluno em estúdios de terceiros (IDOR).
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

    // ── VALIDA QUE O ALUNO PERTENCE A ESTE ESTÚDIO ──────────────────────────
    // Sem isso, um admin do Estúdio A poderia passar o aluno_id de um aluno
    // do Estúdio B e criar acesso de login vinculado a ele (IDOR cross-tenant).
    const { data: alunoAlvo, error: alunoErr } = await admin
      .from('alunos')
      .select('id, auth_id')
      .eq('id', aluno_id)
      .eq('estudio_id', estudio_id)
      .maybeSingle();
    if (alunoErr) throw alunoErr;
    if (!alunoAlvo) {
      return resp({ error: 'Aluno não encontrado neste estúdio.' }, 404);
    }
    if (alunoAlvo.auth_id) {
      return resp({ error: 'Este aluno já possui um acesso vinculado.' }, 409);
    }

    const emailNormalizado = email.trim().toLowerCase();

    // Verifica se já existe um auth user com esse email
    const { data: { user: existente }, error: getUserErr } =
      await admin.auth.admin.getUserByEmail(emailNormalizado);
    if (getUserErr && getUserErr.status !== 404) throw getUserErr;

    let novoAuthId: string;
    let reutilizado = false;

    if (existente) {
      // Usuário já existe: apenas vincula, não cria nem envia link
      novoAuthId = existente.id;
      reutilizado = true;
    } else {
      // Cria sem senha + envia magic link de primeiro acesso
      novoAuthId = await criarUsuarioSemSenha(admin, emailNormalizado, nome, estudio_id);
    }

    // Atualiza alunos: auth_id, email e primeiro_acesso = true
    // (mesmo isolamento por estudio_id do padrão de professores)
    const { error: upErr } = await admin
      .from('alunos')
      .update({
        auth_id: novoAuthId,
        email: emailNormalizado,
        primeiro_acesso: !reutilizado, // só marca primeiro_acesso para usuários novos
      })
      .eq('id', aluno_id)
      .eq('estudio_id', estudio_id);  // ← isolamento: garante que o aluno pertence ao estúdio
    if (upErr) throw upErr;

    // Vincula aluno ao estúdio na tabela de membros (upsert para idempotência)
    const { error: memErr } = await admin
      .from('estudio_membros')
      .upsert(
        {
          estudio_id,
          user_id: novoAuthId,
          role: 'aluno',
        },
        { onConflict: 'estudio_id,user_id' }  // evita duplicatas em chamadas repetidas
      );
    if (memErr) throw memErr;

    return resp({ auth_id: novoAuthId, reutilizado });

  } catch (err) {
    console.error('[criar-acesso-aluno] Erro:', err);
    return resp({ error: err instanceof Error ? err.message : 'Erro interno.' }, 500);
  }
});