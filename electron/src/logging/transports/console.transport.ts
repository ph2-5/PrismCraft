/**
 * logging/transports/console.transport.ts
 *
 * Console 传输 - 输出到控制台
 */

import type { LogTransport, LogEntry, LogLevel } from "../types";

/** 日志级别颜色映射 */
const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: "\x1b[36m", // Cyan
  info: "\x1b[32m",  // Green
  warn: "\x1b[33m",  // Yellow
  error: "\x1b[31m", // Red
  fatal: "\x1b[35m", // Magenta
};

const RESET_COLOR = "\x1b[0m";

export class ConsoleTransport implements LogTransport {
  readonly name = "console";
  minLevel: LogLevel;
  enabled: boolean;
  private useColors: boolean;

  constructor(options?: {
    minLevel?: LogLevel;
    enabled?: boolean;
    useColors?: boolean;
  }) {
    this.minLevel = options?.minLevel ?? "debug";
    this.enabled = options?.enabled ?? true;
    this.useColors = options?.useColors ?? true;
  }

  write(entry: LogEntry): void {
    if (!this.enabled) return;

    const formatted = this.format(entry);

    switch (entry.level) {
      case "debug":
        console.debug(formatted);
        break;
      case "info":
        console.info(formatted);
        break;
      case "warn":
        console.warn(formatted);
        break;
      case "error":
      case "fatal":
        console.error(formatted);
        break;
    }
  }

  private format(entry: LogEntry): string {
    const parts: string[] = [];

    // 时间戳
    const time = new Date(entry.timestamp).toLocaleTimeString("zh-CN", {
      hour12: false,
    });
    parts.push(`[${time}]`);

    // 级别（带颜色）
    const levelStr = entry.level.toUpperCase().padStart(5);
    if (this.useColors) {
      parts.push(`${LEVEL_COLORS[entry.level]}${levelStr}${RESET_COLOR}`);
    } else {
      parts.push(levelStr);
    }

    // 命名空间
    parts.push(`[${entry.namespace}]`);

    // 消息
    parts.push(entry.message);

    // 上下文
    if (entry.context && Object.keys(entry.context).length > 0) {
      try {
        parts.push(JSON.stringify(entry.context));
      } catch {
        parts.push("[Context serialization failed]");
      }
    }

    // 错误
    if (entry.error) {
      parts.push(`\n  Error: ${entry.error.message}`);
      if (entry.error.stack) {
        parts.push(`\n  Stack: ${entry.error.stack.split("\n").slice(0, 3).join("\n         ")}`);
      }
    }

    return parts.join(" ");
  }
}
