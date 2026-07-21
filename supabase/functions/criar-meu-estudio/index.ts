// supabase/functions/criar-meu-estudio/index.ts
//
// Onboarding self-service de um novo estúdio no sistema Nexofy.
//
// Diferença em relação a `criar-estudio` (fluxo admin/super_admin):
//   - Não exige role super_admin — qualquer usuário autenticado e com
//     e-mail confirmado pode chamar, DESDE QUE ainda não seja membro de
//     nenhum estúdio.
//   - Não cria auth user nem gera link de recovery — o caller já existe
//     e já definiu sua própria senha no signUp.
//   - p_admin_id é sempre o próprio caller (nunca um terceiro).
//
// Escritas em estudios / profiles / estudio_membros / configuracoes_repasse
// continuam acontecendo dentro da mesma transação Postgres
// (criar_estudio_transacional) — qualquer falha faz rollback automático.
//
// Body: { nome, slug, whatsapp?, instagram? }

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

  // Cliente admin (service role) — ignora RLS, usado só para a escrita transacional.
  const admin = createClient(supabaseUrl, serviceKey);

  // ── 1. AUTENTICAÇÃO ────────────────────────────────────────────────────────
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

  // E-mail precisa estar confirmado — é a garantia mínima de que não é bot.
  if (!caller.email_confirmed_at && !caller.confirmed_at) {
    return resp({ error: 'Confirme seu e-mail antes de criar um estúdio.' }, 403);
  }

  if (!caller.email) {
    return resp({ error: 'Usuário sem e-mail associado.' }, 400);
  }

  // ── 2. IMPEDE MÚLTIPLOS ESTÚDIOS PELO MESMO USUÁRIO ────────────────────────
  // Política atual: 1 conta → 1 estúdio. Se no futuro Nexofy quiser permitir
  // multi-estúdio por dono, este bloco (e a checagem em useAuth/App.jsx) é o
  // ponto a revisar.
  const { data: membroExistente, error: membroErr } = await admin
    .from('estudio_membros')
    .select('estudio_id')
    .eq('user_id', caller.id)
    .maybeSingle();

  if (membroErr) {
    console.error('[criar-meu-estudio] Erro ao verificar vínculo existente:', membroErr);
    return resp({ error: 'Erro ao verificar sua conta.' }, 500);
  }

  if (membroExistente) {
    return resp({ error: 'Sua conta já está vinculada a um estúdio.' }, 409);
  }

  // ── 3. VALIDAÇÃO DO PAYLOAD ─────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return resp({ error: 'Payload inválido. Envie um JSON válido.' }, 400);
  }

  const { nome, slug, whatsapp, instagram } = body as {
    nome?: string;
    slug?: string;
    whatsapp?: string;
    instagram?: string;
  };

  if (!nome?.trim()) return resp({ error: 'Campo obrigatório ausente: nome.' }, 400);
  if (!slug?.trim()) return resp({ error: 'Campo obrigatório ausente: slug.' }, 400);

  const slugNorm = slug.trim().toLowerCase();

  if (!SLUG_RE.test(slugNorm)) {
    return resp({
      error: 'Slug inválido. Use apenas letras minúsculas, números e hífens (3–50 caracteres).',
    }, 400);
  }

  // ── 4. UNICIDADE DO SLUG ─────────────────────────────────────────────────────
  const { data: slugExistente } = await admin
    .from('estudios')
    .select('id')
    .eq('slug', slugNorm)
    .maybeSingle();

  if (slugExistente) {
    return resp({ error: `O slug "${slugNorm}" já está em uso. Escolha outro.` }, 409);
  }

  // ── 5. ESCRITAS NO BANCO — TRANSAÇÃO ATÔMICA VIA RPC ─────────────────────────
  // Mesma RPC do fluxo admin. p_admin_id é o próprio caller — não há criação
  // nem reuso de auth user aqui, ele já existe e já tem senha própria.
  const adminNome = (caller.user_metadata?.nome as string | undefined)?.trim() || caller.email;

  const { data: rpcData, error: rpcErr } = await admin.rpc('criar_estudio_transacional', {
    p_nome:        nome.trim(),
    p_slug:        slugNorm,
    p_whatsapp:    whatsapp?.trim() ?? null,
    p_instagram:   instagram?.trim() ?? null,
    p_admin_id:    caller.id,
    p_admin_nome:  adminNome,
    p_admin_email: caller.email,
  });

  if (rpcErr) {
    console.error('[criar-meu-estudio] Erro na RPC criar_estudio_transacional:', rpcErr.message);
    return resp({ error: rpcErr.message }, 500);
  }

  // rpc() com RETURNS TABLE retorna um array; pegamos a primeira (e única) linha
  const resultado = Array.isArray(rpcData) ? rpcData[0] : rpcData;

  // ── SUCESSO ────────────────────────────────────────────────────────────────
  return resp({
    sucesso: true,
    estudio: {
      id:   resultado.estudio_id,
      nome: resultado.estudio_nome,
      slug: resultado.estudio_slug,
    },
  }, 201);
});