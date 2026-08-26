import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { withSentry } from "../_shared/sentry.ts"
import { runInBackground } from "../_shared/backgroundTask.ts"
import { gerarRepassesParaMensalidade } from "../_shared/repasses.ts"
import { enviarPushUnico } from "../_shared/expoPush.ts"

// ─────────────────────────────────────────────────────────────────────────
// webhook-pagamento
//
// Recebe eventos do Asaas (PAYMENT_RECEIVED, PAYMENT_CONFIRMED,
// PAYMENT_OVERDUE, PAYMENT_DELETED/REFUNDED, ...) e sincroniza o status
// real da mensalidade.
//
// PED-14 — três garantias adicionadas nesta versão:
//   1. Idempotência: grava o evento em `webhook_events` com
//      ON CONFLICT DO NOTHING antes de processar. Reentregas do Asaas
//      (que acontecem sempre que a resposta anterior não foi 2xx, ou por
//      retry espontâneo) são identificadas e descartadas sem reprocessar.
//   2. Ordem: compara `asaas_event_timestamp` já salvo na mensalidade
//      contra o timestamp do evento recebido — um evento mais antigo que
//      chega atrasado (reentrega fora de ordem) não pode reverter um
//      status mais recente.
//   3. Ack rápido: responde 200 assim que o estado essencial (status da
//      mensalidade, ativação do aluno) está gravado. Geração de repasse e
//      notificação push acontecem DEPOIS da resposta, via
//      EdgeRuntime.waitUntil (runInBackground) — processamento pesado não
//      compete mais com o prazo de timeout do Asaas.
//
// SEGURANÇA — validação do remetente:
// O Asaas não assina o payload por HMAC como Stripe; a autenticação é
// feita via um "Access Token" definido no painel de configuração do
// webhook, enviado de volta no header `asaas-access-token`. Configure o
// mesmo valor em ASAAS_WEBHOOK_TOKEN (edge function secret) e no painel
// Asaas > Integrações > Webhooks. Sem essa checagem, qualquer request
// externo poderia marcar mensalidades como pagas.
//
// verify_jwt = false é necessário (o Asaas não envia JWT do Supabase);
// a autenticidade da chamada é garantida pelo token acima, não pelo JWT.
// ─────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, asaas-access-token",
}

const EVENTOS_PAGO = new Set(["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"])
const EVENTOS_FALHOU = new Set([
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
  "PAYMENT_REFUNDED",
  "PAYMENT_CHARGEBACK_REQUESTED",
])

