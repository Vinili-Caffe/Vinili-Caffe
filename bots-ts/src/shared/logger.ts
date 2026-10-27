export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveLevel(raw: string | undefined): LogLevel {
  const v = String(raw || "info").trim().toLowerCase();
  if (v === "debug" || v === "info" || v === "warn" || v === "error") return v;
  return "info";
}

let minLevel: LogLevel = resolveLevel(process.env.LOG_LEVEL);

export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel];
}

function stamp(): string {
  return new Date().toISOString();
}

export const logger = {
  debug(...args: unknown[]): void {
    if (!shouldLog("debug")) return;
    console.debug(`[${stamp()}] [DEBUG]`, ...args);
  },
  info(...args: unknown[]): void {
    if (!shouldLog("info")) return;
    console.info(`[${stamp()}] [INFO]`, ...args);
  },
  warn(...args: unknown[]): void {
    if (!shouldLog("warn")) return;
    console.warn(`[${stamp()}] [WARN]`, ...args);
  },
  error(...args: unknown[]): void {
    if (!shouldLog("error")) return;
    console.error(`[${stamp()}] [ERROR]`, ...args);
  },
};
