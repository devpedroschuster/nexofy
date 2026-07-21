// supabase/functions/criar-estudio/index.ts
//
// Onboarding completo de um novo estúdio no sistema Nexofy.
//
// Responsabilidades desta Edge Function:
//   1. Valida que o caller é super_admin (via JWT)
//   2. Valida e normaliza o payload
//   3. Verifica unicidade do slug
//   4. Resolve o auth user do admin (cria via GoTrue API ou reutiliza existente)
//   5. Delega todas as escritas no banco para a RPC criar_estudio_transacional()
//   6. Envia link de recovery para admins recém-criados
//
// As escritas em estudios / profiles / estudio_membros / configuracoes_repasse
// ocorrem dentro de uma única transação Postgres — qualquer falha faz rollback
// automático, sem código de desfazimento manual.
//
// Body: { nome, slug, adminEmail, adminNome, whatsapp?, instagram? }

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

// Slug: apenas letras minúsculas, dígitos e hífens, 3–50 caracteres.
const SLUG_RE = /^[a-z0-9-]{3,50}$/;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  // Cliente admin (service role) — ignora RLS, usado para escritas e Auth API
  const admin = createClient(supabaseUrl, serviceKey);

  // ── 1. AUTENTICAÇÃO E AUTORIZAÇÃO ─────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return resp({ error: 'Cabeçalho Authorization ausente ou inválido.' }, 401);
  }

  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user: caller }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !caller) {
    return resp({ error: 'Token inválido ou expirado.' }, 401);
  }

  // Verifica role super_admin na tabela estudio_membros
  // (não confia apenas no user_metadata)
  const { data: callerMembro, error: profileErr } = await admin
    .from('estudio_membros')
    .select('role')
    .eq('user_id', caller.id)
    .maybeSingle();

  if (profileErr) {
    console.error('[criar-estudio] Erro ao verificar perfil do caller:', profileErr);
    return resp({ error: 'Erro ao verificar permissões do usuário.' }, 500);
  }

  if (!callerMembro || callerMembro.role !== 'super_admin') {
    return resp({ error: 'Acesso negado. Apenas super_admins podem criar estúdios.' }, 403);
  }

  // ── 2. VALIDAÇÃO DO PAYLOAD ───────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return resp({ error: 'Payload inválido. Envie um JSON válido.' }, 400);
  }

  const { nome, slug, adminEmail, adminNome, whatsapp, instagram } = body as {
    nome?: string;
    slug?: string;
    adminEmail?: string;
    adminNome?: string;
    whatsapp?: string;
    instagram?: string;
  };

  if (!nome?.trim())       return resp({ error: 'Campo obrigatório ausente: nome.' }, 400);
  if (!slug?.trim())       return resp({ error: 'Campo obrigatório ausente: slug.' }, 400);
  if (!adminEmail?.trim()) return resp({ error: 'Campo obrigatório ausente: adminEmail.' }, 400);
  if (!adminNome?.trim())  return resp({ error: 'Campo obrigatório ausente: adminNome.' }, 400);

  const slugNorm  = slug.trim().toLowerCase();
  const emailNorm = adminEmail.trim().toLowerCase();

  if (!SLUG_RE.test(slugNorm)) {
    return resp({
      error: 'Slug inválido. Use apenas letras minúsculas, números e hífens (3–50 caracteres).',
    }, 400);
  }

  // ── 3. UNICIDADE DO SLUG ──────────────────────────────────────────────────
  const { data: slugExistente } = await admin
    .from('estudios')
    .select('id')
    .eq('slug', slugNorm)
    .maybeSingle();

  if (slugExistente) {
    return resp({ error: `O slug "${slugNorm}" já está em uso. Escolha outro.` }, 409);
  }

  // ── 4. RESOLVER AUTH USER DO ADMIN ────────────────────────────────────────
  // Esta etapa precisa ficar na Edge Function porque createUser é uma API HTTP
  // do GoTrue — não existe equivalente SQL acessível de dentro de uma função
  // PL/pgSQL.
  //
  // Se falhar aqui, nenhuma escrita no banco ainda ocorreu → sem efeito colateral.
  const { data: { user: authExistente }, error: getUserErr } =
   await admin.auth.admin.getUserByEmail(emailNorm);
 if (getUserErr && getUserErr.status !== 404) {
   return resp({ error: `Falha ao consultar usuário: ${getUserErr.message}` }, 500);
 }
  let adminAuthId: string;

  if (authExistente) {
    // Email já existe: reutiliza sem resetar senha
    adminAuthId = authExistente.id;
    console.log(`[criar-estudio] Email já existia no auth, reutilizando: ${adminAuthId}`);
  } else {
    // Cria usuário sem senha — admin acessa via link de recovery
    const { data: authData, error: errAuth } = await admin.auth.admin.createUser({
      email: emailNorm,
      email_confirm: true,
      user_metadata: { nome: adminNome.trim(), role: 'admin' },
    });

    if (errAuth || !authData?.user) {
      return resp({ error: `Falha ao criar usuário auth: ${errAuth?.message ?? 'sem retorno'}` }, 500);
    }

    adminAuthId = authData.user.id;
    console.log(`[criar-estudio] Auth user criado: ${adminAuthId}`);
  }

  // ── 5. ESCRITAS NO BANCO — TRANSAÇÃO ATÔMICA VIA RPC ─────────────────────
  // estudios + profiles + estudio_membros + configuracoes_repasse em uma
  // única transação Postgres. Se qualquer INSERT falhar, o Postgres desfaz
  // tudo automaticamente — sem rollback manual.
  const { data: rpcData, error: rpcErr } = await admin.rpc('criar_estudio_transacional', {
    p_nome:        nome.trim(),
    p_slug:        slugNorm,
    p_whatsapp:    whatsapp?.trim() ?? null,
    p_instagram:   instagram?.trim() ?? null,
    p_admin_id:    adminAuthId,
    p_admin_nome:  adminNome.trim(),
    p_admin_email: emailNorm,
  });

  if (rpcErr) {
    // O banco reverteu tudo automaticamente. Se o auth user foi criado agora,
    // precisamos desfazê-lo — é o único efeito colateral fora da transação.
    if (!authExistente) {
      await admin.auth.admin.deleteUser(adminAuthId).catch((delErr) => {
        // Não propaga — não queremos mascarar o erro original.
        // O super_admin pode limpar manualmente via dashboard se necessário.
        console.warn('[criar-estudio] Falha ao desfazer auth user após erro RPC:', delErr);
      });
    }

    console.error('[criar-estudio] Erro na RPC criar_estudio_transacional:', rpcErr.message);
    return resp({ error: rpcErr.message }, 500);
  }

  // rpc() com RETURNS TABLE retorna um array; pegamos a primeira (e única) linha
  const resultado = Array.isArray(rpcData) ? rpcData[0] : rpcData;

  // ── 6. ENVIAR LINK DE RECOVERY ────────────────────────────────────────────
  // Só para admins recém-criados. Não é fatal — super_admin pode reenviar depois.
  if (!authExistente) {
    const { error: errReset } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: emailNorm,
    });

    if (errReset) {
      console.warn(`[criar-estudio] Falha ao gerar link de recovery: ${errReset.message}`);
    } else {
      console.log(`[criar-estudio] Link de recovery gerado para ${emailNorm}`);
    }
  }

  // ── SUCESSO ───────────────────────────────────────────────────────────────
  return resp({
    sucesso: true,
    estudio: {
      id:   resultado.estudio_id,
      nome: resultado.estudio_nome,
      slug: resultado.estudio_slug,
    },
    admin: {
      auth_id:     adminAuthId,
      email:       emailNorm,
      reutilizado: !!authExistente,
    },
  }, 201);
});