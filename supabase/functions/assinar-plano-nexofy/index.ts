// supabase/functions/assinar-plano-nexofy/index.ts
//
// PED-115 — cria a assinatura recorrente de um estúdio na Asaas MASTER
// (a mesma conta que cria subcontas em criar-subconta-asaas — aqui o
// estúdio é o customer, não o dono de subconta). A Asaas não tem SDK de
// tokenização client-side (diferente de Stripe.js): o cartão trafega em
// texto pela requisição até aqui, via HTTPS, e é repassado na mesma
// chamada pra Asaas — nunca é logado nem persistido em nenhuma tabela.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry } from '../_shared/sentry.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function response(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const ASAAS_API_URL = Deno.env.get('ASAAS_API_URL') ?? 'https://api-sandbox.asaas.com/v3'
const ASAAS_MASTER_API_KEY = Deno.env.get('ASAAS_MASTER_API_KEY') ?? ''

// Espelha webapp/src/lib/planosNexofy.js — mantido em sincronia manual,
// mesmo motivo do calcularPeriodoFim em criar-cobranca-asaas/index.ts
// (edge function roda em runtime Deno, não importa o arquivo JS do app).
const PRECOS_NEXOFY: Record<string, number> = {
  essencial: 129,
  profissional: 249,
}

function resolverValor(plano: string, ciclo: string): number | null {
  const valorMensal = PRECOS_NEXOFY[plano]
  if (!valorMensal) return null
  if (ciclo === 'mensal') return valorMensal
  if (ciclo === 'anual') return valorMensal * 10
  return null
}

function obterRemoteIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  return xff ? xff.split(',')[0].trim() : '0.0.0.0'
}

interface Cartao {
  holderName: string
  number: string
  expiryMonth: string
  expiryYear: string
  ccv: string
}

interface Titular {
  name: string
  email: string
  cpfCnpj: string
  postalCode: string
  addressNumber: string
  phone: string
}

interface Body {
  estudioId: string
  plano: string
  ciclo: string
  cartao: Cartao
  titular: Titular
}

serve(withSentry('assinar-plano-nexofy', async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (!ASAAS_MASTER_API_KEY) {
    console.error('[assinar-plano-nexofy] ASAAS_MASTER_API_KEY não configurada.')
    return response({ erro: 'Integração de pagamentos indisponível no momento.' }, 500)
  }

  const body = (await req.json().catch(() => ({}))) as Partial<Body>
  const { estudioId, plano, ciclo, cartao, titular } = body

  if (!estudioId || !plano || !ciclo || !cartao || !titular) {
    return response({ erro: 'estudioId, plano, ciclo, cartao e titular são obrigatórios.' }, 400)
  }

  const valor = resolverValor(plano, ciclo)
  if (valor === null) {
    return response({ erro: 'Plano ou ciclo inválido.' }, 400)
  }

  // AUTORIZAÇÃO — ação sensível (move dinheiro real), exige sessão de
  // admin do próprio estúdio, igual criar-subconta-asaas.
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) {
    return response({ erro: 'Não autorizado.' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) {
    return response({ erro: 'Não autorizado.' }, 401)
  }

  const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: membro } = await supabase
    .from('estudio_membros')
    .select('role')
    .eq('user_id', user.id)
    .eq('estudio_id', estudioId)
    .maybeSingle()

  if (!membro || !['admin', 'super_admin'].includes(membro.role)) {
    return response({ erro: 'Acesso negado.' }, 403)
  }

  try {
    const { data: estudio, error: errEstudio } = await supabase
      .from('estudios')
      .select('id, assinatura_status, asaas_customer_id_nexofy')
      .eq('id', estudioId)
      .maybeSingle()

    if (errEstudio) throw errEstudio
    if (!estudio) {
      return response({ erro: 'Estúdio não encontrado.' }, 404)
    }

    if (estudio.assinatura_status === 'ativa') {
      return response({ erro: 'Este estúdio já possui uma assinatura ativa.' }, 409)
    }

    // 1. Garante customer na Asaas MASTER — diferente da subconta do
    // estúdio (asaas_account_id), que é pra ele cobrar os próprios alunos.
    let customerId: string | null = estudio.asaas_customer_id_nexofy
    if (!customerId) {
      const customerRes = await fetch(`${ASAAS_API_URL}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'access_token': ASAAS_MASTER_API_KEY },
        body: JSON.stringify({
          name: titular.name,
          email: titular.email,
          cpfCnpj: titular.cpfCnpj,
          postalCode: titular.postalCode,
          addressNumber: titular.addressNumber,
          phone: titular.phone,
        }),
      })
      const customerData = await customerRes.json()
      if (!customerRes.ok) {
        console.error('[assinar-plano-nexofy] Erro ao criar customer na Asaas:', customerData?.errors ?? customerData)
        return response({
          erro: 'Não foi possível validar os dados informados.',
          detalhes: customerData?.errors,
        }, 400)
      }
      customerId = customerData.id
    }

    // 2. Cria a assinatura recorrente com cartão de crédito — a Asaas
    // aceita creditCard/creditCardHolderInfo direto neste mesmo request,
    // sem precisar de um passo de tokenização separado antes.
    const nextDueDate = new Date().toISOString().split('T')[0]
    const subscriptionRes = await fetch(`${ASAAS_API_URL}/subscriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'access_token': ASAAS_MASTER_API_KEY },
      body: JSON.stringify({
        customer: customerId,
        billingType: 'CREDIT_CARD',
        cycle: ciclo === 'anual' ? 'YEARLY' : 'MONTHLY',
        value: valor,
        nextDueDate,
        creditCard: cartao,
        creditCardHolderInfo: titular,
        remoteIp: obterRemoteIp(req),
        externalReference: `nexofy_plano_${estudioId}`,
      }),
    })
    const subscriptionData = await subscriptionRes.json()

    if (!subscriptionRes.ok) {
      // Não loga o corpo inteiro (pode ecoar campos de cartão de volta) —
      // só o array de erros estruturado que a Asaas devolve.
      console.error('[assinar-plano-nexofy] Assinatura recusada pela Asaas:', subscriptionData?.errors)
      return response({
        erro: 'Não foi possível processar o pagamento com este cartão.',
        detalhes: subscriptionData?.errors,
      }, 422)
    }

    // 3. Salva os identificadores. assinatura_status só vira 'ativa' no
    // webhook (webhook-assinatura-nexofy), quando o 1º pagamento é de
    // fato confirmado — a criação da assinatura em si não garante isso.
    const { error: errUpdate } = await supabase
      .from('estudios')
      .update({
        plano_nexofy: plano,
        ciclo_cobranca: ciclo,
        asaas_customer_id_nexofy: customerId,
        asaas_subscription_id: subscriptionData.id,
      })
      .eq('id', estudioId)

    if (errUpdate) {
      console.error(
        '[assinar-plano-nexofy] CRÍTICO: assinatura criada na Asaas mas falhou ao salvar no Supabase.',
        'asaas_subscription_id:', subscriptionData.id, 'estudio_id:', estudioId, errUpdate,
      )
      return response({
        erro: 'A assinatura foi criada, mas houve uma falha ao salvar no sistema. Contate o suporte informando o estúdio afetado.',
      }, 500)
    }

    return response({
      mensagem: 'Assinatura criada. Confirmando o pagamento…',
      asaas_subscription_id: subscriptionData.id,
    })
  } catch (err) {
    console.error('[assinar-plano-nexofy] Erro inesperado:', err)
    return response({ erro: 'Erro inesperado ao processar assinatura.' }, 500)
  }
}))
