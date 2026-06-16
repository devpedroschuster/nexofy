import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  try {
    console.log("🤖 Robô de Lembretes Iniciado!");

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── ISOLAMENTO MULTI-TENANT ────────────────────────────────────────────
    // A service role ignora RLS; todo acesso deve filtrar explicitamente por estudio_id.
    // Este cron pode ser chamado via payload OU via variável de ambiente ESTUDIO_ID
    // (útil quando a função é dedicada a um único estúdio).
    let estudioId: string | null = null;
    try {
      const body = await req.json().catch(() => ({}));
      estudioId = body?.estudioId ?? null;
    } catch {
      // body vazio ou não-JSON
    }

    // Fallback: variável de ambiente (permite deployment por estúdio)
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

    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    const dataIso = amanha.toISOString().split('T')[0];
    console.log(`📅 Buscando aulas para o dia: ${dataIso} (estudio_id: ${estudioId})`);

    const { data: agendamentos, error } = await supabase
      .from('presencas')
      .select(`
        id,
        data_aula,
        agenda ( horario, atividade ),
        alunos ( push_token, nome_completo )
      `)
      .eq('estudio_id', estudioId)       // ← isolamento
      .eq('data_aula', dataIso);

    if (error) throw error;

    if (!agendamentos || agendamentos.length === 0) {
      console.log("😴 Nenhuma aula agendada para amanhã.");
      return new Response(JSON.stringify({ message: "Nenhuma aula para amanhã" }), { status: 200 });
    }

    const notificacoes = [];

    for (const ag of agendamentos) {
      if (ag.alunos?.push_token) {
        const primeiroNome = ag.alunos.nome_completo.split(' ')[0];
        const horario = ag.agenda.horario.substring(0, 5);

        notificacoes.push({
          to: ag.alunos.push_token,
          title: '🏋️ Lembrete Iluminus',
          body: `Olá, ${primeiroNome}! Sua aula de ${ag.agenda.atividade} é amanhã às ${horario}. Te esperamos!`,
          sound: 'default'
        });
      }
    }

    if (notificacoes.length > 0) {
      console.log(`🚀 Enviando ${notificacoes.length} notificações...`);
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(notificacoes),
      });
    }

    return new Response(JSON.stringify({ success: true, enviados: notificacoes.length }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("❌ Erro fatal no robô:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
})