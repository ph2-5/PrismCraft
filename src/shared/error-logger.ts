import { AppError } from "../domain/types/result";
import { eventBus } from "./event-bus";

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export interface ErrorLogEntry {
  level: LogLevel;
  error: AppError;
  context?: string;
  timestamp: number;
}

export const ErrorEvents = {
  LOGGED: "error:logged",
} as const;

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

let minLogLevel: LogLevel = "warn";

const API_KEY_PATTERNS = [
  /(?:api[_-]?key|apikey|access[_-]?token|secret[_-]?key|auth[_-]?token|bearer)\s*[:=]\s*["']?[\w\-]{8,}/gi,
  /sk-[a-zA-Z0-9]{20,}/g,
  /key-[a-zA-Z0-9]{20,}/g,
];

function sanitizeMessage(msg: string): string {
  let result = msg;
  for (const pattern of API_KEY_PATTERNS) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}

export function setMinLogLevel(level: LogLevel): void {
  minLogLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[minLogLevel];
}

function createEntry(level: LogLevel, error: AppError, context?: string): ErrorLogEntry {
  return {
    level,
    error,
    context,
    timestamp: Date.now(),
  };
}

function hasMessage(e: unknown): e is { message: unknown } {
  return typeof e === "object" && e !== null && "message" in e;
}

function hasName(e: unknown): e is { name: unknown } {
  return typeof e === "object" && e !== null && "name" in e;
}

export function extractErrorMessage(error: unknown): string {
  if (error === undefined || error === null) return "Unknown error";
  if (typeof error === "string") return error || "Unknown error";
  if (error instanceof Error) return error.message || error.name || "Unknown error";
  if (typeof error === "object" && error !== null) {
    if (hasMessage(error)) {
      const msg = error.message;
      if (typeof msg === "string" && msg.trim().length > 0) return msg;
    }
    if (hasName(error)) {
      const name = error.name;
      if (typeof name === "string" && name.trim().length > 0) return name;
    }
    try {
      const json = JSON.stringify(error);
      if (json !== "{}") return json;
    } catch { /* ignore */ }
  }
  return String(error) || "Unknown error";
}

function toAppError(error: AppError | string | { code: string; message: string; cause?: unknown }): AppError {
  if (error instanceof AppError) return error;
  if (typeof error === "string") return new AppError("LOG", error);
  return new AppError(error.code, error.message, error.cause);
}

function toContext(context: unknown): string | undefined {
  if (context === undefined || context === null) return undefined;
  if (typeof context === "string") return context;
  if (context instanceof Error) {
    const parts: string[] = [];
    if (context.message) parts.push(context.message);
    if (context.name && context.name !== "Error") parts.push(`(${context.name})`);
    if (context.stack && parts.length === 0) {
      const firstLine = context.stack.split("\n")[0];
      if (firstLine) parts.push(firstLine);
    }
    return parts.length > 0 ? parts.join(" ") : String(context);
  }
  try {
    const json = JSON.stringify(context);
    if (json !== "{}") return json;
    const entries = Object.entries(context as Record<string, unknown>)
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(", ");
    return entries || String(context);
  } catch {
    return String(context);
  }
}

function outputEntry(entry: ErrorLogEntry): void {
  const { level, error, context, timestamp } = entry;
  const prefix = context ? `[${context}]` : "";
  const time = new Date(timestamp).toISOString();
  const sanitizedMessage = sanitizeMessage(error.message);
  const formatted = `${time} [${level.toUpperCase()}] ${prefix} [${error.code}] ${sanitizedMessage}`;

  if (level === "debug") {
    console.debug(formatted, error.cause ?? "");
  } else if (level === "info") {
    console.info(formatted, error.cause ?? "");
  } else if (level === "warn") {
    console.warn(formatted, error.cause ?? "");
  } else {
    console.error(formatted, error.cause ?? "");
  }
}

function log(level: LogLevel, error: AppError | string | { code: string; message: string; cause?: unknown }, context?: unknown): void {
  if (!shouldLog(level)) return;
  const appError = toAppError(error);
  const entry = createEntry(level, appError, toContext(context));
  outputEntry(entry);
  eventBus.emit(ErrorEvents.LOGGED, entry);
}

export const errorLogger = {
  debug(error: AppError | string | { code: string; message: string; cause?: unknown }, context?: unknown): void {
    log("debug", error, context);
  },

  info(error: AppError | string | { code: string; message: string; cause?: unknown }, context?: unknown): void {
    log("info", error, context);
  },

  warn(error: AppError | string | { code: string; message: string; cause?: unknown }, context?: unknown): void {
    log("warn", error, context);
  },

  error(error: AppError | string | { code: string; message: string; cause?: unknown }, context?: unknown): void {
    log("error", error, context);
  },

  fatal(error: AppError | string | { code: string; message: string; cause?: unknown }, context?: unknown): void {
    log("fatal", error, context);
  },
} as const;

let globalErrorHandlersInstalled = false;

export function installGlobalErrorHandlers(): void {
  if (globalErrorHandlersInstalled) return;
  globalErrorHandlersInstalled = true;

  if (typeof window !== "undefined") {
    window.addEventListener("error", (event) => {
      errorLogger.error(
        new AppError(
          "UNCAUGHT_ERROR",
          event.message || "Uncaught error",
          { filename: event.filename, lineno: event.lineno, colno: event.colno, stack: event.error?.stack },
        ),
        "GlobalErrorHandler",
      );
    });

    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack : undefined;
      errorLogger.error(
        new AppError("UNHANDLED_REJECTION", message || "Unhandled promise rejection", { stack }),
        "GlobalErrorHandler",
      );
    });
  }
}
