import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry } from "../_shared/sentry.ts";

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

// ASAAS_API_URL deve apontar para sandbox (https://api-sandbox.asaas.com/v3)
// em dev/staging e produção (https://api.asaas.com/v3) em prod. Sem default:
// se o secret faltar, falha fechado (abaixo) em vez de cair no sandbox.
const ASAAS_API_URL = Deno.env.get('ASAAS_API_URL')
const ASAAS_MASTER_API_KEY = Deno.env.get('ASAAS_MASTER_API_KEY') ?? ''

interface DadosAsaas {
  nome_responsavel: string
  email_responsavel: string
  telefone_celular: string
  telefone_fixo: string | null
  cnpj: string
  company_type: string | null
  faturamento_mensal: number
  site: string | null
  cep: string
  endereco: string
  numero: string
  complemento: string | null
  bairro: string
  status_cadastro: string
}

interface Estudio {
  id: string
  nome: string
  asaas_status: string
}

serve(withSentry("criar-subconta-asaas", async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (!ASAAS_API_URL || !ASAAS_MASTER_API_KEY) {
    // Falha de configuração do ambiente, não do chamador — 500, não 400.
    console.error('[criar-subconta-asaas] ASAAS_API_URL ou ASAAS_MASTER_API_KEY não configurada.')
    return response({ erro: 'Integração de pagamentos indisponível no momento.' }, 500)
  }

  // ISOLAMENTO MULTI-TENANT
  let estudioId: string | null = null
  try {
    const body = await req.json().catch(() => ({}))
    estudioId = body?.estudioId ?? null
  } catch {
  }

  if (!estudioId) {
    return response({ erro: 'estudioId é obrigatório no payload da requisição.' }, 400)
  }

  // AUTORIZAÇÃO — ação sensível (cria conta financeira real), sempre exige
  // sessão de admin do próprio estúdio. Diferente de gerar-mensalidades,
  // esta função não tem invocação por cron, então não há bypass de auth.
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

  const supabase = createClient(
    supabaseUrl,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

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
    // 1. Busca estúdio e dados de onboarding — FILTRADO por estudio_id
    const { data: estudio, error: errEstudio } = await supabase
      .from('estudios')
      .select('id, nome, asaas_status')
      .eq('id', estudioId)
      .maybeSingle<Estudio>()

    if (errEstudio) throw errEstudio
    if (!estudio) {
      return response({ erro: 'Estúdio não encontrado.' }, 404)
    }

    if (estudio.asaas_status === 'ativa') {
      return response({ erro: 'Este estúdio já possui uma subconta Asaas ativa.' }, 409)
    }

    const { data: dados, error: errDados } = await supabase
      .from('estudio_dados_asaas')
      .select('*')
      .eq('estudio_id', estudioId)
      .maybeSingle<DadosAsaas>()

    if (errDados) throw errDados
    if (!dados) {
      return response({ erro: 'Preencha os dados de pagamento em Configurações > Pagamentos antes de ativar.' }, 400)
    }

    // 2. Validação de negócio: subconta Asaas só aceita CNPJ (14 dígitos).
    // Reforça no backend a mesma regra explicada na UI — nunca confia só
    // na validação client-side para uma chamada que move dinheiro.
    const documentoLimpo = (dados.cnpj || '').replace(/\D/g, '')
    if (documentoLimpo.length !== 14) {
      return response({
        erro: 'Pagamentos automáticos exigem CNPJ (MEI serve). O documento cadastrado é um CPF ou está incompleto.',
      }, 422)
    }

    const camposObrigatorios: Array<[string, unknown]> = [
      ['nome_responsavel', dados.nome_responsavel],
      ['email_responsavel', dados.email_responsavel],
      ['telefone_celular', dados.telefone_celular],
      ['faturamento_mensal', dados.faturamento_mensal],
      ['cep', dados.cep],
      ['endereco', dados.endereco],
      ['numero', dados.numero],
      ['bairro', dados.bairro],
    ]
    const faltando = camposObrigatorios.filter(([, v]) => !v).map(([k]) => k)
    if (faltando.length > 0) {
      return response({ erro: `Campos obrigatórios ausentes: ${faltando.join(', ')}.` }, 400)
    }

    // 3. Cria a subconta na Asaas (POST /v3/accounts)
    const asaasBody: Record<string, unknown> = {
      name: dados.nome_responsavel,
      email: dados.email_responsavel,
      cpfCnpj: documentoLimpo,
      companyType: dados.company_type || undefined,
      mobilePhone: dados.telefone_celular,
      phone: dados.telefone_fixo || undefined,
      site: dados.site || undefined,
      incomeValue: dados.faturamento_mensal,
      address: dados.endereco,
      addressNumber: dados.numero,
      complement: dados.complemento || undefined,
      province: dados.bairro,
      postalCode: dados.cep,
    }

    const asaasRes = await fetch(`${ASAAS_API_URL}/accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': ASAAS_MASTER_API_KEY,
      },
      body: JSON.stringify(asaasBody),
    })
    const asaasData = await asaasRes.json()

    if (!asaasRes.ok) {
      // Erro da Asaas (dados rejeitados, CEP inválido, etc.) — repassa a
      // mensagem original para o admin conseguir corrigir o cadastro.
      console.error('[criar-subconta-asaas] Erro da Asaas:', asaasData)
      await supabase
        .from('estudio_dados_asaas')
        .update({ status_cadastro: 'rejeitado' })
        .eq('estudio_id', estudioId)

      return response({
        erro: 'A Asaas rejeitou os dados enviados.',
        detalhes: asaasData?.errors ?? asaasData,
      }, 400)
    }

    // 4. Salva referências da subconta no estúdio.
    // IMPORTANTE: asaasData.apiKey só vem nesta resposta — a Asaas não
    // permite consultá-la de novo depois. Se o UPDATE abaixo falhar, a
    // chave se perde e a subconta fica "órfã" do lado do Nexofy (ainda
    // existe na Asaas, mas sem credencial utilizável). Por isso o
    // tratamento de erro deste passo é mais verboso que o padrão.
    const { error: errUpdateEstudio } = await supabase
      .from('estudios')
      .update({
        asaas_account_id: asaasData.id,
        asaas_wallet_id: asaasData.walletId,
        asaas_api_key: asaasData.apiKey,
        asaas_status: 'pendente_aprovacao',
      })
      .eq('id', estudioId)

    if (errUpdateEstudio) {
      console.error(
        '[criar-subconta-asaas] CRÍTICO: subconta criada na Asaas mas falhou ao salvar no Supabase.',
        'asaas_account_id:', asaasData.id,
        'estudio_id:', estudioId,
        errUpdateEstudio,
      )
      return response({
        erro: 'A subconta foi criada na Asaas, mas houve uma falha ao salvar no sistema. Contate o suporte informando o estúdio afetado.',
      }, 500)
    }

    await supabase
      .from('estudio_dados_asaas')
      .update({ status_cadastro: 'enviado', enviado_em: new Date().toISOString() })
      .eq('estudio_id', estudioId)

    return response({
      message: 'Subconta criada com sucesso. Aguardando aprovação da Asaas.',
      asaas_account_id: asaasData.id,
      asaas_status: 'pendente_aprovacao',
    })
  } catch (err) {
    console.error('[criar-subconta-asaas] Erro inesperado:', err)
    return response({ erro: 'Erro inesperado ao criar subconta.' }, 500)
  }
}));