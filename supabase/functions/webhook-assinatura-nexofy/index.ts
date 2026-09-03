// supabase/functions/webhook-assinatura-nexofy/index.ts
//
// PED-115 — recebe eventos de pagamento de ASSINATURA da Asaas (conta
// master) e converte trial_expirado -> assinatura ativa no primeiro
// pagamento confirmado.
//
// Endpoint e secret PRÓPRIOS, separados do webhook-pagamento existente
// (que resolve tudo por mensalidades.asaas_payment_id — domínio de
// cobrança de aluno — e dispara efeitos colaterais específicos daquele
// domínio, como repasse e reativação de aluno, que não fazem sentido
// aqui). Configurar como um segundo webhook no painel da Asaas.
//
// Diferente do webhook-pagamento, este NÃO precisa de checagem de ordem
// por timestamp: a única transição de estado aqui é 'nenhuma'
// -> 'ativa', uma única vez, guardada pelo próprio check de
// `assinatura_status === 'ativa'` abaixo — não existe caminho de volta
// neste PR (falha de cobrança recorrente pós-ativação é o PED-125).
//
// SEGURANÇA: mesmo esquema do webhook-pagamento — Asaas não assina por
// HMAC, autentica via Access Token configurado no painel, devolvido no
// header `asaas-access-token`. verify_jwt = false necessário (Asaas não
// envia JWT do Supabase).
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry } from '../_shared/sentry.ts'
import { createLogger } from '../_shared/logger.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, asaas-access-token',
}

function response(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const EVENTOS_PAGO = new Set(['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'])

serve(withSentry('webhook-assinatura-nexofy', async (req: Request) => {
  const correlationId = crypto.randomUUID()
  const logger = createLogger('webhook-assinatura-nexofy', correlationId)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return response({ erro: 'method not allowed' }, 405)
  }

  const expectedToken = Deno.env.get('ASAAS_WEBHOOK_TOKEN_NEXOFY') ?? ''
  const receivedToken = req.headers.get('asaas-access-token') ?? ''
  if (!expectedToken || receivedToken !== expectedToken) {
    logger.error('Token de webhook inválido ou ausente.')
    return response({ erro: 'Não autorizado.' }, 401)
  }

  let payload: {
    event?: string
    payment?: { id?: string; subscription?: string; status?: string }
  }
  try {
    payload = await req.json()
  } catch {
    return response({ erro: 'Payload inválido.' }, 400)
  }

  const evento = payload?.event
  const payment = payload?.payment
  const asaasPaymentId = payment?.id
  const subscriptionId = payment?.subscription

  if (!evento || !asaasPaymentId) {
    logger.warn('Evento sem payment.id, ignorado.', { evento })
    return response({ recebido: true, ignorado: true })
  }

  if (!subscriptionId) {
    // Pagamento sem assinatura associada não é do domínio deste webhook
    // (ex.: cobrança avulsa criada direto na conta master, se algum dia
    // existir) — ignora sem erro.
    logger.info('Pagamento sem assinatura associada, ignorado.', { evento, asaas_payment_id: asaasPaymentId })
    return response({ recebido: true, ignorado: true })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── IDEMPOTÊNCIA ─────────────────────────────────────────────────────
  // Mesmo mecanismo do webhook-pagamento: grava o evento com ON CONFLICT
  // DO NOTHING antes de processar. origem='asaas_nexofy' distingue estes
  // eventos dos de mensalidade de aluno (origem='asaas') na mesma tabela.
  const { data: eventoRow, error: eventoErr } = await supabase
    .from('webhook_events')
    .upsert(
      { origem: 'asaas_nexofy', asaas_event: evento, asaas_payment_id: asaasPaymentId, payload },
      { onConflict: 'origem,asaas_event,asaas_payment_id', ignoreDuplicates: true },
    )
    .select('id')
    .maybeSingle()

  if (eventoErr) {
    logger.error('Erro ao gravar webhook_events.', { evento, asaas_payment_id: asaasPaymentId, erro: eventoErr })
    return response({ erro: 'Erro interno.' }, 500)
  }
  if (!eventoRow) {
    logger.info('Evento duplicado (reentrega), ignorando.', { evento, asaas_payment_id: asaasPaymentId })
    return response({ recebido: true, duplicado: true })
  }

  if (!EVENTOS_PAGO.has(evento)) {
    // PAYMENT_OVERDUE/recusa no 1º pagamento: não muda nada — o admin já
    // viu o erro síncrono na criação da assinatura (assinar-plano-nexofy).
    // Falha recorrente pós-ativação é o PED-125.
    return response({ recebido: true, ignorado: true })
  }

  const { data: estudio, error: buscaErr } = await supabase
    .from('estudios')
    .select('id, assinatura_status')
    .eq('asaas_subscription_id', subscriptionId)
    .maybeSingle()

  if (buscaErr) {
    logger.error('Erro ao buscar estúdio pela assinatura.', { subscription_id: subscriptionId, erro: buscaErr })
    return response({ erro: 'Erro interno.' }, 500)
  }

  if (!estudio) {
    logger.warn('Assinatura não encontrada em nenhum estúdio.', { subscription_id: subscriptionId })
    return response({ recebido: true, ignorado: true })
  }

  if (estudio.assinatura_status === 'ativa') {
    return response({ recebido: true, ja_ativa: true })
  }

  const { error: updateErr } = await supabase
    .from('estudios')
    .update({ assinatura_status: 'ativa', trial_ends_at: null })
    .eq('id', estudio.id)

  if (updateErr) {
    logger.error('Erro ao ativar assinatura do estúdio.', { estudio_id: estudio.id, erro: updateErr })
    return response({ erro: 'Erro ao atualizar estúdio.' }, 500)
  }

  logger.info('Assinatura confirmada, trial encerrado.', { estudio_id: estudio.id, subscription_id: subscriptionId })
  return response({ recebido: true, estudio_id: estudio.id, status: 'ativa' })
}))
