import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { withSentry } from "../_shared/sentry.ts"

// Envia um push "sua aula é amanhã" para os alunos com aula no dia seguinte.
//
// FIX CRÍTICO (auditoria): a versão anterior buscava apenas na tabela
// `presencas`, filtrando por data_aula = amanhã. Isso funciona para
// avulsos/leads (que SEMPRE nascem com uma linha explícita em `presencas`
// no momento do agendamento), mas alunos de matrícula FIXA nunca ganham
// linha em `presencas` antes do dia da aula — só quando o resultado do
// dia é registrado (presente/falta), o que só acontece na hora da chamada,
// não no dia anterior. Na prática, isso fazia o robô nunca notificar a
// maioria dos alunos (os fixos), silenciosamente, sem nenhum erro.
//
// Agora expandimos a grade recorrente (`agenda` + `agenda_fixa`) para o
// dia da semana de amanhã — mesma lógica de calendarioParser.js no
// frontend — e mesclamos com os avulsos/leads vindos de `presencas`.

const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH_SIZE = 100; // limite documentado da Expo Push API

// PED-76: supabase-js infere relações embutidas a partir da string de
// .select() sem um tipo Database gerado — a cardinalidade (objeto único
// vs array) inferida varia por relação, mesmo entre joins com a mesma
// forma (já era o caso de `agenda` abaixo; `matricula.alunos` e
// `ag.alunos` tinham o mesmo risco sem normalização, mascarado só porque
// os parâmetros de montarNotificacao/enviarEmLotes eram `any` implícito).
// Normalizamos em runtime, não só o tipo, porque a ambiguidade é real na
// resposta do PostgREST, não só uma limitação do type-check.
function normalizarUm<T>(relacionado: T | T[] | null): T | null {
  return Array.isArray(relacionado) ? (relacionado[0] ?? null) : relacionado;
}

interface AlunoFixo {
  id: string;
  push_token: string | null;
  nome_completo: string | null;
  data_inicio_plano: string | null;
  data_fim_plano: string | null;
}

interface AlunoAvulso {
  push_token: string | null;
  nome_completo: string | null;
}

interface AgendaInfo {
  atividade: string;
  horario: string;
}

interface ExpoTicket {
  status?: string;
}

function montarNotificacao(
  pushToken: string | null,
  nomeCompleto: string | null,
  atividade: string | null | undefined,
  horario: string | null | undefined,
  nomeEstudio: string,
) {
  if (!pushToken || !nomeCompleto || !atividade || !horario) return null;
  const primeiroNome = nomeCompleto.split(' ')[0];
  return {
    to: pushToken,
    title: `🏋️ Lembrete ${nomeEstudio ?? 'de Aula'}`,
    body: `Olá, ${primeiroNome}! Sua aula de ${atividade} é amanhã às ${horario.slice(0, 5)}. Te esperamos!`,
    sound: 'default',
  };
}

async function enviarEmLotes(
  notificacoes: Array<ReturnType<typeof montarNotificacao>>,
  log: (msg: string) => void,
) {
  let enviados = 0;
  let falhas = 0;

  for (let i = 0; i < notificacoes.length; i += EXPO_BATCH_SIZE) {
    const lote = notificacoes.slice(i, i + EXPO_BATCH_SIZE);
    try {
      const resposta = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(lote),
      });

      if (!resposta.ok) {
        const corpoErro = await resposta.text().catch(() => '');
        log(`❌ Lote ${i / EXPO_BATCH_SIZE + 1} rejeitado pela Expo (HTTP ${resposta.status}): ${corpoErro}`);
        falhas += lote.length;
        continue;
      }

      // A Expo retorna um "ticket" por notificação — nem todo HTTP 200
      // significa que cada mensagem individual foi aceita.
      const corpo = (await resposta.json().catch(() => null)) as { data?: ExpoTicket[] } | null;
      const tickets = corpo?.data ?? [];
      const errosNoLote = tickets.filter((t) => t?.status === 'error').length;
      enviados += lote.length - errosNoLote;
      falhas += errosNoLote;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null
            ? JSON.stringify(err)
            : String(err);
      log(`❌ Falha de rede ao enviar lote ${i / EXPO_BATCH_SIZE + 1}: ${message}`);
      falhas += lote.length;
    }
  }

  return { enviados, falhas };
}

