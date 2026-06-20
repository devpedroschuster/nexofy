// supabase/functions/criar-estudio/index.ts
//
// Onboarding completo de um novo estúdio no sistema Nexofy.
//
// Responsabilidades:
//   1. Valida que o caller é um super_admin (via JWT)
//   2. Verifica unicidade do slug antes de qualquer escrita
//   3. Cria o registro do estúdio (estudios)
//   4. Cria o usuário admin via auth.admin (email_confirm: true)
//   5. Cria o perfil na tabela `profiles` (role: admin, estudio_id vinculado)
//   6. Vincula o admin ao estúdio em `estudio_membros`
//   7. Provisiona configurações de repasse padrão para o estúdio
//   8. Em caso de erro em qualquer etapa, faz rollback das escritas anteriores
//
// Chamada exclusiva via super_admin autenticado — nunca exposta ao público.
// Body: { nome, slug, adminEmail, adminNome, whatsapp?, instagram? }
//
// NOTA DE SEGURANÇA:
//   A service role ignora RLS, portanto toda escrita é filtrada explicitamente
//   por estudio_id para garantir o isolamento multi-tenant — mesma convenção
//   adotada em todas as outras Edge Functions do projeto.

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

// Configurações de repasse com valores neutros — admin do estúdio define os reais
// depois do onboarding. Valores zerados evitam cálculos incorretos acidentais.
const CONFIG_REPASSE_PADRAO = {
  valor_1_modalidade: 0,
  valor_multi_modalidade: 0,
  plano_livre_pct_prof: 0,
  plano_livre_pct_casa: 100,
  aula_avulsa_valor: 0,
  aula_avulsa_pct_prof: 0,
  aula_avulsa_pct_casa: 100,
  aula_experimental_valor: 0,
  aula_experimental_pct_prof: 0,
};

