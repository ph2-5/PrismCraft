/**
 * logging/types.ts
 *
 * 日志模块 - 核心类型定义
 *
 * 设计原则：
 * - 统一日志接口，支持多传输目标
 * - 结构化日志（JSON 格式）
 * - 日志级别控制
 * - 零外部依赖
 */

/** 日志级别 */
export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

/** 日志级别数值（用于比较） */
export const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

/** 日志条目 */
export interface LogEntry {
  /** 日志级别 */
  level: LogLevel;
  /** 日志消息 */
  message: string;
  /** 时间戳（ISO 8601） */
  timestamp: string;
  /** 命名空间（模块/组件标识） */
  namespace: string;
  /** 上下文数据 */
  context?: Record<string, unknown>;
  /** 错误对象（如果有） */
  error?: {
    message: string;
    stack?: string;
    name?: string;
  };
}

/** 日志传输接口 */
export interface LogTransport {
  /** 传输名称 */
  readonly name: string;
  /** 最低日志级别 */
  minLevel: LogLevel;
  /** 是否启用 */
  enabled: boolean;

  /** 写入日志 */
  write(entry: LogEntry): void | Promise<void>;

  /** 刷新缓冲区（如果有） */
  flush?(): Promise<void>;

  /** 关闭传输 */
  close?(): Promise<void>;
}

/** 日志配置 */
export interface LoggerConfig {
  /** 全局最低日志级别 */
  minLevel: LogLevel;
  /** 默认命名空间 */
  defaultNamespace: string;
  /** 是否包含时间戳 */
  includeTimestamp: boolean;
  /** 是否包含调用位置 */
  includeCaller: boolean;
  /** 传输配置 */
  transports: LogTransport[];
}

/** 日志上下文 */
export interface LogContext {
  [key: string]: unknown;
}

/** 日志结果 */
export type LogResult =
  | { ok: true }
  | { ok: false; error: string };

/** 日志格式化函数 */
export type LogFormatter = (entry: LogEntry) => string;

/** 日志过滤函数 */
export type LogFilter = (entry: LogEntry) => boolean;
