// _shared/sentry.ts
//
// Helper de observabilidade para Edge Functions (Deno / Supabase).
// Cada função é um processo curto: se não fizermos `flush` antes de
// responder, o evento pode nunca ser enviado (o runtime pode ser
// congelado/encerrado logo após o `return`). Por isso o padrão aqui é
// sempre: captureException -> await flush -> devolve resposta de erro.
//
// Configuração necessária (Supabase > Project Settings > Edge Functions > Secrets,
// ou `supabase secrets set SENTRY_DSN=...`):
//   SENTRY_DSN         - DSN do projeto Sentry (obrigatório para reportar)
//   SENTRY_ENVIRONMENT - opcional, ex: "production" | "staging" (default: "production")

import * as Sentry from "npm:@sentry/deno@8";

const dsn = Deno.env.get("SENTRY_DSN");

if (dsn) {
  Sentry.init({
    dsn,
    environment: Deno.env.get("SENTRY_ENVIRONMENT") ?? "production",
    tracesSampleRate: 0, // performance tracing desligado por padrão (free tier)
  });
} else {
  // Não derruba a função por falta de DSN — só loga uma vez que o
  // monitoramento está desativado, útil em dev local.
  console.warn("[sentry] SENTRY_DSN não configurado — erros não serão reportados.");
}

/**
 * Envolve o handler de uma edge function: captura qualquer exceção não
 * tratada, reporta ao Sentry (com flush garantido) e devolve uma
 * resposta 500 padronizada, evitando que cada função reimplemente esse
 * try/catch manualmente.
 *
 * Uso:
 *   serve(withSentry("nome-da-funcao", async (req) => { ... }))
 */
export function withSentry(
  functionName: string,
  handler: (req: Request) => Promise<Response> | Response,
) {
  return async (req: Request): Promise<Response> => {
    try {
      return await handler(req);
    } catch (error) {
      console.error(`[${functionName}] Erro não tratado:`, error);

      Sentry.captureException(error, {
        tags: { edge_function: functionName },
        extra: { url: req.url, method: req.method },
      });

      // Garante o envio antes do processo poder ser encerrado.
      await Sentry.flush(2000).catch(() => {});

      return new Response(
        JSON.stringify({ erro: "Erro interno no servidor." }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  };
}

/**
 * PED-33 — observabilidade de crons (gerar-mensalidades / gerar-repasses-mensais).
 *
 * Envolve a execução de um job disparado por agendamento (pg_cron / Supabase
 * Cron) com "check-in" do Sentry Crons: reporta início (`in_progress`) e, ao
 * final, sucesso (`ok`) ou falha (`error`) para o monitor `monitorSlug`.
 *
 * Isso cobre os dois cenários pedidos no ticket:
 *   - a função RODOU mas falhou (exceção, ou respondeu com status >= 400)
 *     → check-in "error", Sentry cria/atualiza uma issue pro monitor.
 *   - a função NÃO RODOU no dia/horário esperado (cron desabilitado,
 *     secret errado, function derrubada, etc.) → nenhum check-in chega,
 *     e o Sentry detecta a ausência sozinho a partir do `schedule` abaixo
 *     — não depende de nenhum código rodando pra perceber isso.
 *
 * Os alertas em si (e-mail / Slack / Discord) são configurados no Sentry,
 * não no código: Project Settings > Crons > <monitorSlug> para o e-mail
 * padrão, ou Alerts > Create Alert Rule > "Issues" filtrando por
 * `monitor.slug equals <monitorSlug>` e escolhendo a integração de
 * Slack/Discord (webhook) como destino. Ver supabase/functions/CRON_MONITORING.md.
 *
 * IMPORTANTE: `schedule` aqui é só o que o Sentry usa para saber QUANDO
 * esperar o check-in — precisa ser mantido em sincronia manual com o
 * `schedule` do `[[cron]]` no `config.toml` da function (não há como
 * derivar um do outro em runtime).
 */
export async function withCronCheckIn<T extends Response>(
  monitorSlug: string,
  schedule: { crontab: string; timezone?: string },
  fn: () => Promise<T>,
): Promise<T> {
  const checkInId = Sentry.captureCheckIn(
    { monitorSlug, status: "in_progress" },
    {
      schedule: { type: "crontab", value: schedule.crontab },
      timezone: schedule.timezone ?? "America/Sao_Paulo",
      // Tolerância antes de marcar como atrasado/perdido, e runtime máximo
      // antes de marcar como travado — generosos porque essas functions
      // fazem várias queries sequenciais por estúdio.
      checkinMargin: 15,
      maxRuntime: 10,
    },
  );

  try {
    const result = await fn();

    Sentry.captureCheckIn({
      checkInId,
      monitorSlug,
      // Qualquer resposta que não seja 2xx conta como falha do job pro
      // monitor, mesmo sem exceção lançada — cobre os `return response(...)`
      // de erro que essas functions usam em vez de `throw`.
      status: result.ok ? "ok" : "error",
    });

    return result;
  } catch (error) {
    Sentry.captureCheckIn({ checkInId, monitorSlug, status: "error" });
    throw error;
  } finally {
    // Mesmo motivo do withSentry: processo pode ser encerrado logo após o
    // retorno, então o flush precisa acontecer antes daqui, não depois.
    await Sentry.flush(2000).catch(() => {});
  }
}

export { Sentry };