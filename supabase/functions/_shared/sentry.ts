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

export { Sentry };