serve(withSentry("lembretes-aula", async (req) => {
  const logs: string[] = [];
  const log = (msg: string) => { console.log(msg); logs.push(msg); };

  try {
    log("🤖 Robô de Lembretes Iniciado!");

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── ISOLAMENTO MULTI-TENANT ────────────────────────────────────────────
    let estudioId: string | null = null;
    try {
      const body = await req.json().catch(() => ({}));
      estudioId = body?.estudioId ?? null;
    } catch {
      // body vazio ou não-JSON
    }
    if (!estudioId) {
      estudioId = Deno.env.get('ESTUDIO_ID') ?? null;
    }
    if (!estudioId) {
      console.error("❌ estudioId não fornecido. Abortando para evitar vazar dados entre estúdios.");
      return new Response(
        JSON.stringify({ error: 'estudioId é obrigatório no payload ou na variável de ambiente ESTUDIO_ID.' }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    // ──────────────────────────────────────────────────────────────────────

    // ── AUTORIZAÇÃO ──────────────────────────────────────────────────────
    // FIX (auditoria): esta função aceitava qualquer estudioId no payload
    // sem validar quem está chamando — com a service role key, isso
    // permitiria a qualquer pessoa com a URL pública forçar o envio de
    // notificações e ler push_token/nome de alunos de qualquer estúdio.
    // Mesmo padrão já usado em gerar-mensalidades: cron autentica via
    // segredo compartilhado em header dedicado; chamada manual exige JWT
    // válido de um admin do estúdio informado.
    const cronSecret = req.headers.get('x-cron-secret') ?? '';
    const expectedCronSecret = Deno.env.get('CRON_SECRET') ?? '';
    const isCronInvocation = expectedCronSecret.length > 0 && cronSecret === expectedCronSecret;

    if (!isCronInvocation) {
      const authHeader = req.headers.get('Authorization') ?? '';
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Não autorizado.' }), {
          status: 401, headers: { "Content-Type": "application/json" },
        });
      }

      const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Não autorizado.' }), {
          status: 401, headers: { "Content-Type": "application/json" },
        });
      }

      const { data: membro } = await supabase
        .from('estudio_membros')
        .select('role')
        .eq('user_id', user.id)
        .eq('estudio_id', estudioId)
        .maybeSingle();
      if (!membro || !['admin', 'super_admin'].includes(membro.role)) {
        return new Response(JSON.stringify({ error: 'Acesso negado.' }), {
          status: 403, headers: { "Content-Type": "application/json" },
        });
      }
    }
    // ──────────────────────────────────────────────────────────────────────

    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    const dataIso = amanha.toISOString().split('T')[0];
    const diaSemanaAmanha = DIAS_SEMANA[amanha.getDay()];
    log(`📅 Buscando aulas para o dia: ${dataIso} (${diaSemanaAmanha}) — estudio_id: ${estudioId}`);

    // Busca o nome do estúdio uma única vez (evita repetir em cada linha).
    const { data: estudio, error: errEstudio } = await supabase
      .from('estudios')
      .select('nome')
      .eq('id', estudioId)
      .single();
    if (errEstudio) throw errEstudio;
    const nomeEstudio = estudio?.nome ?? 'de Aula';

    const notificacoes: Array<ReturnType<typeof montarNotificacao>> = [];

    // ── 1) ALUNOS FIXOS: recorrentes cujo dia da semana bate com amanhã ──
    // (aulas pontuais/data_especifica ficam de fora daqui — são cobertas
    // pelo bloco de avulsos/leads abaixo, pois SEMPRE geram linha em
    // `presencas` no momento do agendamento, independente da origem.)
    const { data: aulasRecorrentes, error: errAulas } = await supabase
      .from('agenda')
      .select('id, atividade, horario')
      .eq('estudio_id', estudioId)
      .eq('ativa', true)
      .eq('eh_recorrente', true)
      .eq('dia_semana', diaSemanaAmanha);
    if (errAulas) throw errAulas;

    if (aulasRecorrentes && aulasRecorrentes.length > 0) {
      const idsAulas = aulasRecorrentes.map((a) => a.id);
      const aulasPorId = new Map(aulasRecorrentes.map((a) => [a.id, a]));

      const { data: matriculasFixas, error: errFixos } = await supabase
        .from('agenda_fixa')
        .select('aula_id, alunos (id, push_token, nome_completo, data_inicio_plano, data_fim_plano)')
        .in('aula_id', idsAulas)
        .returns<Array<{ aula_id: string; alunos: AlunoFixo | AlunoFixo[] | null }>>();
      if (errFixos) throw errFixos;

      // Faltas já registradas para amanhã (ex: professor encerrou a matrícula
      // ou já marcou falta antecipada) não devem gerar lembrete.
      const { data: faltasAntecipadas } = await supabase
        .from('presencas')
        .select('aluno_id, aula_id')
        .eq('estudio_id', estudioId)
        .eq('data_aula', dataIso)
        .eq('origem', 'fixo')
        .in('status', ['falta_justificada', 'falta_nao_avisada']);
      const chavesFalta = new Set((faltasAntecipadas ?? []).map((f) => `${f.aluno_id}-${f.aula_id}`));

      for (const matricula of matriculasFixas ?? []) {
        const aluno = normalizarUm(matricula.alunos);
        if (!aluno) continue;

        // Respeita vigência do plano (não notifica quem já venceu ou ainda não começou).
        if (aluno.data_inicio_plano && dataIso < aluno.data_inicio_plano) continue;
        if (aluno.data_fim_plano && dataIso > aluno.data_fim_plano) continue;

        if (chavesFalta.has(`${aluno.id}-${matricula.aula_id}`)) continue;

        const aula = aulasPorId.get(matricula.aula_id);
        const notif = montarNotificacao(aluno.push_token, aluno.nome_completo, aula?.atividade, aula?.horario, nomeEstudio);
        if (notif) notificacoes.push(notif);
      }
    }

    // ── 2) AVULSOS E LEADS: sempre têm linha explícita em `presencas` ────
    const { data: agendamentosAvulsos, error: errAvulsos } = await supabase
      .from('presencas')
      .select(`
        id,
        origem,
        agenda ( horario, atividade ),
        alunos ( push_token, nome_completo )
      `)
      .eq('estudio_id', estudioId)
      .eq('data_aula', dataIso)
      .neq('origem', 'fixo')
      .in('status', ['agendado', 'presente'])
      .returns<Array<{ id: string; origem: string; agenda: AgendaInfo | AgendaInfo[] | null; alunos: AlunoAvulso | AlunoAvulso[] | null }>>();
    if (errAvulsos) throw errAvulsos;

    for (const ag of agendamentosAvulsos ?? []) {
      const agenda = normalizarUm(ag.agenda);
      const aluno = normalizarUm(ag.alunos);
      if (!aluno || !agenda) continue;
      const notif = montarNotificacao(aluno.push_token, aluno.nome_completo, agenda.atividade, agenda.horario, nomeEstudio);
      if (notif) notificacoes.push(notif);
    }

    if (notificacoes.length === 0) {
      log("😴 Nenhum aluno com push_token para notificar amanhã.");
      return new Response(JSON.stringify({ success: true, enviados: 0, logs }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    log(`🚀 Enviando ${notificacoes.length} notificações em lotes de até ${EXPO_BATCH_SIZE}...`);
    const { enviados, falhas } = await enviarEmLotes(notificacoes, log);
    log(`✅ Concluído: ${enviados} enviados, ${falhas} falharam.`);

    return new Response(JSON.stringify({ success: true, enviados, falhas, logs }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null
          ? JSON.stringify(err)
          : String(err);
    console.error("❌ Erro fatal no robô:", err);
    return new Response(JSON.stringify({ error: message, logs }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}));