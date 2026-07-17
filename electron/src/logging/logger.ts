/**
 * logging/logger.ts
 *
 * 核心日志模块
 *
 * 特性：
 * - 命名空间支持（模块隔离）
 * - 多传输目标（console、file、future-remote）
 * - 结构化日志（JSON）
 * - 日志级别过滤
 * - 上下文传递
 */

import type {
  LogLevel,
  LogEntry,
  LogTransport,
  LogContext,
  LoggerConfig,
} from "./types";
import { LOG_LEVEL_VALUES } from "./types";

const SENSITIVE_PATTERNS = [
  // OpenAI sk- 前缀（含 sk-proj- 变体）
  /\bsk-[a-zA-Z0-9_-]{20,}/g,
  // Anthropic sk-ant- 前缀
  /\bsk-ant-[a-zA-Z0-9_-]{20,}/g,
  // Google AI Studio API Key（AIza 开头，长度 39）
  /\bAIza[a-zA-Z0-9_-]{35}/g,
  // Google ?key= URL 参数
  /\bkey=([a-zA-Z0-9_-]{20,})/gi,
  // Azure OpenAI ?api-version=...&key= 参数（已由上面 key= 覆盖，此处保留语义）
  // Bearer JWT Token
  /\bBearer\s+[a-zA-Z0-9_.-]{20,}/gi,
  // 通用 apiKey/secret/password/token 键值对
  /[a-zA-Z0-9_-]*api[_-]?key[a-zA-Z0-9_-]*\s*[:=]\s*["']?[\w-]{8,}["']?/gi,
  /[a-zA-Z0-9_-]*secret[a-zA-Z0-9_-]*\s*[:=]\s*["']?[\w-]{8,}["']?/gi,
  /[a-zA-Z0-9_-]*password[a-zA-Z0-9_-]*\s*[:=]\s*["']?[^\s"']{4,}["']?/gi,
  /[a-zA-Z0-9_-]*token[a-zA-Z0-9_-]*\s*[:=]\s*["']?[\w-]{8,}["']?/gi,
];

function redactSensitive(input: string): string {
  let result = input;
  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, () => {
      // R182/H6: 不保留前缀，避免泄露 provider 类型（如 AIza 暴露 Google）
      return "***REDACTED***";
    });
  }
  return result;
}

function redactContext(context: LogContext | undefined): LogContext | undefined {
  if (!context) return undefined;
  const redacted: LogContext = {};
  for (const [key, value] of Object.entries(context)) {
    if (typeof value === "string") {
      redacted[key] = redactSensitive(value);
    } else if (typeof value === "object" && value !== null) {
      redacted[key] = JSON.parse(redactSensitive(JSON.stringify(value)));
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

function sanitizeStack(stack: string | undefined): string | undefined {
  if (!stack) return undefined;
  return stack
    .replace(/\(?.:\\Users\\[^\\]+\\Desktop\\[^\\]+\\/g, "(project://")
    .replace(/\(?.:\\[^)]+\\node_modules\\/g, "(node_modules://")
    .replace(/at .+ \(.:\\.+\\/g, (match) => {
      const parts = match.split("(");
      return parts.length > 1 ? `at <fn> (${(parts[1] ?? "").substring(0, 30)}...` : match;
    });
}

export class Logger {
  private config: LoggerConfig;
  private namespace: string;

  constructor(namespace: string, config?: Partial<LoggerConfig>) {
    this.namespace = namespace;
    this.config = {
      minLevel: config?.minLevel ?? "info",
      defaultNamespace: namespace,
      includeTimestamp: config?.includeTimestamp ?? true,
      includeCaller: config?.includeCaller ?? false,
      transports: config?.transports ?? [],
    };
  }

  /** 创建子日志器（继承配置，可覆盖） */
  child(subNamespace: string, config?: Partial<LoggerConfig>): Logger {
    return new Logger(`${this.namespace}:${subNamespace}`, {
      ...this.config,
      ...config,
    });
  }

  /** 添加传输 */
  addTransport(transport: LogTransport): void {
    this.config.transports.push(transport);
  }

  /** 移除传输 */
  removeTransport(name: string): void {
    this.config.transports = this.config.transports.filter(
      (t) => t.name !== name
    );
  }

  // --- 日志方法 ---

  debug(message: string, context?: LogContext): void {
    this.log("debug", message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log("info", message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log("warn", message, context);
  }

  error(message: string, error?: Error, context?: LogContext): void {
    this.log("error", message, context, error);
  }

  fatal(message: string, error?: Error, context?: LogContext): void {
    this.log("fatal", message, context, error);
  }

  // --- 内部方法 ---

  private log(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: Error
  ): void {
    // 级别过滤
    if (LOG_LEVEL_VALUES[level] < LOG_LEVEL_VALUES[this.config.minLevel]) {
      return;
    }

    const entry: LogEntry = {
      level,
      message: redactSensitive(message),
      timestamp: new Date().toISOString(),
      namespace: this.namespace,
      context: redactContext(context),
    };

    if (error) {
      entry.error = {
        message: redactSensitive(error.message),
        name: error.name,
        stack: sanitizeStack(error.stack),
      };
    }

    // 发送到所有传输
    for (const transport of this.config.transports) {
      if (!transport.enabled) continue;
      if (LOG_LEVEL_VALUES[level] < LOG_LEVEL_VALUES[transport.minLevel]) {
        continue;
      }

      try {
        transport.write(entry);
      } catch (err) {
        // 传输失败时回退到控制台
        console.error(`[Logger] Transport ${transport.name} failed:`, err);
      }
    }
  }
}

// --- 全局日志管理 ---

class LoggerRegistry {
  private loggers = new Map<string, Logger>();
  private defaultTransports: LogTransport[] = [];
  private globalMinLevel: LogLevel = "info";

  /** 设置默认传输（新日志器自动继承） */
  setDefaultTransports(transports: LogTransport[]): void {
    this.defaultTransports = transports;
    // 更新现有日志器
    for (const logger of this.loggers.values()) {
      for (const transport of transports) {
        logger.addTransport(transport);
      }
    }
  }

  /** 设置全局最低日志级别 */
  setGlobalMinLevel(level: LogLevel): void {
    this.globalMinLevel = level;
  }

  /** 获取或创建日志器 */
  getLogger(namespace: string): Logger {
    if (!this.loggers.has(namespace)) {
      const logger = new Logger(namespace, {
        minLevel: this.globalMinLevel,
        transports: [...this.defaultTransports],
      });
      this.loggers.set(namespace, logger);
    }
    return this.loggers.get(namespace)!;
  }

  /** 获取所有日志器 */
  getAllLoggers(): Logger[] {
    return Array.from(this.loggers.values());
  }

  /** 关闭所有默认 transport（清理定时器、监听器、flush 残留日志） */
  async closeAllTransports(): Promise<void> {
    for (const transport of this.defaultTransports) {
      try {
        if (typeof transport.close === "function") {
          await transport.close();
        }
      } catch (err) {
        console.error(`[LoggerRegistry] Failed to close transport ${transport.name}:`, err);
      }
    }
  }
}

// --- 导出 ---

export const loggerRegistry = new LoggerRegistry();

/** 获取日志器的便捷函数 */
export function getLogger(namespace: string): Logger {
  return loggerRegistry.getLogger(namespace);
}

/** 创建日志器的便捷函数 */
export function createLogger(
  namespace: string,
  config?: Partial<LoggerConfig>
): Logger {
  return new Logger(namespace, config);
}
