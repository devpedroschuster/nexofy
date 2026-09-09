// supabase/functions/expurgo-retencao-lgpd/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry, withCronCheckIn, Sentry } from "../_shared/sentry.ts"
import { createLogger } from "../_shared/logger.ts"
import { dataCorteEstudiosCancelados, dataCorteWebhookEvents } from "./retencao.ts"

// PED-176: precisa bater com o `schedule` do [[cron]] em config.toml.
const CRON_MONITOR_SLUG = 'retencao-lgpd-mensal'
const CRON_SCHEDULE = { crontab: '0 5 1 * *', timezone: 'America/Sao_Paulo' }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EstudioCandidato {
  id: string
}

interface ArquivoStorage {
  bucket: string
  path: string
}

interface ResultadoAnonimizacao {
  skipped: boolean
  alunos_anonimizados?: number
  professores_anonimizados?: number
  mensalidades_anonimizadas?: number
  fechamentos_anonimizados?: number
  leads_removidos?: number
  arquivos_storage_a_remover?: ArquivoStorage[]
  auth_ids_a_remover?: string[]
}

serve(withSentry("expurgo-retencao-lgpd", async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Sem caminho de admin/JWT nesta function de propósito (diferente de
  // gerar-mensalidades): não existe hoje nenhum gatilho manual pelo
  // frontend pra expurgo/anonimização — só o cron. Único jeito de chamar,
  // inclusive pra dry-run, é com o mesmo x-cron-secret já usado pelas
  // outras functions agendadas.
  const cronSecretHeader = req.headers.get('x-cron-secret') ?? ''
  const expectedCronSecret = Deno.env.get('CRON_SECRET') ?? ''
  if (expectedCronSecret.length === 0 || cronSecretHeader !== expectedCronSecret) {
    return response({ erro: 'Não autorizado.' }, 401)
  }

  return await withCronCheckIn(CRON_MONITOR_SLUG, CRON_SCHEDULE, () => handleRequest(req))
}))

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const dryRun = url.searchParams.get('dryRun') === 'true'
  const correlationId = crypto.randomUUID()
  const logger = createLogger('expurgo-retencao-lgpd', correlationId)

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const agora = new Date()
    const corteEstudios = dataCorteEstudiosCancelados(agora)
    const corteWebhook = dataCorteWebhookEvents(agora)

    // Stream A — estúdios cancelados há mais de 5 anos, ainda não anonimizados.
    const { data: candidatos, error: errCandidatos } = await supabase
      .from('estudios')
      .select('id')
      .eq('status', 'cancelado')
      .lt('cancelado_em', corteEstudios)
      .is('anonimizado_em', null)
      .returns<EstudioCandidato[]>()

    if (errCandidatos) throw errCandidatos

    const resultadosEstudios: Array<{ estudioId: string; erro?: string } & ResultadoAnonimizacao> = []
    let arquivosStorageRemovidos = 0
    let arquivosStorageFalhas = 0
    let authIdsRemovidos = 0
    let authIdsFalhas = 0

    if (!dryRun) {
      for (const estudio of candidatos ?? []) {
        try {
          const { data, error } = await supabase.rpc('anonimizar_dados_estudio_cancelado', {
            p_estudio_id: estudio.id,
            p_data_corte: corteEstudios,
          })
          if (error) throw error
          const resultado = data as ResultadoAnonimizacao
          resultadosEstudios.push({ estudioId: estudio.id, ...resultado })

          // PED-182 — limpeza de Storage roda best-effort DEPOIS do commit
          // da anonimização no banco: não é transacional com o Postgres, e
          // um arquivo que falhe ao remover (já apagado, path inválido)
          // não pode reverter nem travar a anonimização do estúdio, que já
          // aconteceu. Cada bucket é removido separadamente (a API do
          // Storage não aceita paths de buckets diferentes numa chamada só).
          for (const arquivo of resultado.arquivos_storage_a_remover ?? []) {
            const { error: erroStorage } = await supabase.storage
              .from(arquivo.bucket)
              .remove([arquivo.path])
            if (erroStorage) {
              arquivosStorageFalhas++
              logger.error('Falha ao remover arquivo do Storage', {
                estudio_id: estudio.id, bucket: arquivo.bucket, path: arquivo.path, erro: erroStorage.message,
              })
            } else {
              arquivosStorageRemovidos++
            }
          }

          // PED-181 — apagar a conta auth.users só depois de confirmado que
          // ela não tem NENHUM vínculo ativo em outro estúdio (a RPC já fez
          // essa checagem). Usa a Admin API (não DELETE SQL direto): é o
          // único jeito de limpar corretamente sessions/refresh_tokens/
          // identities internos do GoTrue junto com a conta.
          for (const authId of resultado.auth_ids_a_remover ?? []) {
            const { error: erroAuth } = await supabase.auth.admin.deleteUser(authId)
            if (erroAuth) {
              authIdsFalhas++
              logger.error('Falha ao apagar conta auth.users órfã', {
                estudio_id: estudio.id, auth_id: authId, erro: erroAuth.message,
              })
            } else {
              authIdsRemovidos++
            }
          }
        } catch (err: unknown) {
          // Mesmo princípio de isolamento do gerar-mensalidades: um
          // estúdio falhar não pode travar o lote inteiro pros demais.
          const message = err instanceof Error ? err.message : String(err)
          logger.error('Falha ao anonimizar estúdio', { estudio_id: estudio.id, erro: message })
          Sentry.captureException(err, {
            tags: { edge_function: 'expurgo-retencao-lgpd', estudio_id: estudio.id },
          })
          resultadosEstudios.push({ estudioId: estudio.id, skipped: false, erro: message })
        }
      }
    }

    // Stream B — payload de webhook_events com mais de 12 meses.
    const { count: webhookElegiveis, error: errContagemWebhook } = await supabase
      .from('webhook_events')
      .select('id', { count: 'exact', head: true })
      .not('payload', 'is', null)
      .lt('recebido_em', corteWebhook)

    if (errContagemWebhook) throw errContagemWebhook

    let webhookEventsExpurgados = 0
    if (!dryRun) {
      const { data: totalExpurgado, error: errExpurgo } = await supabase
        .rpc('expurgar_webhook_events_antigos', { p_data_corte: corteWebhook })
      if (errExpurgo) throw errExpurgo
      webhookEventsExpurgados = (totalExpurgado ?? 0) as number
    }

    const falhas = resultadosEstudios.filter((r) => r.erro).length

    logger.info('Execução concluída', {
      dry_run: dryRun,
      corte_estudios: corteEstudios,
      corte_webhook: corteWebhook,
      estudios_candidatos: candidatos?.length ?? 0,
      estudios_falhas: falhas,
      webhook_events_elegiveis: webhookElegiveis ?? 0,
      webhook_events_expurgados: webhookEventsExpurgados,
      arquivos_storage_removidos: arquivosStorageRemovidos,
      arquivos_storage_falhas: arquivosStorageFalhas,
      auth_ids_removidos: authIdsRemovidos,
      auth_ids_falhas: authIdsFalhas,
    })

    return response({
      sucesso: true,
      dryRun,
      corteEstudios,
      corteWebhook,
      estudios: {
        candidatos: candidatos?.length ?? 0,
        processados: resultadosEstudios.length,
        falhas,
        detalhes: resultadosEstudios,
      },
      webhookEvents: {
        elegiveis: webhookElegiveis ?? 0,
        expurgados: webhookEventsExpurgados,
      },
      storage: {
        arquivosRemovidos: arquivosStorageRemovidos,
        arquivosFalhas: arquivosStorageFalhas,
      },
      authUsers: {
        removidos: authIdsRemovidos,
        falhas: authIdsFalhas,
      },
    })
  } catch (err: unknown) {
    return responseErro(err, logger)
  }
}

function responseErro(err: unknown, logger: ReturnType<typeof createLogger>): Response {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null
        ? JSON.stringify(err)
        : String(err)
  logger.error('Erro não tratado', { erro: message })

  Sentry.captureException(err, { tags: { edge_function: 'expurgo-retencao-lgpd' } })

  return response({ erro: message }, 500)
}

function response(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
