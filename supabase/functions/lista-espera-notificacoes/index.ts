import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { withSentry } from "../_shared/sentry.ts"

// Roda periodicamente (pg_cron, ver RUNBOOK.md — mesmo padrão de
// lembretes-aula): 1) notifica quem acabou de ser promovido da lista de
// espera (status='convertido' e ainda não notificado) e 2) expira entradas
// 'aguardando' de turmas cuja data já passou (limpeza).

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH_SIZE = 100;

interface AlunoInfo {
  push_token: string | null;
  nome_completo: string | null;
}

interface AgendaInfo {
  atividade: string;
  horario: string;
}

interface EntradaConvertida {
  id: number;
  aluno_id: number;
  alunos: AlunoInfo | AlunoInfo[] | null;
  agenda: AgendaInfo | AgendaInfo[] | null;
}

function normalizarUm<T>(relacionado: T | T[] | null): T | null {
  return Array.isArray(relacionado) ? (relacionado[0] ?? null) : relacionado;
}

function montarNotificacao(
  pushToken: string | null,
  nomeCompleto: string | null,
  atividade: string | null,
  horario: string | null,
  nomeEstudio: string,
) {
  if (!pushToken || !nomeCompleto || !atividade || !horario) return null;
  const primeiroNome = nomeCompleto.split(' ')[0];
  return {
    to: pushToken,
    title: `🎉 Vaga liberada — ${nomeEstudio}`,
    body: `${primeiroNome}, uma vaga abriu e você já está agendado(a) para ${atividade} às ${horario.slice(0, 5)}! Não pode ir? Cancele pelo app.`,
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

      const corpo = (await resposta.json().catch(() => null)) as { data?: Array<{ status?: string }> } | null;
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

serve(withSentry("lista-espera-notificacoes", async (req) => {
  const logs: string[] = [];
  const log = (msg: string) => { console.log(msg); logs.push(msg); };

  try {
    log("🤖 Robô de notificações da lista de espera iniciado!");

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
    // Mesmo padrão de lembretes-aula/gerar-mensalidades: cron autentica via
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

    const { data: estudio, error: errEstudio } = await supabase
      .from('estudios')
      .select('nome')
      .eq('id', estudioId)
      .single();
    if (errEstudio) throw errEstudio;
    const nomeEstudio = estudio?.nome ?? 'seu estúdio';

    // ── 1) NOTIFICAR PROMOÇÕES PENDENTES ────────────────────────────────
    const { data: convertidas, error: errConvertidas } = await supabase
      .from('lista_espera')
      .select('id, aluno_id, alunos(push_token, nome_completo), agenda(atividade, horario)')
      .eq('estudio_id', estudioId)
      .eq('status', 'convertido')
      .is('notificado_em', null)
      .returns<EntradaConvertida[]>();
    if (errConvertidas) throw errConvertidas;

    const notificacoes: Array<ReturnType<typeof montarNotificacao>> = [];
    const idsParaMarcar: number[] = [];

    for (const entrada of convertidas ?? []) {
      const aluno = normalizarUm(entrada.alunos);
      const agenda = normalizarUm(entrada.agenda);
      const notif = montarNotificacao(
        aluno?.push_token ?? null,
        aluno?.nome_completo ?? null,
        agenda?.atividade ?? null,
        agenda?.horario ?? null,
        nomeEstudio,
      );
      if (notif) notificacoes.push(notif);
      idsParaMarcar.push(entrada.id);
    }

    let enviados = 0;
    let falhas = 0;
    if (notificacoes.length > 0) {
      log(`🚀 Enviando ${notificacoes.length} notificações de promoção em lotes de até ${EXPO_BATCH_SIZE}...`);
      ({ enviados, falhas } = await enviarEmLotes(notificacoes, log));
    } else {
      log("😴 Nenhuma promoção pendente de notificação.");
    }

    if (idsParaMarcar.length > 0) {
      const { error: errMarcar } = await supabase
        .from('lista_espera')
        .update({ notificado_em: new Date().toISOString() })
        .in('id', idsParaMarcar);
      if (errMarcar) throw errMarcar;
    }

    // ── 2) EXPIRAR FILAS DE TURMAS CUJA DATA JÁ PASSOU ──────────────────
    const { error: errExpirar, count: expiradas } = await supabase
      .from('lista_espera')
      .update({ status: 'expirado', motivo_saida: 'data_passada' }, { count: 'exact' })
      .eq('estudio_id', estudioId)
      .eq('status', 'aguardando')
      .lt('data_aula', new Date().toISOString().split('T')[0]);
    if (errExpirar) throw errExpirar;

    log(`✅ Concluído: ${enviados} notificados, ${falhas} falharam, ${expiradas ?? 0} entradas expiradas por data passada.`);

    return new Response(JSON.stringify({ success: true, enviados, falhas, expiradas: expiradas ?? 0, logs }), {
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
