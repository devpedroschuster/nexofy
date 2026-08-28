// supabase/functions/_shared/logger.test.ts
import { assertEquals } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import { createLogger } from "./logger.ts";

function capturarConsole(metodo: "log" | "warn" | "error") {
  const original = console[metodo];
  const chamadas: unknown[][] = [];
  console[metodo] = (...args: unknown[]) => { chamadas.push(args); };
  return {
    chamadas,
    restaurar: () => { console[metodo] = original; },
  };
}

Deno.test("logger.info emite uma linha JSON estruturada via console.log", () => {
  const captura = capturarConsole("log");
  try {
    const logger = createLogger("minha-function", "corr-123");
    logger.info("mensagem de teste");

    assertEquals(captura.chamadas.length, 1);
    const linha = JSON.parse(captura.chamadas[0][0] as string);
    assertEquals(linha.level, "info");
    assertEquals(linha.function, "minha-function");
    assertEquals(linha.correlation_id, "corr-123");
    assertEquals(linha.message, "mensagem de teste");
    assertEquals(typeof linha.timestamp, "string");
    assertEquals(Number.isNaN(Date.parse(linha.timestamp)), false);
  } finally {
    captura.restaurar();
  }
});

Deno.test("logger.warn usa console.warn e logger.error usa console.error, não console.log", () => {
  const capturaLog = capturarConsole("log");
  const capturaWarn = capturarConsole("warn");
  const capturaError = capturarConsole("error");
  try {
    const logger = createLogger("minha-function", "corr-123");
    logger.warn("aviso");
    logger.error("erro");

    assertEquals(capturaLog.chamadas.length, 0);
    assertEquals(capturaWarn.chamadas.length, 1);
    assertEquals(capturaError.chamadas.length, 1);

    assertEquals(JSON.parse(capturaWarn.chamadas[0][0] as string).level, "warn");
    assertEquals(JSON.parse(capturaError.chamadas[0][0] as string).level, "error");
  } finally {
    capturaLog.restaurar();
    capturaWarn.restaurar();
    capturaError.restaurar();
  }
});

Deno.test("logger inclui campos extra (ex: estudio_id) na linha, e omite quando não informados", () => {
  const captura = capturarConsole("log");
  try {
    const logger = createLogger("minha-function", "corr-123");
    logger.info("com estudio", { estudio_id: "est-1", mensalidade_id: "m-1" });
    logger.info("sem estudio");

    const comExtra = JSON.parse(captura.chamadas[0][0] as string);
    assertEquals(comExtra.estudio_id, "est-1");
    assertEquals(comExtra.mensalidade_id, "m-1");

    const semExtra = JSON.parse(captura.chamadas[1][0] as string);
    assertEquals("estudio_id" in semExtra, false);
  } finally {
    captura.restaurar();
  }
});
