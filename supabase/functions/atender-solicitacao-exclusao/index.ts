// supabase/functions/atender-solicitacao-exclusao/index.ts
//
// PED-261 (LGPD art. 18 VI): atender um pedido de exclusão do titular
// ANONIMIZA o aluno de fato — antes, "Marcar como atendida" só mudava o
// status em solicitacoes_titular sem eliminar dado nenhum.
//
// Duas etapas, mesmo desenho do expurgo-retencao-lgpd:
//   1. RPC atender_solicitacao_exclusao chamada COM O JWT do admin — é ela
//      que autoriza (admin do estúdio atual), valida (pedido pendente, sem
//      mensalidade em aberto) e anonimiza + marca atendida numa transação.
//   2. Depois do commit, com service role: remove os arquivos de Storage
//      (avatar/anamnese) e a conta auth.users do aluno, se ela não tiver
//      mais nenhum vínculo. Best-effort — não é transacional com o Postgres,
//      e falha aqui não desfaz a anonimização que já aconteceu (fica
//      registrada no Sentry para limpeza manual).
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry, Sentry } from '../_shared/sentry.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ArquivoStorage {
  bucket: string
  path: string
}

interface ResultadoAnonimizacao {
  aluno_id: number
  arquivos_storage_a_remover: ArquivoStorage[]
  auth_id_a_remover: string | null
}

// Erros levantados pela RPC já vêm com mensagem de negócio em português;
// o SQLSTATE decide o status HTTP.
const STATUS_POR_SQLSTATE: Record<string, number> = {
  '42501': 403,
  P0002: 404,
  P0001: 409,
}

function resp(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(withSentry('atender-solicitacao-exclusao', async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return resp({ error: 'Método não permitido.' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return resp({ error: 'Não autorizado.' }, 401)
  }

  const body = await req.json().catch(() => ({})) as { solicitacao_id?: string; observacao?: string }
  if (!body.solicitacao_id) {
    return resp({ error: 'solicitacao_id é obrigatório.' }, 400)
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data, error } = await userClient.rpc('atender_solicitacao_exclusao', {
    p_solicitacao_id: body.solicitacao_id,
    p_observacao: body.observacao ?? null,
  })

  if (error) {
    const status = STATUS_POR_SQLSTATE[error.code ?? '']
    if (status) {
      return resp({ error: error.message }, status)
    }
    throw error
  }

  const resultado = data as ResultadoAnonimizacao
  const admin = createClient(supabaseUrl, serviceKey)

  let arquivosRemovidos = 0
  for (const arquivo of resultado.arquivos_storage_a_remover ?? []) {
    const { error: erroStorage } = await admin.storage.from(arquivo.bucket).remove([arquivo.path])
    if (erroStorage) {
      console.error('[atender-solicitacao-exclusao] Falha ao remover arquivo:', arquivo.bucket, erroStorage.message)
      Sentry.captureException(erroStorage, {
        tags: { edge_function: 'atender-solicitacao-exclusao', etapa: 'storage' },
        extra: { aluno_id: resultado.aluno_id, bucket: arquivo.bucket },
      })
    } else {
      arquivosRemovidos++
    }
  }

  let contaRemovida = false
  if (resultado.auth_id_a_remover) {
    const { error: erroAuth } = await admin.auth.admin.deleteUser(resultado.auth_id_a_remover)
    if (erroAuth) {
      console.error('[atender-solicitacao-exclusao] Falha ao remover conta:', erroAuth.message)
      Sentry.captureException(erroAuth, {
        tags: { edge_function: 'atender-solicitacao-exclusao', etapa: 'auth' },
        extra: { aluno_id: resultado.aluno_id, auth_id: resultado.auth_id_a_remover },
      })
    } else {
      contaRemovida = true
    }
  }

  if (arquivosRemovidos < (resultado.arquivos_storage_a_remover ?? []).length
      || (resultado.auth_id_a_remover && !contaRemovida)) {
    await Sentry.flush(2000).catch(() => {})
  }

  return resp({
    sucesso: true,
    arquivosRemovidos,
    contaRemovida,
  })
}))
