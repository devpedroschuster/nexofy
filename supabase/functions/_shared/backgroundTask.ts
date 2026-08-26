// supabase/functions/_shared/backgroundTask.ts
//
// PED-14: wrapper para EdgeRuntime.waitUntil — permite que uma edge function
// responda ao cliente e continue processando depois, sem que o runtime
// congele o isolate antes da task terminar. Usado pelo webhook-pagamento
// para gerar repasse + notificar fora do "hot path" da resposta HTTP.
//
// EdgeRuntime é um global específico do runtime do Supabase Edge Functions
// (não existe em `deno test` nem em outros ambientes Deno) — por isso o
// acesso é via globalThis com fallback seguro, e o teste substitui esse
// global através de __setEdgeRuntimeForTest.

import { Sentry } from "./sentry.ts";

interface EdgeRuntimeLike {
  waitUntil(promise: Promise<unknown>): void;
}

let edgeRuntimeOverride: EdgeRuntimeLike | undefined;

/** Só para uso em testes — substitui o EdgeRuntime global. */
export function __setEdgeRuntimeForTest(mock: EdgeRuntimeLike | undefined) {
  edgeRuntimeOverride = mock;
}

function getEdgeRuntime(): EdgeRuntimeLike | undefined {
  if (edgeRuntimeOverride) return edgeRuntimeOverride;
  // deno-lint-ignore no-explicit-any
  return (globalThis as any).EdgeRuntime;
}

/**
 * Executa `task` sem bloquear quem chamou, garantindo que o runtime não
 * mate o isolate antes dela terminar (via EdgeRuntime.waitUntil quando
 * disponível). Erros são capturados e reportados ao Sentry — nunca
 * propagam para o chamador.
 */
export function runInBackground(task: () => Promise<void>, label: string): void {
  const promise = task().catch(async (err) => {
    console.error(`[background:${label}] Falhou:`, err);
    Sentry.captureException(err, { tags: { background_task: label } });
    await Sentry.flush(2000).catch(() => {});
  });

  const rt = getEdgeRuntime();
  if (rt?.waitUntil) {
    rt.waitUntil(promise);
  } else {
    console.warn(`[background:${label}] EdgeRuntime.waitUntil indisponível — task roda sem garantia de conclusão antes do processo encerrar (normal em ambiente de teste/local).`);
  }
}
