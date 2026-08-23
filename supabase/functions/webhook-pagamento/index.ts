import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { withSentry } from "../_shared/sentry.ts"

// ─────────────────────────────────────────────────────────────────────────
// webhook-pagamento
//
// Fase 2 — recebe eventos do Asaas (PAYMENT_RECEIVED, PAYMENT_CONFIRMED,
// PAYMENT_OVERDUE, PAYMENT_DELETED/REFUNDED, ...) e sincroniza o status
// real da mensalidade, em vez de depender do preenchimento manual que
// hoje acontece via ModalAdicionarPagamentoManual.
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

// Eventos que representam "pago" — cobrem PIX/boleto/cartão.
const EVENTOS_PAGO = new Set(["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"])
// Eventos que representam falha/estorno — voltam a mensalidade pra pendente
// (não usamos "atrasado" como status persistido: o resto do app deriva
// "atrasado" no frontend a partir de status='pendente' + data_vencimento,
// ver calcularStatusReal em Financeiro.jsx — mantemos essa convenção aqui).
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
    // Log sem vazar o token esperado.
    console.error("[webhook-pagamento] Token de webhook inválido ou ausente.")
    return response({ erro: "Não autorizado." }, 401)
  }

  let payload: {
    event?: string
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
    // Responde 200 mesmo assim — o Asaas reenvia eventos que retornam
    // erro; um evento que não reconhecemos não deve virar retry infinito.
    console.warn("[webhook-pagamento] Evento sem payment.id, ignorado:", evento)
    return response({ recebido: true, ignorado: true })
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )

  // Localiza a mensalidade pelo id externo do gateway — NÃO pelo
  // externalReference (que é só metadado nosso, não garantidamente
  // sincronizado). asaas_payment_id é a fonte de verdade.
  const { data: mensalidade, error: buscaErr } = await supabase
    .from("mensalidades")
    .select("id, estudio_id, aluno_id, status")
    .eq("asaas_payment_id", asaasPaymentId)
    .maybeSingle()

  if (buscaErr) {
    console.error("[webhook-pagamento] Erro ao buscar mensalidade:", buscaErr)
    return response({ erro: "Erro interno." }, 500)
  }

  if (!mensalidade) {
    // Cobrança criada fora do fluxo rastreado (ou de outro ambiente/sandbox).
    // 200 pra não gerar retry — não é um erro nosso.
    console.warn("[webhook-pagamento] Mensalidade não encontrada para payment:", asaasPaymentId)
    return response({ recebido: true, ignorado: true })
  }

  let novoStatus: string | null = null
  if (EVENTOS_PAGO.has(evento)) {
    novoStatus = "pago"
  } else if (EVENTOS_FALHOU.has(evento)) {
    novoStatus = "pendente"
  }

  // Sempre grava o status bruto do Asaas para auditoria/debug, mesmo em
  // eventos que não mapeiam pra pago/pendente (ex: PAYMENT_UPDATED).
  const updatePayload: Record<string, unknown> = {
    asaas_status: payment?.status ?? evento,
  }
  if (novoStatus) updatePayload.status = novoStatus

  // Quando o pagamento é confirmado via Asaas, precisamos preencher valor_pago —
  // até agora essa coluna só era gravada em confirmações manuais
  // (financeiroService.confirmarPagamento), então pagamentos automáticos via
  // Asaas ficavam com valor_pago nulo para sempre, quebrando relatórios
  // financeiros que dependem desse campo (ver criar-cobranca-asaas, que agora
  // grava só valor_cobranca na criação).
  if (novoStatus === "pago") {
    const { data: mensalidadeAtual } = await supabase
      .from("mensalidades")
      .select("valor_cobranca, valor_pago")
      .eq("id", mensalidade.id)
      .single()

    if (mensalidadeAtual && mensalidadeAtual.valor_pago === null) {
      updatePayload.valor_pago = mensalidadeAtual.valor_cobranca
      updatePayload.data_pagamento = new Date().toISOString().split("T")[0]
    }
  }

  const { error: updateErr } = await supabase
    .from("mensalidades")
    .update(updatePayload)
    .eq("id", mensalidade.id)

  if (updateErr) {
    console.error("[webhook-pagamento] Erro ao atualizar mensalidade:", updateErr)
    return response({ erro: "Erro ao atualizar mensalidade." }, 500)
  }

  // Efeito colateral: pagamento confirmado libera o aluno (idempotente —
  // sempre seguro reafirmar ativo=true, mesmo se já estava).
  if (novoStatus === "pago") {
    const { error: alunoErr } = await supabase
      .from("alunos")
      .update({ ativo: true })
      .eq("id", mensalidade.aluno_id)
      .eq("estudio_id", mensalidade.estudio_id)

    if (alunoErr) {
      // Não falha o webhook por isso — o pagamento já foi registrado,
      // que é o fato mais importante. Loga pra investigação manual.
      console.error("[webhook-pagamento] Falha ao reativar aluno:", alunoErr)
    }
  }

  // Fase 3 (bloqueio) já cobre o efeito de "atrasado/falhou" via trigger
  // em `presencas`, que consulta `mensalidades.status` em tempo real —
  // não precisa de nenhuma ação extra aqui além de já ter atualizado o
  // status acima para 'pendente'.

  return response({ recebido: true, mensalidade_id: mensalidade.id, status: novoStatus ?? "sem_alteracao" })
}))

function response(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}