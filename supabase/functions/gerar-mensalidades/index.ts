import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
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
    const { data: alunos, error: errAlunos } = await supabase
      .from('alunos')
      .select('id, nome_completo, plano_id, planos(id, preco)')
      .eq('estudio_id', estudioId)   // ← isolamento
      .eq('status', 'ativo')
      .not('plano_id', 'is', null)   // ignora alunos sem plano

    if (errAlunos) throw errAlunos
    if (!alunos || alunos.length === 0) {
      return response({ message: 'Nenhum aluno ativo com plano.' })
    }

    // 2. Filtra plano "DEFINIR PLANO" (preco = 0) — não gera cobrança
    const alunosValidos = alunos.filter(a => Number(a.planos?.preco) > 0)

    // 3. Verifica duplicatas: mensalidades já geradas neste mês para este estúdio
    const { data: jaGeradas } = await supabase
      .from('mensalidades')
      .select('aluno_id')
      .eq('estudio_id', estudioId)   // ← isolamento
      .gte('data_vencimento', `${ano}-${mesStr}-01`)
      .lte('data_vencimento', `${ano}-${mesStr}-31`)

    const comMensalidade = new Set((jaGeradas || []).map(m => m.aluno_id))

    // 4. Filtra só quem ainda não tem mensalidade neste mês
    const paraGerar = alunosValidos.filter(a => !comMensalidade.has(a.id))

    if (paraGerar.length === 0) {
      return response({ message: 'Mensalidades já geradas para todos os alunos ativos.' })
    }

    // 5. Monta inserção incluindo estudio_id em cada registro
    const mensalidades = paraGerar.map(aluno => ({
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
    const { data: admins } = await supabase
      .from('profiles')
      .select('id')
      .eq('estudio_id', estudioId)   // ← isolamento
      .eq('role', 'admin')

    if (admins && admins.length > 0) {
      await supabase.from('notificacoes').insert(
        admins.map(admin => ({
          estudio_id: estudioId,     // ← isolamento
          user_id: admin.id,
          tipo: 'cobranca',
          titulo: '💰 Cobranças geradas',
          mensagem: `${paraGerar.length} mensalidade(s) gerada(s) para ${mesLabel}.`,
          lida: false,
        }))
      )
    }

    return response({ sucesso: true, geradas: paraGerar.length, mes: mesLabel, data_vencimento })

  } catch (err) {
    console.error('[gerar-mensalidades] Erro:', err)
    return response({ erro: err.message }, 500)
  }
})

function response(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}