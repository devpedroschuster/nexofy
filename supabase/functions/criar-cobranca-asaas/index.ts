import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry } from "../_shared/sentry.ts"

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

// Sem default de sandbox: se o secret faltar, falha fechado (abaixo) em
// vez de cair silenciosamente no sandbox.
//
// PED-140: cobrança do aluno sai da mesma conta Asaas MASTER usada em
// criar-subconta-asaas/assinar-plano-nexofy (conta única, sem subcontas
// dedicadas por estúdio) — antes existia um ASAAS_API_KEY separado só
// pra esta function, mas era a MESMA credencial em duplicidade: bastava
// esquecer de configurar um dos dois secrets pra cair no fail-closed.
const ASAAS_API_URL = Deno.env.get('ASAAS_API_URL')
const ASAAS_MASTER_API_KEY = Deno.env.get('ASAAS_MASTER_API_KEY')

interface Body {
  aluno_id: number
  plano_id?: number | null
  valor: number
  forma_pagamento?: string
  tipo_cobranca: 'mensalidade' | 'avulso'
  mes_referencia?: string        // 'YYYY-MM' — obrigatório para tipo_cobranca=mensalidade
  cobre_periodo_completo?: boolean // true = pagamento único cobre os duracao_meses do plano
  descricao?: string
  idempotency_key?: string
}

// Espelha financeiroService.calcularPeriodoFim (frontend) — mantidas em sincronia manual,
// já que a edge function roda em runtime Deno e não importa o arquivo JS do app.
function calcularPeriodoFim(dataVencimento: string, cobrePeriodoCompleto: boolean, duracaoMeses: number | null): string {
  if (!cobrePeriodoCompleto || !duracaoMeses || duracaoMeses <= 1) return dataVencimento
  const d = new Date(dataVencimento + 'T12:00:00')
  d.setMonth(d.getMonth() + (duracaoMeses - 1))
  return d.toISOString().split('T')[0]
}

function primeiroDiaProximoMes(mesReferencia: string): string {
  const [ano, mes] = mesReferencia.split('-').map(Number)
  const d = new Date(ano, mes, 1) // mes já é 1-indexed aqui por causa do +1 implícito do Date
  return d.toISOString().split('T')[0]
}

