import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // ── ISOLAMENTO MULTI-TENANT ────────────────────────────────────────────────
  // A service role ignora RLS; todo acesso deve filtrar explicitamente por estudio_id.
  // O payload DEVE conter estudioId — chamadas sem ele são rejeitadas.
  let estudioId: string | null = null
  try {
    const body = await req.json().catch(() => ({}))
    estudioId = body?.estudioId ?? null
  } catch {
    // body vazio ou não-JSON
  }

  if (!estudioId) {
    return response({ erro: 'estudioId é obrigatório no payload da requisição.' }, 400)
  }
  // ──────────────────────────────────────────────────────────────────────────

  const hoje = new Date()
  const ano = hoje.getFullYear()
  const mes = hoje.getMonth() + 1
  const mesStr = String(mes).padStart(2, '0')
  const mesLabel = hoje.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })

  // Dia 10 como vencimento padrão
  const data_vencimento = `${ano}-${mesStr}-10`

  try {
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
      return response({ message: 'Nenhum aluno ativo com plano.' })
    }

    // 2. Filtra plano "DEFINIR PLANO" (preco = 0) — não gera cobrança
    const alunosValidos = alunos.filter((a: AlunoComPlano) => Number(a.planos?.preco) > 0)

    // 3. Verifica duplicatas: mensalidades já geradas neste mês para este estúdio
    const { data: jaGeradas } = await supabase
      .from('mensalidades')
      .select('aluno_id')
      .eq('estudio_id', estudioId)   // ← isolamento
      .gte('data_vencimento', `${ano}-${mesStr}-01`)
      .lte('data_vencimento', `${ano}-${mesStr}-31`)
      .returns<MensalidadeExistente[]>()

    const comMensalidade = new Set((jaGeradas || []).map((m: MensalidadeExistente) => m.aluno_id))

    // 4. Filtra só quem ainda não tem mensalidade neste mês
    const paraGerar = alunosValidos.filter((a: AlunoComPlano) => !comMensalidade.has(a.id))

    if (paraGerar.length === 0) {
      return response({ message: 'Mensalidades já geradas para todos os alunos ativos.' })
    }

    // 5. Monta inserção incluindo estudio_id em cada registro
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

    const { error: errInsert } = await supabase
      .from('mensalidades')
      .insert(mensalidades)

    if (errInsert) throw errInsert

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

    if (admins && admins.length > 0) {
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
          mensagem: `${paraGerar.length} mensalidade(s) gerada(s) para ${mesLabel}.`,
          lida: false,
        }))
      )
      if (errNotif) {
        // Não derruba a função por causa de notificação — mensalidades já
        // foram geradas com sucesso no passo 5. Só loga para investigação.
        console.error('[gerar-mensalidades] Falha ao notificar admins:', errNotif)
      }
    }

    return response({ sucesso: true, geradas: paraGerar.length, mes: mesLabel, data_vencimento })

  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null
          ? JSON.stringify(err)
          : String(err)
    console.error('[gerar-mensalidades] Erro:', message)
    return response({ erro: message }, 500)
  }
})

function response(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}