import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry, withCronCheckIn, Sentry } from "../_shared/sentry.ts"

// PED-33: precisa bater com o `schedule` do [[cron]] em config.toml.
const CRON_MONITOR_SLUG = 'gerar-mensalidades'
const CRON_SCHEDULE = { crontab: '0 8 1 * *', timezone: 'America/Sao_Paulo' }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Mesmo padrão de interfaces explícitas já usado em
// gerar-repasses-mensais/preview-repasses-mensais — o cliente Supabase não
// infere tipo a partir da string de .select() sem um tipo Database gerado,
// então anotamos manualmente o shape relevante para esta função.
interface AlunoComPlano {
  id: number
  nome_completo: string
  plano_id: number | null
  planos: { id: number; preco: number | string } | null
}

interface MensalidadeExistente {
  aluno_id: string
}

interface MembroAdmin {
  user_id: string
}

interface ResultadoGeracao {
  geradas: number
  mes: string
  data_vencimento: string
  mensagem?: string
}

serve(withSentry("gerar-mensalidades", async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // PED-33: calculado ANTES do parse do body de propósito — se o cron
  // chamar com payload vazio/errado (ex: sem estudioId), isso também
  // precisa contar como falha monitorada, não só exceções não tratadas.
  const cronSecretHeader = req.headers.get('x-cron-secret') ?? ''
  const expectedCronSecretEarly = Deno.env.get('CRON_SECRET') ?? ''
  const isCronInvocation = expectedCronSecretEarly.length > 0 && cronSecretHeader === expectedCronSecretEarly

  if (isCronInvocation) {
    return await withCronCheckIn(CRON_MONITOR_SLUG, CRON_SCHEDULE, () => handleRequest(req))
  }
  return await handleRequest(req)
}))