serve(withSentry("webhook-pagamento", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }
  if (req.method !== "POST") {
    return response({ erro: "method not allowed" }, 405)
  }

  const expectedToken = Deno.env.get("ASAAS_WEBHOOK_TOKEN") ?? ""
  const receivedToken = req.headers.get("asaas-access-token") ?? ""
  if (!expectedToken || receivedToken !== expectedToken) {
    console.error("[webhook-pagamento] Token de webhook inválido ou ausente.")
    return response({ erro: "Não autorizado." }, 401)
  }

  let payload: {
    event?: string
    dateCreated?: string
    payment?: { id?: string; status?: string; externalReference?: string }
  }
  try {
    payload = await req.json()
  } catch {
    return response({ erro: "Payload inválido." }, 400)
  }

  const evento = payload?.event
  const payment = payload?.payment
  const asaasPaymentId = payment?.id

  if (!evento || !asaasPaymentId) {
    console.warn("[webhook-pagamento] Evento sem payment.id, ignorado:", evento)
    return response({ recebido: true, ignorado: true })
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )

  // ── 1) IDEMPOTÊNCIA ──────────────────────────────────────────────────
  // Insere o evento com ON CONFLICT DO NOTHING (via upsert+ignoreDuplicates).
  // Se `eventoRow` vier vazio, é uma reentrega de um evento já visto — o
  // Asaas reenvia sempre que a resposta anterior não foi 2xx (ou por retry
  // espontâneo), e reprocessar geraria repasse/notificação duplicados.
  const { data: eventoRow, error: eventoErr } = await supabase
    .from("webhook_events")
    .upsert(
      { origem: "asaas", asaas_event: evento, asaas_payment_id: asaasPaymentId, payload },
      { onConflict: "origem,asaas_event,asaas_payment_id", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle()

  if (eventoErr) {
    console.error("[webhook-pagamento] Erro ao gravar webhook_events:", eventoErr)
    return response({ erro: "Erro interno." }, 500)
  }
  if (!eventoRow) {
    console.log("[webhook-pagamento] Evento duplicado (reentrega), ignorando:", evento, asaasPaymentId)
    return response({ recebido: true, duplicado: true })
  }

  // Localiza a mensalidade pelo id externo do gateway — NÃO pelo
  // externalReference (que é só metadado nosso, não garantidamente
  // sincronizado). asaas_payment_id é a fonte de verdade.
  const { data: mensalidade, error: buscaErr } = await supabase
    .from("mensalidades")
    .select("id, estudio_id, aluno_id, status, valor_cobranca, valor_pago, asaas_event_timestamp")
    .eq("asaas_payment_id", asaasPaymentId)
    .maybeSingle()

  if (buscaErr) {
    console.error("[webhook-pagamento] Erro ao buscar mensalidade:", buscaErr)
    return response({ erro: "Erro interno." }, 500)
  }

  if (!mensalidade) {
    console.warn("[webhook-pagamento] Mensalidade não encontrada para payment:", asaasPaymentId)
    return response({ recebido: true, ignorado: true })
  }

  // ── 2) ORDEM ─────────────────────────────────────────────────────────
  // Best-effort: se não conseguirmos ler um timestamp válido do evento,
  // processamos normalmente (nunca bloqueia por causa disso).
  const eventoTimestamp = payload?.dateCreated ? new Date(payload.dateCreated) : null
  const timestampValido = eventoTimestamp && !Number.isNaN(eventoTimestamp.getTime())

  if (timestampValido && mensalidade.asaas_event_timestamp) {
    const timestampAtual = new Date(mensalidade.asaas_event_timestamp)
    if (timestampAtual > eventoTimestamp!) {
      console.warn(
        "[webhook-pagamento] Evento fora de ordem (mais antigo que o último processado), ignorado:",
        evento, asaasPaymentId,
      )
      return response({ recebido: true, fora_de_ordem: true })
    }
  }

  let novoStatus: string | null = null
  if (EVENTOS_PAGO.has(evento)) {
    novoStatus = "pago"
  } else if (EVENTOS_FALHOU.has(evento)) {
    novoStatus = "pendente"
  }

  const updatePayload: Record<string, unknown> = {
    asaas_status: payment?.status ?? evento,
  }
  if (novoStatus) updatePayload.status = novoStatus
  if (timestampValido) updatePayload.asaas_event_timestamp = eventoTimestamp!.toISOString()

  // Quando o pagamento é confirmado via Asaas, precisamos preencher valor_pago
  // (já lido acima, junto com a busca da mensalidade — evita um round-trip extra).
  if (novoStatus === "pago" && mensalidade.valor_pago === null) {
    updatePayload.valor_pago = mensalidade.valor_cobranca
    updatePayload.data_pagamento = new Date().toISOString().split("T")[0]
  }

  const { error: updateErr } = await supabase
    .from("mensalidades")
    .update(updatePayload)
    .eq("id", mensalidade.id)

  if (updateErr) {
    console.error("[webhook-pagamento] Erro ao atualizar mensalidade:", updateErr)
    return response({ erro: "Erro ao atualizar mensalidade." }, 500)
  }

  // Efeito colateral: pagamento confirmado libera o aluno (idempotente) e
  // já traz push_token/nome_completo para a notificação em background,
  // evitando uma query extra depois de responder.
  let alunoParaNotificar: { push_token: string | null; nome_completo: string | null } | null = null

  if (novoStatus === "pago") {
    const { data: alunoAtualizado, error: alunoErr } = await supabase
      .from("alunos")
      .update({ ativo: true })
      .eq("id", mensalidade.aluno_id)
      .eq("estudio_id", mensalidade.estudio_id)
      .select("push_token, nome_completo")
      .maybeSingle()

    if (alunoErr) {
      console.error("[webhook-pagamento] Falha ao reativar aluno:", alunoErr)
    } else {
      alunoParaNotificar = alunoAtualizado
    }
  }

  // ── 3) ACK RÁPIDO ────────────────────────────────────────────────────
  // A partir daqui, tudo que resta é pesado (calcular repasse cruzando
  // várias tabelas, chamar a Expo Push API) — não pode competir com o
  // prazo do Asaas para considerar a entrega bem-sucedida.
  const res = response({ recebido: true, mensalidade_id: mensalidade.id, status: novoStatus ?? "sem_alteracao" })

  if (novoStatus === "pago" && mensalidade.aluno_id) {
    const estudioId = mensalidade.estudio_id
    const mensalidadeId = mensalidade.id
    const primeiroNome = alunoParaNotificar?.nome_completo?.split(" ")[0]

    runInBackground(async () => {
      await gerarRepassesParaMensalidade(supabase, { estudioId, mensalidadeId })

      await enviarPushUnico(
        alunoParaNotificar?.push_token,
        "✅ Pagamento confirmado",
        primeiroNome
          ? `Olá, ${primeiroNome}! Recebemos a confirmação do seu pagamento.`
          : "Recebemos a confirmação do seu pagamento.",
      )
    }, "webhook-pagamento:pos-processamento")
  }

  return res
}))

function response(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}
