// supabase/functions/exportar-dados-aluno/index.ts
//
// PED-172 (achado de auditoria LGPD): direito de acesso/portabilidade
// (art. 18 V) era 100% manual — só existia a orientação de escrever para
// contato@nexofy.com.br, sem nenhuma rota `/export`/`/download-data`.
//
// Dois chamadores possíveis, mesma function:
//   1. O próprio aluno (self-service, sem `aluno_id` no body — resolvido
//      via `auth.uid()` = `alunos.auth_id`).
//   2. Admin/super_admin do estúdio, tratando manualmente um pedido
//      recebido por outro canal (`aluno_id` no body) — precisa ser
//      admin/super_admin DESTE estúdio específico.
//
// Retorna um JSON estruturado (formato comum, legível por máquina — art.
// 18 V) com os dados do próprio titular: cadastro, campos personalizados
// (rotulados, não só a chave interna), consentimentos, histórico de
// planos, mensalidades e presenças. Nunca inclui dado de OUTRO aluno nem
// segredo interno (ex.: asaas_payment_id/subscription_id).
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry, Sentry } from '../_shared/sentry.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function resp(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(withSentry('exportar-dados-aluno', async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const admin = createClient(supabaseUrl, serviceKey)

  try {
    // AUTENTICAÇÃO
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader.startsWith('Bearer ')) {
      return resp({ error: 'Não autorizado.' }, 401)
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !user) {
      return resp({ error: 'Não autorizado.' }, 401)
    }

    let body: { aluno_id?: number } = {}
    if (req.method === 'POST') {
      body = await req.json().catch(() => ({}))
    }

    // RESOLVE O ALUNO ALVO
    let query = admin.from('alunos').select('*')
    query = body.aluno_id
      ? query.eq('id', body.aluno_id)
      : query.eq('auth_id', user.id)

    const { data: aluno, error: alunoErr } = await query.maybeSingle()
    if (alunoErr) throw alunoErr
    if (!aluno) {
      return resp({ error: 'Aluno não encontrado.' }, 404)
    }

    // AUTORIZAÇÃO — self-service sempre ok (já filtrado por auth_id acima);
    // pedido em nome de outro aluno (aluno_id explícito) exige ser
    // admin/super_admin do MESMO estúdio do aluno.
    const solicitandoParaOutrem = Boolean(body.aluno_id)
    if (solicitandoParaOutrem) {
      const { data: membro, error: membroErr } = await admin
        .from('estudio_membros')
        .select('role')
        .eq('user_id', user.id)
        .eq('estudio_id', aluno.estudio_id)
        .maybeSingle()
      if (membroErr) throw membroErr
      if (!membro || !['admin', 'super_admin'].includes(membro.role)) {
        return resp({ error: 'Acesso negado.' }, 403)
      }
    }

    // BUSCA OS DADOS RELACIONADOS — todas as queries já filtram por
    // aluno.id (bigint interno), nunca por dado que o client tenha
    // enviado sem checagem.
    const [
      { data: consentimentos, error: erroConsent },
      { data: historicoPlanos, error: erroHistorico },
      { data: mensalidades, error: erroMensalidades },
      { data: presencas, error: erroPresencas },
      { data: camposDinamicos, error: erroCampos },
    ] = await Promise.all([
      admin.from('consentimentos_responsavel_legal')
        .select('nome_responsavel, cpf_responsavel, parentesco, aceito_em')
        .eq('aluno_id', aluno.id),
      admin.from('historico_planos')
        .select('*')
        .eq('aluno_id', aluno.id),
      admin.from('mensalidades')
        .select('data_vencimento, data_pagamento, valor_pago, status, metodo_pagamento, forma_pagamento, desconto_aplicado, multa_aplicada, juros_aplicados, tipo_aula, modalidade_nome')
        .eq('aluno_id', aluno.id),
      admin.from('presencas')
        .select('data_aula, status, origem, data_checkin, observacao')
        .eq('aluno_id', aluno.id),
      admin.from('campos_dinamicos')
        .select('field_name, label')
        .eq('estudio_id', aluno.estudio_id)
        .eq('entidade', 'aluno'),
    ])

    if (erroConsent) throw erroConsent
    if (erroHistorico) throw erroHistorico
    if (erroMensalidades) throw erroMensalidades
    if (erroPresencas) throw erroPresencas
    if (erroCampos) throw erroCampos

    // Rotula os campos personalizados (metadata guarda por field_name,
    // uma chave interna — o titular recebe o rótulo legível, não a chave).
    const labelPorFieldName = new Map((camposDinamicos ?? []).map((c) => [c.field_name, c.label]))
    const camposPersonalizados: Record<string, unknown> = {}
    for (const [chave, valor] of Object.entries(aluno.metadata ?? {})) {
      camposPersonalizados[labelPorFieldName.get(chave) ?? chave] = valor
    }

    const exportado = {
      geradoEm: new Date().toISOString(),
      cadastro: {
        nome_completo: aluno.nome_completo,
        email: aluno.email,
        telefone: aluno.telefone,
        cpf: aluno.cpf,
        data_nascimento: aluno.data_nascimento,
        endereco: {
          cep: aluno.cep, rua: aluno.rua, numero: aluno.numero,
          complemento: aluno.complemento, bairro: aluno.bairro, cidade: aluno.cidade,
        },
        contato_emergencia: aluno.contato_emergencia,
        modalidades_selecionadas: aluno.modalidades_selecionadas,
        plano_id: aluno.plano_id,
        data_inicio_plano: aluno.data_inicio_plano,
        data_fim_plano: aluno.data_fim_plano,
        link_anamnese: aluno.link_anamnese,
        observacoes_medicas: aluno.observacoes_medicas,
        criado_em: aluno.created_at,
      },
      camposPersonalizados,
      consentimentosResponsavelLegal: consentimentos ?? [],
      historicoPlanos: historicoPlanos ?? [],
      mensalidades: mensalidades ?? [],
      presencas: presencas ?? [],
    }

    // Trilha (best-effort — falha aqui não pode impedir o titular de
    // receber os dados que já foram buscados com sucesso).
    const { error: erroTrilha } = await admin.from('solicitacoes_titular').insert({
      aluno_id: aluno.id,
      estudio_id: aluno.estudio_id,
      tipo: 'exportacao',
      status: 'atendida',
      solicitado_por: user.id,
      atendido_por: user.id,
      atendido_em: new Date().toISOString(),
    })
    if (erroTrilha) {
      console.error('[exportar-dados-aluno] Falha ao registrar trilha:', erroTrilha)
    }

    return resp({ sucesso: true, dados: exportado })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[exportar-dados-aluno] Erro:', message)
    Sentry.captureException(err, { tags: { edge_function: 'exportar-dados-aluno' } })
    return resp({ error: 'Erro interno.' }, 500)
  }
}))
