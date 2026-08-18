import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getUserByEmail } from '../_shared/getUserByEmail.ts';

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

async function criarUsuarioSemSenha(
  admin: ReturnType<typeof createClient>,
  emailNormalizado: string,
  nome: string,
  estudioId: string,
): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: emailNormalizado,
    email_confirm: true,
    user_metadata: { nome, role: 'aluno', estudio_id: estudioId },
  });
  if (error) throw error;

  const novoAuthId = data.user.id;

  const { error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: emailNormalizado,
  });

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
    // AUTENTICAÇÃO
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

    // ISOLAMENTO MULTI-TENANT

    if (!estudio_id) {
      return resp({ error: 'estudio_id é obrigatório no payload.' }, 400);
    }
    if (!email || !aluno_id) {
      return resp({ error: 'email e aluno_id são obrigatórios.' }, 400);
    }

    // AUTORIZAÇÃO

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

    // VALIDA QUE O ALUNO PERTENCE A ESTE ESTÚDIO

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

    const { user: existente, error: getUserErr } = await getUserByEmail(admin, emailNormalizado);
    if (getUserErr) throw getUserErr;
let novoAuthId: string;
    let reutilizado = false;
 
    if (existente) {
      novoAuthId = existente.id;
      reutilizado = true;
 
      const { data: membroExistente, error: membroExistenteErr } = await admin
        .from('estudio_membros')
        .select('role')
        .eq('estudio_id', estudio_id)
        .eq('user_id', novoAuthId)
        .maybeSingle();
      if (membroExistenteErr) throw membroExistenteErr;
 
      if (membroExistente && membroExistente.role !== 'aluno') {
        return resp(
          {
            error:
              `Este e-mail já possui acesso como "${membroExistente.role}" neste estúdio. ` +
              `Vincular como aluno exigiria rebaixar esse acesso — ação não realizada automaticamente.`,
          },
          409,
        );
      }
    } else {
      novoAuthId = await criarUsuarioSemSenha(admin, emailNormalizado, nome, estudio_id);
    }

    const { error: upErr } = await admin
      .from('alunos')
      .update({
        auth_id: novoAuthId,
        email: emailNormalizado,
        primeiro_acesso: !reutilizado,
      })
      .eq('id', aluno_id)
      .eq('estudio_id', estudio_id);
    if (upErr) throw upErr;

    const { error: memErr } = await admin
      .from('estudio_membros')
      .upsert(
        { estudio_id, user_id: novoAuthId, role: 'aluno' },
        { onConflict: 'estudio_id,user_id' },
      );
    if (memErr) throw memErr;
 
    return resp({ auth_id: novoAuthId, reutilizado });

  } catch (err) {
    console.error('[criar-acesso-aluno] Erro:', err);
    return resp({ error: err instanceof Error ? err.message : 'Erro interno.' }, 500);
  }
});