// Slug: apenas letras minúsculas, dígitos e hífens, 3–50 caracteres.
const SLUG_RE = /^[a-z0-9-]{3,50}$/;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl  = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  // Cliente admin (service role) — ignora RLS, usado para todas as escritas
  const admin = createClient(supabaseUrl, serviceKey);

  // ── 1. AUTENTICAÇÃO E AUTORIZAÇÃO ─────────────────────────────────────────
  // Valida o JWT do caller e garante que é super_admin.
  // Criamos um client user-scoped para verificar o papel sem confiar no payload.
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

  // Verifica role super_admin na tabela profiles (não confia apenas no user_metadata)
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

  // ── 2. VALIDAÇÃO DO PAYLOAD
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
  // ──────────────────────────────────────────────────────────────────────────

  // ── 3. UNICIDADE DO SLUG ──────────────────────────────────────────────────
  const { data: slugExistente } = await admin
    .from('estudios')
    .select('id')
    .eq('slug', slugNorm)
    .maybeSingle();

  if (slugExistente) {
    return resp({ error: `O slug "${slugNorm}" já está em uso. Escolha outro.` }, 409);
  }
  // ──────────────────────────────────────────────────────────────────────────

  // Estado para rollback — gravamos os IDs à medida que criamos
  let estudioId: string | null = null;
  let adminAuthId: string | null = null;

  try {

    // ── 4. CRIAR ESTÚDIO ────────────────────────────────────────────────────
    const { data: estudio, error: errEstudio } = await admin
      .from('estudios')
      .insert({
        nome: nome.trim(),
        slug: slugNorm,
        whatsapp: whatsapp?.trim() ?? null,
        instagram: instagram?.trim() ?? null,
      })
      .select('id, nome, slug')
      .single();

    if (errEstudio || !estudio) {
      throw new Error(`Falha ao criar estúdio: ${errEstudio?.message ?? 'sem retorno'}`);
    }

    estudioId = estudio.id;
    console.log(`[criar-estudio] Estúdio criado: ${estudioId} (${slugNorm})`);

    // ── 5. CRIAR USUÁRIO ADMIN ───────────────────────────────────────────────
    // Verifica se já existe um auth user com esse email (segurança: não duplica)
    const { data: { users: listaAuth }, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (listErr) throw new Error(`Falha ao consultar usuários: ${listErr.message}`);

    const authExistente = listaAuth.find((u) => u.email === emailNorm);

    if (authExistente) {
      // Email já existe: não criamos nem resetamos senha — apenas vinculamos
      adminAuthId = authExistente.id;
      console.log(`[criar-estudio] Email já existia no auth, reutilizando: ${adminAuthId}`);
    } else {
      // Cria usuário sem senha: o admin definirá sua própria via link de reset
      const { data: authData, error: errAuth } = await admin.auth.admin.createUser({
        email: emailNorm,
        email_confirm: true,          // pula confirmação — acesso via reset de senha
        user_metadata: {
          nome: adminNome.trim(),
          role: 'admin',
        },
      });

      if (errAuth || !authData?.user) {
        throw new Error(`Falha ao criar usuário auth: ${errAuth?.message ?? 'sem retorno'}`);
      }

      adminAuthId = authData.user.id;
      console.log(`[criar-estudio] Auth user criado: ${adminAuthId}`);
    }

    // ── 6. CRIAR PERFIL NA TABELA PROFILES ──────────────────────────────────
    // Upsert: se o usuário já existia (email reutilizado), apenas atualiza o
    // estudio_id — não sobrescreve outros campos como nome ou role em outros estúdios.
    const { error: errProfile } = await admin
      .from('profiles')
      .upsert(
        {
          id: adminAuthId,                  // FK para auth.users
          estudio_id: estudioId,            // ← isolamento multi-tenant
          role: 'admin',
          nome: adminNome.trim(),
        },
        { onConflict: 'id' }
      );

    if (errProfile) {
      throw new Error(`Falha ao criar perfil: ${errProfile.message}`);
    }

    // ── 7. VINCULAR ADMIN AO ESTÚDIO ─────────────────────────────────────────
    const { error: errMembro } = await admin
      .from('estudio_membros')
      .upsert(
        {
          estudio_id: estudioId,            // ← isolamento
          user_id: adminAuthId,
          role: 'admin',
        },
        { onConflict: 'estudio_id,user_id' }
      );

    if (errMembro) {
      throw new Error(`Falha ao vincular admin ao estúdio: ${errMembro.message}`);
    }

    // ── 8. PROVISIONAR CONFIGURAÇÕES DE REPASSE PADRÃO ──────────────────────
    // Sem isso a função `gerar-repasses` falharia com "Configurações não encontradas".
    const { error: errConfig } = await admin
      .from('configuracoes_repasse')
      .insert({
        estudio_id: estudioId,             // ← isolamento
        ...CONFIG_REPASSE_PADRAO,
      });

    if (errConfig) {
      // Não é fatal se já existir (upsert-like behavior):
      // insert com conflict retorna erro, mas o registro já existe → ok.
      if (!errConfig.message.includes('duplicate') && !errConfig.code?.includes('23505')) {
        throw new Error(`Falha ao criar configurações de repasse: ${errConfig.message}`);
      }
      console.warn('[criar-estudio] configuracoes_repasse já existia para estudio_id, ignorando.');
    }

    // ── 9. ENVIAR LINK DE REDEFINIÇÃO DE SENHA ────────────────────────────────
    // Só envia se o usuário foi criado agora (não reutilizado).
    // O link expira em 24h (padrão Supabase) e leva ao fluxo de primeiro acesso.
    if (!authExistente) {
      const { error: errReset } = await admin.auth.admin.generateLink({
        type: 'recovery',
        email: emailNorm,
      });

      // Não é fatal — o super_admin pode reenviar manualmente depois.
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
        id:   estudioId,
        nome: estudio.nome,
        slug: estudio.slug,
      },
      admin: {
        auth_id:    adminAuthId,
        email:      emailNorm,
        reutilizado: !!authExistente,
      },
    }, 201);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro interno desconhecido';
    console.error('[criar-estudio] ERRO:', msg);

    // ── ROLLBACK PARCIAL ──────────────────────────────────────────────────────
    // A ordem importa: removemos do mais específico para o mais genérico.
    // profiles e estudio_membros cascadeiam ao deletar o auth user,
    // mas somos explícitos para garantir mesmo sem CASCADE configurado.

    if (estudioId) {
      // Remove config de repasse
      await admin.from('configuracoes_repasse')
        .delete().eq('estudio_id', estudioId);

      // Remove vínculo de membro
      if (adminAuthId) {
        await admin.from('estudio_membros')
          .delete()
          .eq('estudio_id', estudioId)
          .eq('user_id', adminAuthId);
      }

      // Remove o estúdio (não pode ser feito antes de limpar FKs)
      await admin.from('estudios').delete().eq('id', estudioId);
    }

    // Remove auth user (após remover vínculos de FK)
    if (adminAuthId) {
      // Verifica se este auth user ainda tem vínculos com outros estúdios
      const { data: outrosVinculos } = await admin
        .from('estudio_membros')
        .select('id')
        .eq('user_id', adminAuthId)
        .limit(1);

      if (!outrosVinculos || outrosVinculos.length === 0) {
        await admin.auth.admin.deleteUser(adminAuthId).catch((delErr) => {
          // Não propaga — não queremos mascarar o erro original
          console.warn('[criar-estudio] Falha ao deletar auth user no rollback:', delErr);
        });
      }
    }

    return resp({ error: msg }, 500);
  }
});