// supabase/functions/gerar-repasses/index.ts
//
// Gera repasses para UMA mensalidade específica ao ser confirmada.
// A lógica de cálculo vive em ../_shared/repasses.ts (PED-14) — reaproveitada
// também pelo webhook-pagamento, que chama gerarRepassesParaMensalidade
// diretamente (sem passar por este endpoint HTTP, que exige JWT de admin).
//
// Chamada via: supabase.functions.invoke('gerar-repasses', { body: { estudioId, mensalidadeId } })

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { withSentry } from "../_shared/sentry.ts";
import { gerarRepassesParaMensalidade } from "../_shared/repasses.ts";
import { createLogger } from "../_shared/logger.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function response(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(withSentry("gerar-repasses", async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const correlationId = crypto.randomUUID();
  const logger = createLogger("gerar-repasses", correlationId);

  let estudioId: string | undefined;
  let mensalidadeId: string | undefined;

  try {
    const body = await req.json();
    estudioId = body.estudioId;
    mensalidadeId = body.mensalidadeId;

    // ISOLAMENTO MULTI-TENANT
    // A service role ignora RLS; todo acesso deve filtrar explicitamente por estudio_id.
    if (!estudioId) {
      return response({ error: 'estudioId é obrigatório no payload.' }, 400);
    }

    if (!mensalidadeId) {
      return response({ error: 'Parâmetro mensalidadeId é obrigatório.' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // AUTENTICAÇÃO
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return response({ error: 'Não autorizado.' }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return response({ error: 'Não autorizado.' }, 401);
    }

    // AUTORIZAÇÃO
    // Só admin/super_admin do estúdio-alvo pode gerar/regerar repasses.
    // Sem isso, qualquer usuário autenticado (professor, aluno) poderia apagar
    // e recriar lançamentos financeiros de outro estúdio.
    const { data: membro, error: membroErr } = await supabase
      .from('estudio_membros')
      .select('role')
      .eq('user_id', user.id)
      .eq('estudio_id', estudioId)
      .maybeSingle();
    if (membroErr) throw membroErr;
    if (!membro || !['admin', 'super_admin'].includes(membro.role)) {
      return response({ error: 'Acesso negado.' }, 403);
    }

    const resultado = await gerarRepassesParaMensalidade(supabase, { estudioId, mensalidadeId });
    logger.info("Repasse processado.", {
      estudio_id: estudioId, mensalidade_id: mensalidadeId, gerados: resultado.gerados, aviso: resultado.aviso,
    });
    return response(resultado);

  } catch (err) {
    const message =
      err instanceof Error ? err.message
      : typeof err === 'object' && err !== null ? JSON.stringify(err)
      : String(err);
    logger.error("Erro ao gerar repasse.", { estudio_id: estudioId, mensalidade_id: mensalidadeId, erro: message });
    // Preserva o 404 que o endpoint sempre retornou para mensalidade
    // inexistente (gerarRepassesParaMensalidade lança um Error genérico —
    // não é um erro de servidor, é um input inválido do chamador).
    const status = message === 'Mensalidade não encontrada.' ? 404 : 500;
    return response({ error: message }, status);
  }
}));
