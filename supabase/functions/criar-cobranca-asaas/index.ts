import { serve } from "https://deno.land/std/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js"

const ASAAS_API_URL = "https://api.asaas.com/v3" // sandbox: https://sandbox.asaas.com/api/v3
const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY")!

serve(async (req) => {
  const { aluno_id, plano_id, valor, forma_pagamento } = await req.json()

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )

  const { data: aluno, error: alunoErr } = await supabase
    .from("alunos")
    .select("*")
    .eq("id", aluno_id)
    .single()

  if (alunoErr || !aluno) {
    return new Response(JSON.stringify({ error: "Aluno não encontrado" }), { status: 404 })
  }

  // 1. Garante que o aluno tem um customer no Asaas
  let customerId = aluno.asaas_customer_id
  if (!customerId) {
    const customerRes = await fetch(`${ASAAS_API_URL}/customers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "access_token": ASAAS_API_KEY,
      },
      body: JSON.stringify({
        name: aluno.nome,
        email: aluno.email,
        cpfCnpj: aluno.cpf, // obrigatório no Asaas
        phone: aluno.telefone,
      }),
    })
    const customerData = await customerRes.json()
    if (!customerRes.ok) {
      return new Response(JSON.stringify({ error: customerData }), { status: 400 })
    }
    customerId = customerData.id

    await supabase
      .from("alunos")
      .update({ asaas_customer_id: customerId })
      .eq("id", aluno_id)
  }

  // 2. Cria a cobrança
  const paymentBody: Record<string, unknown> = {
    customer: customerId,
    billingType: forma_pagamento ?? "PIX", // PIX | BOLETO | CREDIT_CARD | UNDEFINED
    value: valor,
    dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    description: `Mensalidade - Plano ${plano_id}`,
    externalReference: `mensalidade_${aluno_id}_${plano_id}_${Date.now()}`,
  }

  const paymentRes = await fetch(`${ASAAS_API_URL}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "access_token": ASAAS_API_KEY,
    },
    body: JSON.stringify(paymentBody),
  })
  const paymentData = await paymentRes.json()

  if (!paymentRes.ok) {
    return new Response(JSON.stringify({ error: paymentData }), { status: 400 })
  }

  // 3. Salva referência no Supabase
  const { error: insertErr } = await supabase.from("mensalidades").insert({
    aluno_id,
    plano_id,
    valor,
    asaas_payment_id: paymentData.id,
    asaas_status: paymentData.status,
    link_pagamento: paymentData.invoiceUrl,
    forma_pagamento: paymentBody.billingType,
  })

  if (insertErr) {
    return new Response(JSON.stringify({ error: insertErr.message }), { status: 500 })
  }

  return new Response(
    JSON.stringify({ link_pagamento: paymentData.invoiceUrl, asaas_payment_id: paymentData.id }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  )
})