serve(withSentry("criar-cobranca-asaas", async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  if (!ASAAS_API_URL || !ASAAS_MASTER_API_KEY) {
    // Falha de configuração do ambiente, não do chamador — 500, não 400.
    console.error('[criar-cobranca-asaas] ASAAS_API_URL ou ASAAS_MASTER_API_KEY não configurada.')
    return response({ erro: 'Integração de pagamentos indisponível no momento.' }, 500)
  }

  const body = (await req.json().catch(() => ({}))) as Partial<Body>
  const {
    aluno_id, plano_id, valor, forma_pagamento, tipo_cobranca,
    mes_referencia, descricao,
  } = body
  const cobrePeriodoCompleto = body.cobre_periodo_completo ?? false

  if (!aluno_id || !valor || !tipo_cobranca) {
    return response({ erro: 'aluno_id, valor e tipo_cobranca são obrigatórios.' }, 400)
  }
  if (!['mensalidade', 'avulso'].includes(tipo_cobranca)) {
    return response({ erro: "tipo_cobranca deve ser 'mensalidade' ou 'avulso'." }, 400)
  }
  if (tipo_cobranca === 'mensalidade' && (!plano_id || !mes_referencia)) {
    // mes_referencia é sempre necessário aqui, mesmo com idempotency_key vinda do frontend —
    // é o que a function usa para localizar a pendência que o cron já criou.
    return response({ erro: 'plano_id e mes_referencia são obrigatórios para tipo_cobranca=mensalidade.' }, 400)
  }

  // AUTENTICAÇÃO — ação move dinheiro real
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return response({ erro: 'Não autorizado.' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return response({ erro: 'Não autorizado.' }, 401)

  const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // 1. Busca aluno
  const { data: aluno, error: alunoErr } = await supabase
    .from('alunos')
    .select('id, nome, email, cpf, telefone, asaas_customer_id, estudio_id')
    .eq('id', aluno_id)
    .maybeSingle()

  if (alunoErr || !aluno) return response({ erro: 'Aluno não encontrado.' }, 404)

  // ISOLAMENTO MULTI-TENANT
  const { data: membro } = await supabase
    .from('estudio_membros')
    .select('role')
    .eq('user_id', user.id)
    .eq('estudio_id', aluno.estudio_id)
    .maybeSingle()

  if (!membro || !['admin', 'super_admin'].includes(membro.role)) {
    return response({ erro: 'Acesso negado.' }, 403)
  }

  // 2. Se for mensalidade, busca duracao_meses do plano (necessário pro periodo_fim)
  let duracaoMeses: number | null = null
  if (tipo_cobranca === 'mensalidade') {
    const { data: plano } = await supabase
      .from('planos')
      .select('duracao_meses')
      .eq('id', plano_id)
      .maybeSingle()
    duracaoMeses = plano?.duracao_meses ?? 1
  }

  // 3. Localiza a pendência já existente (criada pelo cron) para mensalidade — não se
  // aplica a avulso, que nunca tem linha prévia.
  let mensalidadeAlvo: { id: number; data_vencimento: string; asaas_payment_id: string | null; link_pagamento: string | null } | null = null

  if (tipo_cobranca === 'mensalidade') {
    const inicioMes = `${mes_referencia}-01`
    const inicioProxMes = primeiroDiaProximoMes(mes_referencia!)

    const { data: pendencia } = await supabase
      .from('mensalidades')
      .select('id, data_vencimento, asaas_payment_id, link_pagamento')
      .eq('aluno_id', aluno_id)
      .eq('plano_id', plano_id)
      .eq('estudio_id', aluno.estudio_id)
      .eq('status', 'pendente')
      .gte('data_vencimento', inicioMes)
      .lt('data_vencimento', inicioProxMes)
      .maybeSingle()

    mensalidadeAlvo = pendencia ?? null
  }

  // 4. IDEMPOTÊNCIA — se já existe cobrança Asaas nessa linha (seja porque o
  // idempotency_key bateu, seja porque a própria pendência já tem asaas_payment_id
  // de uma tentativa anterior bem-sucedida), reaproveita e não gera nada novo.
  if (mensalidadeAlvo?.asaas_payment_id && mensalidadeAlvo.link_pagamento) {
    return response({
      link_pagamento: mensalidadeAlvo.link_pagamento,
      asaas_payment_id: mensalidadeAlvo.asaas_payment_id,
      reaproveitada: true,
    })
  }

  const idempotencyKey =
    body.idempotency_key
    ?? (tipo_cobranca === 'mensalidade'
          ? `mensalidade_${aluno_id}_${plano_id}_${mes_referencia}`
          : (() => {
              const hoje = new Date().toISOString().slice(0, 10)
              const descNormalizada = (descricao ?? 'avulso').trim().toLowerCase().replace(/\s+/g, '_')
              return `avulso_${aluno_id}_${descNormalizada}_${hoje}`
            })())

  if (!body.idempotency_key) {
    console.warn('[criar-cobranca-asaas] idempotency_key não enviada, usando fallback derivado.')
  }

  if (tipo_cobranca === 'avulso') {
    // Para avulso não há "linha alvo" prévia — a checagem de idempotência é só pela key.
    const { data: existente } = await supabase
      .from('mensalidades')
      .select('id, link_pagamento, asaas_payment_id')
      .eq('idempotency_key', idempotencyKey)
      .eq('status', 'pendente')
      .maybeSingle()

    if (existente) {
      return response({
        link_pagamento: existente.link_pagamento,
        asaas_payment_id: existente.asaas_payment_id,
        reaproveitada: true,
      })
    }
  }

  // 5. Garante customer na Asaas — UPDATE condicional evita corrida de duplo-clique
  let customerId = aluno.asaas_customer_id
  if (!customerId) {
    const customerRes = await fetch(`${ASAAS_API_URL}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'access_token': ASAAS_MASTER_API_KEY },
      body: JSON.stringify({
        name: aluno.nome, email: aluno.email, cpfCnpj: aluno.cpf, phone: aluno.telefone,
      }),
    })
    const customerData = await customerRes.json()
    if (!customerRes.ok) return response({ erro: customerData }, 400)
    customerId = customerData.id

    const { data: updated } = await supabase
      .from('alunos')
      .update({ asaas_customer_id: customerId })
      .eq('id', aluno_id)
      .is('asaas_customer_id', null)
      .select('asaas_customer_id')
      .maybeSingle()

    if (!updated) {
      const { data: alunoAtual } = await supabase
        .from('alunos').select('asaas_customer_id').eq('id', aluno_id).single()
      customerId = alunoAtual!.asaas_customer_id
    }
  }

  // 6. Define a data de vencimento e o período de cobertura da mensalidade
  //    — usa a data já existente da pendência (dia fixo do cron, ex: dia 10),
  //    ou hoje, se for cobrança nova (aluno pagando na matrícula, antes do cron rodar).
  const dataVencimentoMensalidade = mensalidadeAlvo?.data_vencimento
    ?? new Date().toISOString().split('T')[0]

  const periodoFim = tipo_cobranca === 'mensalidade'
    ? calcularPeriodoFim(dataVencimentoMensalidade, cobrePeriodoCompleto, duracaoMeses)
    : dataVencimentoMensalidade // avulso: sem período, igual à própria data (coluna é NOT NULL)

  // 7. Cria a cobrança na Asaas — dueDate do boleto/pix (prazo de pagamento do link),
  //    independente da data_vencimento "de calendário" da mensalidade
  const paymentBody: Record<string, unknown> = {
    customer: customerId,
    billingType: forma_pagamento ?? 'PIX',
    value: valor,
    dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    description: descricao ?? (tipo_cobranca === 'mensalidade' ? `Mensalidade - Plano ${plano_id}` : 'Cobrança avulsa'),
    externalReference: idempotencyKey,
  }

  const paymentRes = await fetch(`${ASAAS_API_URL}/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'access_token': ASAAS_MASTER_API_KEY },
    body: JSON.stringify(paymentBody),
  })
  const paymentData = await paymentRes.json()
  if (!paymentRes.ok) return response({ erro: paymentData }, 400)

    const camposAsaas = {
    asaas_payment_id: paymentData.id,
    asaas_status: paymentData.status,
    link_pagamento: paymentData.invoiceUrl,
    forma_pagamento: paymentBody.billingType,
    idempotency_key: idempotencyKey,
    periodo_fim: periodoFim,
  }

  if (mensalidadeAlvo) {
    // 8a. UPDATE — anexa dados Asaas + valor_cobranca na pendência que o cron já criou.
    // valor_cobranca é gravado aqui (cobrança emitida); valor_pago só é preenchido
    // pelo webhook-pagamento quando o Asaas confirmar o pagamento de fato.
    const { data: atualizado, error: updateErr } = await supabase
      .from('mensalidades')
      .update({ ...camposAsaas, valor_cobranca: valor })
      .eq('id', mensalidadeAlvo.id)
      .is('asaas_payment_id', null)
      .select('id, link_pagamento, asaas_payment_id')
      .maybeSingle()

    if (updateErr) return response({ erro: updateErr.message }, 500)

    if (!atualizado) {
      const { data: linhaAtual } = await supabase
        .from('mensalidades')
        .select('link_pagamento, asaas_payment_id')
        .eq('id', mensalidadeAlvo.id)
        .single()
      return response({
        link_pagamento: linhaAtual!.link_pagamento,
        asaas_payment_id: linhaAtual!.asaas_payment_id,
        reaproveitada: true,
      })
    }

    return response({ link_pagamento: atualizado.link_pagamento, asaas_payment_id: atualizado.asaas_payment_id })
  }

  // 8b. INSERT — não existia pendência prévia (aluno novo pagando antes do cron, ou avulso)
  const { error: insertErr } = await supabase.from('mensalidades').insert({
    aluno_id,
    plano_id: plano_id ?? null,
    valor_cobranca: valor,
    estudio_id: aluno.estudio_id,
    tipo_cobranca,
    descricao: descricao ?? null,
    status: 'pendente',
    data_vencimento: dataVencimentoMensalidade,
    ...camposAsaas,
  })

  if (insertErr) {
    if (insertErr.code === '23505') {
      return response({ erro: 'Cobrança já em processamento para essa combinação.' }, 409)
    }
    return response({ erro: insertErr.message }, 500)
  }

  return response({ link_pagamento: paymentData.invoiceUrl, asaas_payment_id: paymentData.id })
}))