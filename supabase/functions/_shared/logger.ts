// _shared/logger.ts
//
// PED-32 — logs estruturados para Edge Functions.
// Cada linha é um único JSON (via console.log/warn/error, conforme o nível)
// carregando function + correlation_id em toda execução, para permitir
// rastrear todos os logs de uma chamada específica (ou de um cliente, via
// estudio_id) no explorador de logs do Supabase.
//
// Uso:
//   const logger = createLogger("webhook-pagamento", crypto.randomUUID());
//   logger.info("Evento recebido", { estudio_id: mensalidade.estudio_id });

type Nivel = "info" | "warn" | "error";

export interface Logger {
  info(message: string, extra?: Record<string, unknown>): void;
  warn(message: string, extra?: Record<string, unknown>): void;
  error(message: string, extra?: Record<string, unknown>): void;
}

const CONSOLE_POR_NIVEL: Record<Nivel, (...args: unknown[]) => void> = {
  info: (...args) => console.log(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
};

export function createLogger(functionName: string, correlationId: string): Logger {
  function emitir(level: Nivel, message: string, extra?: Record<string, unknown>) {
    const linha = {
      level,
      function: functionName,
      correlation_id: correlationId,
      message,
      ...extra,
      timestamp: new Date().toISOString(),
    };
    CONSOLE_POR_NIVEL[level](JSON.stringify(linha));
  }

  return {
    info: (message, extra) => emitir("info", message, extra),
    warn: (message, extra) => emitir("warn", message, extra),
    error: (message, extra) => emitir("error", message, extra),
  };
}