async function handleRequest(req: Request): Promise<Response> {
  // ISOLAMENTO MULTI-TENANT
  // A service role ignora RLS; todo acesso deve filtrar explicitamente por estudio_id.
  let estudioId: string | null = null
  let mesParam: number | null = null
  let anoParam: number | null = null
  try {
    const body = await req.json().catch(() => ({}))
    estudioId = body?.estudioId ?? null
    mesParam = Number.isInteger(body?.mes) ? body.mes : null
    anoParam = Number.isInteger(body?.ano) ? body.ano : null
  } catch {
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const cronSecret = req.headers.get('x-cron-secret') ?? ''
  const expectedCronSecret = Deno.env.get('CRON_SECRET') ?? ''
  const isCronInvocation = expectedCronSecret.length > 0 && cronSecret === expectedCronSecret

  // PED-68: o payload DEVE conter estudioId para uma chamada manual/admin —
  // isso é o que garante que um admin só gera mensalidades do próprio
  // estúdio (a checagem de role abaixo usa esse mesmo estudioId), nunca de
  // todos de uma vez. Só o cron (autenticado por x-cron-secret) pode disparar
  // o modo "todos os estúdios ativos" — e só quando NÃO manda estudioId
  // nenhum, o que é exatamente o command hoje configurado em config.toml.
  if (!estudioId) {
    if (isCronInvocation) {
      return await handleBatchTodosEstudios(mesParam, anoParam)
    }
    return response({ erro: 'estudioId é obrigatório no payload da requisição.' }, 400)
  }

  if ((mesParam !== null && (mesParam < 1 || mesParam > 12))) {
    return response({ erro: 'mes deve estar entre 1 e 12.' }, 400)
  }
  if (anoParam !== null && (anoParam < 2000 || anoParam > 2100)) {
    return response({ erro: 'ano inválido.' }, 400)
  }

  // AUTORIZAÇÃO
  // verify_jwt = false é necessário para o cron interno (que não envia JWT).
  // Chamadas manuais (vindas do frontend ou de ferramentas externas) DEVEM
  // enviar um header Authorization válido e o usuário precisa ser admin do
  // estúdio informado.
  //
  // IMPORTANTE: "é cron" NUNCA é inferido pela ausência do header
  // Authorization — isso é trivialmente falsificável (um atacante só
  // precisa omitir o header para pular a checagem de admin). A invocação
  // do cron é validada por um segredo compartilhado explícito, enviado em
  // um header dedicado que não colide com Authorization.
  if (!isCronInvocation) {
    if (!authHeader) {
      return response({ erro: 'Não autorizado.' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey    = Deno.env.get('SUPABASE_ANON_KEY')!

    // Valida o token JWT usando o client anon — garante que o user_id
    // pertence a uma sessão real e não foi forjado.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return response({ erro: 'Não autorizado.' }, 401)
    }

    // Confirma que o usuário é admin (ou super_admin) do estúdio solicitado.
    // Usa service-role para esta consulta porque estudio_membros pode ter
    // RLS que bloquearia o anon client — mas o estudio_id já veio validado
    // acima e o resultado só serve para autorizar ou negar.
    const supabaseAdmin = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { data: membro } = await supabaseAdmin
      .from('estudio_membros')
      .select('role')
      .eq('user_id', user.id)
      .eq('estudio_id', estudioId)
      .maybeSingle()

    if (!membro || !['admin', 'super_admin'].includes(membro.role)) {
      return response({ erro: 'Acesso negado.' }, 403)
    }
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const hoje = new Date()
  const ano = anoParam ?? hoje.getFullYear()
  const mes = mesParam ?? (hoje.getMonth() + 1)

  try {
    const resultado = await gerarMensalidadesDoEstudio(supabase, estudioId, ano, mes)
    if (resultado.mensagem) {
      return response({ message: resultado.mensagem })
    }
    return response({
      sucesso: true,
      geradas: resultado.geradas,
      mes: resultado.mes,
      data_vencimento: resultado.data_vencimento,
    })
  } catch (err: unknown) {
    return responseErro(err)
  }
}

// PED-68: modo batch, exclusivo do cron — itera todos os estúdios com
// status='ativo' (mesma definição usada por verificar_status_estudio() /
// estudioBloqueado no frontend) e gera as mensalidades de cada um,
// isoladamente. Uma chamada manual/admin nunca cai aqui: ela sempre exige
// estudioId (ver handleRequest acima), então só processa o próprio estúdio.
async function handleBatchTodosEstudios(mesParam: number | null, anoParam: number | null): Promise<Response> {
  if ((mesParam !== null && (mesParam < 1 || mesParam > 12))) {
    return response({ erro: 'mes deve estar entre 1 e 12.' }, 400)
  }
  if (anoParam !== null && (anoParam < 2000 || anoParam > 2100)) {
    return response({ erro: 'ano inválido.' }, 400)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const hoje = new Date()
  const ano = anoParam ?? hoje.getFullYear()
  const mes = mesParam ?? (hoje.getMonth() + 1)

  const { data: estudios, error: errEstudios } = await supabase
    .from('estudios')
    .select('id')
    .eq('status', 'ativo')
    .returns<{ id: string }[]>()

  // Falha ao sequer listar os estúdios ativos é catastrófica pro lote
  // inteiro — propaga pro catch de withSentry/withCronCheckIn em vez de
  // engolir aqui, pra marcar o check-in do cron como erro de verdade.
  if (errEstudios) throw errEstudios

  const resultados: Array<{ estudioId: string; geradas: number; mensagem?: string; erro?: string }> = []

  for (const estudio of estudios ?? []) {
    try {
      const r = await gerarMensalidadesDoEstudio(supabase, estudio.id, ano, mes)
      resultados.push({ estudioId: estudio.id, geradas: r.geradas, mensagem: r.mensagem })
    } catch (err: unknown) {
      // Um estúdio falhar não pode abortar o lote inteiro pros demais —
      // cada estúdio é isolado (mesmo princípio de ISOLAMENTO MULTI-TENANT
      // do resto da function). Reporta individualmente e segue o lote.
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[gerar-mensalidades] Falha no estúdio ${estudio.id}:`, message)
      Sentry.captureException(err, {
        tags: { edge_function: 'gerar-mensalidades', modo: 'batch', estudio_id: estudio.id },
      })
      resultados.push({ estudioId: estudio.id, geradas: 0, erro: message })
    }
  }

  const totalGeradas = resultados.reduce((soma, r) => soma + r.geradas, 0)
  const falhas = resultados.filter((r) => r.erro).length

  return response({
    sucesso: true,
    modo: 'batch',
    estudiosProcessados: resultados.length,
    totalGeradas,
    falhas,
    resultados,
  })
}

// Núcleo da geração para UM estúdio — usado tanto pela chamada manual/admin
// (um estudioId por vez, via handleRequest) quanto pelo modo batch do cron
// (um estudioId por iteração, via handleBatchTodosEstudios). Lança em caso
// de erro; quem chama decide se isso aborta uma request inteira (caminho
// manual) ou só marca aquele estúdio como falho no lote (caminho batch).
async function gerarMensalidadesDoEstudio(
  supabase: SupabaseClient,
  estudioId: string,
  ano: number,
  mes: number,
): Promise<ResultadoGeracao> {
  const mesStr = String(mes).padStart(2, '0')
  const mesLabel = new Date(ano, mes - 1, 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' })

  // Dia 10 como vencimento padrão
  const data_vencimento = `${ano}-${mesStr}-10`

  // 1. Busca alunos ativos com plano — FILTRADO por estudio_id
  // FIX: a coluna correta é "ativo" (boolean), não "status" (que não
  // existe em alunos — esse nome é usado em mensalidades). Com o filtro
  // errado, esta query sempre retornava 0 alunos, independente do
  // estúdio: a função "funcionava" sem erro, mas nunca gerava nada.
  const { data: alunos, error: errAlunos } = await supabase
    .from('alunos')
    .select('id, nome_completo, plano_id, planos(id, preco)')
    .eq('estudio_id', estudioId)   // ← isolamento
    .eq('ativo', true)
    .not('plano_id', 'is', null)   // ignora alunos sem plano
    .returns<AlunoComPlano[]>()

  if (errAlunos) throw errAlunos
  if (!alunos || alunos.length === 0) {
    return { geradas: 0, mes: mesLabel, data_vencimento, mensagem: 'Nenhum aluno ativo com plano.' }
  }

  // 2. Filtra plano "DEFINIR PLANO" (preco = 0) — não gera cobrança
  const alunosValidos = alunos.filter((a: AlunoComPlano) => Number(a.planos?.preco) > 0)

  // 3. Verifica duplicatas: mensalidades já geradas neste mês para este estúdio
  // FIX: antes comparava strings 'YYYY-MM-DD' com .gte/.lte e um "-31"
  // fixo — funciona por sorte na comparação lexicográfica, mas é frágil
  // (silenciosamente errado se o formato/tipo da coluna mudar). Agora
  // delega a checagem de mês a uma RPC que usa date_trunc no Postgres.
  const { data: jaGeradas, error: errJaGeradas } = await supabase
    .rpc('alunos_com_mensalidade_no_mes', {
      p_estudio_id: estudioId,
      p_data_referencia: data_vencimento, // já é '${ano}-${mesStr}-10', mesmo mês de referência
    })
    .returns<MensalidadeExistente[]>()

  if (errJaGeradas) throw errJaGeradas

  const comMensalidade = new Set((jaGeradas || []).map((m: MensalidadeExistente) => m.aluno_id))

  // 4. Filtra só quem ainda não tem mensalidade neste mês
  const paraGerar = alunosValidos.filter((a: AlunoComPlano) => !comMensalidade.has(a.id))

  if (paraGerar.length === 0) {
    return { geradas: 0, mes: mesLabel, data_vencimento, mensagem: 'Mensalidades já geradas para todos os alunos ativos.' }
  }

  // 5. Monta inserção incluindo estudio_id em cada registro
  // FIX: usa a RPC inserir_mensalidades_regulares_idempotente (PED-16,
  // ver migration fix_inserir_mensalidades_regulares_ordinality) em vez
  // de um insert direto na tabela. Essa RPC foi criada especificamente
  // para esta function (comentário da própria RPC: "Uso restrito à
  // edge function gerar-mensalidades") e resolve dois problemas que um
  // insert direto não resolve:
  //   1. periodo_fim é NOT NULL desde a migration
  //      cobertura_pagamento_periodo — a RPC preenche
  //      periodo_fim=data_vencimento por padrão; um insert direto sem
  //      esse campo falha com 23502 (violação de NOT NULL).
  //   2. ON CONFLICT ... DO NOTHING por linha (não pelo lote inteiro) —
  //      mais seguro contra corrida entre duas chamadas concorrentes
  //      do que o pre-filtro em JS (passo 3-4 acima) sozinho — inclusive
  //      entre a chamada manual de um admin e o lote do cron rodando
  //      por cima do mesmo estúdio no mesmo mês.
  // A segurança do dedup idempotente aqui (índice único parcial da RPC,
  // e a correlação por igualdade de plano_id dentro dela) depende de
  // plano_id nunca ser null neste array — hoje isso é garantido pelo
  // .not('plano_id', 'is', null) na query de `alunos` (passo 1 acima).
  // Se esse filtro for relaxado no futuro, tanto o índice único quanto
  // a correlação por plano_id na RPC ficam NULL-unsafe.
  const mensalidades = paraGerar.map((aluno: AlunoComPlano) => ({
    estudio_id: estudioId,         // ← isolamento: salva o vínculo
    aluno_id: aluno.id,
    plano_id: aluno.plano_id,
    data_vencimento,
    status: 'pendente',
    tipo_aula: 'regular',
    valor_pago: aluno.planos?.preco ?? '0.00',
    desconto_aplicado: 0,
    multa_aplicada: 0,
    juros_aplicados: 0,
  }))

  const { data: resultadoInsercao, error: errInsert } = await supabase
    .rpc('inserir_mensalidades_regulares_idempotente', { p_mensalidades: mensalidades })
    .returns<{ out_aluno_id: number; out_inserida: boolean }[]>()

  if (errInsert) throw errInsert

  const totalInseridas = (resultadoInsercao ?? []).filter((r) => r.out_inserida).length

  // 6. Notifica admins deste estúdio via tabela notificacoes
  // FIX: "profiles" é um sistema de roles paralelo a "estudio_membros" e
  // não é a fonte de verdade usada pelo resto do app — useAuth.js (e
  // toda a auditoria de RLS) confirmam que o frontend lê role/estudio_id
  // de estudio_membros, não de profiles. profiles é populada só pelo
  // fluxo de criar-estudio (validação de super_admin) e pode estar
  // dessincronizada ou simplesmente vazia para membros comuns. Trocado
  // para a fonte real.
  const { data: admins } = await supabase
    .from('estudio_membros')
    .select('user_id')
    .eq('estudio_id', estudioId)   // ← isolamento
    .eq('role', 'admin')
    .returns<MembroAdmin[]>()

  if (totalInseridas > 0 && admins && admins.length > 0) {
    // NOTA: a tabela "notificacoes" não foi encontrada no banco durante
    // a sprint de RLS (ALTER TABLE notificacoes falhou com "relation
    // does not exist" — ver 001_rls_multitenant.sql). Esse INSERT abaixo
    // provavelmente já falha hoje, silenciosamente (sem .error tratado).
    // Confirme se a tabela existe antes de assumir que notificações
    // estão sendo entregues; se não existir, crie a tabela ou remova
    // este bloco até decidir o que fazer com o módulo de notificações.
    const { error: errNotif } = await supabase.from('notificacoes').insert(
      admins.map((admin: MembroAdmin) => ({
        estudio_id: estudioId,     // ← isolamento
        user_id: admin.user_id,
        tipo: 'cobranca',
        titulo: '💰 Cobranças geradas',
        mensagem: `${totalInseridas} mensalidade(s) gerada(s) para ${mesLabel}.`,
        lida: false,
      }))
    )
    if (errNotif) {
      // Não derruba a função por causa de notificação — mensalidades já
      // foram geradas com sucesso no passo 5. Só loga para investigação.
      console.error('[gerar-mensalidades] Falha ao notificar admins:', errNotif)
    }
  }

  return { geradas: totalInseridas, mes: mesLabel, data_vencimento }
}

function responseErro(err: unknown): Response {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null
        ? JSON.stringify(err)
        : String(err)
  console.error('[gerar-mensalidades] Erro:', message)

  // PED-33: este catch responde com um JSON 500 em vez de relançar o
  // erro, então ele nunca "escapava" até o withSentry — o Sentry nunca
  // ficava sabendo que a função falhou. Reportando explicitamente aqui.
  Sentry.captureException(err, { tags: { edge_function: 'gerar-mensalidades' } })

  return response({ erro: message }, 500)
}

function response(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
