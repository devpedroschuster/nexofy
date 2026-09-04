// supabase/functions/health/index.ts
//
// PED-157 — health-check público para monitor de uptime externo (UptimeRobot /
// Better Uptime). Sem autenticação de propósito: o serviço de monitoramento
// não tem como enviar um JWT do Supabase. Não expõe nenhum dado de negócio —
// só confirma que a function roda e que o banco responde.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { withSentry } from '../_shared/sentry.ts';

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

serve(withSentry('health', async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase = createClient(supabaseUrl, supabaseKey);

  // HEAD-only count: confirma que a conexão com o banco está de pé sem
  // trafegar nenhuma linha de dado de negócio.
  const { error } = await supabase
    .from('estudios')
    .select('id', { count: 'exact', head: true });

  if (error) {
    console.error('[health] Banco indisponível:', error.message);
    return response({ status: 'erro', banco: 'indisponivel' }, 503);
  }

  return response({ status: 'ok', timestamp: new Date().toISOString() });
}));
