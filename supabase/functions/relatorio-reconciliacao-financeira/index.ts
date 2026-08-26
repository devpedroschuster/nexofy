// supabase/functions/relatorio-reconciliacao-financeira/index.ts
//
// PED-17 — compara mensalidades x asaas_status/asaas_payment_id (já
// sincronizados localmente pelo webhook) x repasses_lancamentos, para
// detectar divergências financeiras antes que o cliente perceba.
//
// Chamada via: supabase.functions.invoke('relatorio-reconciliacao-financeira',
//   { body: { estudioId, mes, ano } })
//
// Mesmo padrão de auth de gerar-repasses: exige JWT de admin/super_admin
// do estúdio-alvo — este relatório expõe dados financeiros completos.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { withSentry } from "../_shared/sentry.ts";
import { detectarDivergencias } from "../_shared/reconciliacao.ts";

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

serve(withSentry("relatorio-reconciliacao-financeira", async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { estudioId, mes, ano } = await req.json();

    if (!estudioId) return response({ error: 'estudioId é obrigatório.' }, 400);
    if (!mes || !ano) return response({ error: 'mes e ano são obrigatórios.' }, 400);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

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

    const mesStr = String(mes).padStart(2, '0');
    const inicio = `${ano}-${mesStr}-01`;
    const ultimoDia = new Date(Number(ano), Number(mes), 0).getDate();
    const fim = `${ano}-${mesStr}-${String(ultimoDia).padStart(2, '0')}`;

    const { data: mensalidades, error: errMens } = await supabase
      .from('mensalidades')
      .select('id, aluno_id, tipo_aula, status, valor_pago, valor_cobranca, asaas_payment_id, asaas_status, data_vencimento')
      .eq('estudio_id', estudioId)
      .gte('data_vencimento', inicio)
      .lte('data_vencimento', fim);

    if (errMens) throw errMens;

    const idsMensalidades = (mensalidades ?? []).map(m => m.id);
    const { data: repasses, error: errRepasses } = idsMensalidades.length === 0
      ? { data: [], error: null }
      : await supabase
          .from('repasses_lancamentos')
          .select('mensalidade_id')
          .eq('estudio_id', estudioId)
          .in('mensalidade_id', idsMensalidades);

    if (errRepasses) throw errRepasses;

    const divergencias = detectarDivergencias(mensalidades ?? [], repasses ?? [], new Date());

    const resumo: Record<string, number> = {};
    for (const d of divergencias) {
      for (const tipo of d.tipos) {
        resumo[tipo] = (resumo[tipo] ?? 0) + 1;
      }
    }

    return response({
      estudioId,
      mes: Number(mes),
      ano: Number(ano),
      totalMensalidades: mensalidades?.length ?? 0,
      totalDivergencias: divergencias.length,
      resumo,
      divergencias,
    });

  } catch (err) {
    const message =
      err instanceof Error ? err.message
      : typeof err === 'object' && err !== null ? JSON.stringify(err)
      : String(err);
    console.error('[relatorio-reconciliacao-financeira] ERRO:', message);
    return response({ error: message }, 500);
  }
}));
