/**
 * logging/index.ts
 *
 * 日志模块 - 统一导出
 */

export { Logger, getLogger, createLogger, loggerRegistry } from "./logger";
export { ConsoleTransport } from "./transports/console.transport";
export { FileTransport } from "./transports/file.transport";

export type {
  LogLevel,
  LogEntry,
  LogTransport,
  LogContext,
  LoggerConfig,
  LogResult,
  LogFormatter,
  LogFilter,
} from "./types";

export { LOG_LEVEL_VALUES } from "./types";
