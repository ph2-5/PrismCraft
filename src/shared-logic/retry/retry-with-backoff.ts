/**
 * 统一的重试执行函数（项目内重试逻辑的单一来源）。
 *
 * 背景：项目此前存在三套并行、行为不一致的重试实现：
 *  1. src/infrastructure/ai-providers/core.ts 的 apiCallWithRetry
 *  2. src/infrastructure/network/retry-executor.ts 的 executeWithRetry
 *  3. electron/src/api-gateway-retry.ts 的 withRetry
 * 三者在最大重试次数、退避策略、可重试错误判定上各不相同，容易引发 bug。
 * 本文件作为唯一实现，由上述三个适配层内部调用，对外保持各自旧 API 签名不变。
 *
 * 设计约束：
 *  - shared-logic 层零外部依赖（仅允许本目录内相对导入）
 *  - 不依赖 logger；日志通过 onRetry 回调由调用方自行处理
 *  - 不依赖 DOMException 类型声明；创建具有 AbortError 语义的 Error 对象
 *  - 所有类型自包含，不引用其它层的类型
 */

/** 退避策略类型 */
export type BackoffStrategy = "exponential" | "linear" | "fixed";

/** 统一重试选项 */
export interface RetryWithBackoffOptions<T> {
  /** 要执行的异步操作 */
  fn: () => Promise<T>;
  /** 最大重试次数（不含首次尝试），总尝试次数 = maxRetries + 1 */
  maxRetries: number;
  /** 基础延迟（毫秒） */
  baseDelayMs: number;
  /** 延迟上限（毫秒），默认不限制 */
  maxDelayMs?: number;
  /** 退避策略，默认 "exponential" */
  backoff?: BackoffStrategy;
  /** 是否启用抖动（默认 true）。抖动将延迟缩放到 [0.5*delay, delay] 区间 */
  shouldJitter?: boolean;
  /** 错误是否可重试的谓词。默认使用 defaultRetryableError */
  retryOn?: (error: unknown) => boolean;
  /** 重试回调（attempt 从 1 开始，表示第几次重试） */
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
  /** 可选的中断信号；若在尝试前或等待期间被 abort，立即抛出 AbortError */
  signal?: AbortSignal;
  /**
   * 可选的延迟覆盖函数。在计算默认延迟后调用，允许调用方根据错误类型
   * 调整最终延迟（例如 429 限流时强制至少 5000ms）。
   * 返回值将作为实际等待的延迟（毫秒）。
   */
  getDelayOverride?: (error: Error, defaultDelay: number) => number;
}

/** 可重试的 HTTP 状态码：408 超时、429 限流、5xx 服务端错误 */
const RETRYABLE_HTTP_STATUS = new Set<number>([408, 429, 500, 502, 503, 504]);

/** 可重试的网络层错误码（Node.js / 浏览器通用） */
const RETRYABLE_NETWORK_CODES = new Set<string>([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "ECONNABORTED",
  "EPIPE",
  "EAI_AGAIN",
]);

/** 可重试的应用层错误码（与历史实现保持一致） */
const RETRYABLE_APP_CODES = new Set<string>([
  "NETWORK_ERROR",
  "TIMEOUT",
  "RATE_LIMITED",
  "API_SERVER_ERROR",
]);

/** 可重试的错误消息正则模式 */
const RETRYABLE_MESSAGE_PATTERNS: readonly RegExp[] = [
  /timeout|timed?\s*out/i,
  /ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT/i,
  /rate[\s_-]?limit|429/i,
  /50[234]|service[\s_-]?unavailable|bad[\s_-]?gateway/i,
  /Failed to fetch|net::ERR_/i,
] as const;

/**
 * 从错误对象上读取类字符串的 code 字段（兼容 code / apiCode）。
 */
function readErrorCode(error: object): string | undefined {
  const record = error as Record<string, unknown>;
  if (typeof record.code === "string") return record.code;
  if (typeof record.apiCode === "string") return record.apiCode;
  return undefined;
}

/**
 * 从错误对象上读取 HTTP 状态码。
 */
function readHttpStatus(error: object): number | undefined {
  const record = error as Record<string, unknown>;
  if (typeof record.statusCode === "number") return record.statusCode;
  if (typeof record.status === "number") return record.status;
  return undefined;
}

/**
 * 默认错误可重试判断（综合三套旧实现的行为）。
 *
 * 规则：
 *  - AbortError → 不可重试（用户主动取消）
 *  - HTTP 5xx → 可重试
 *  - HTTP 408 / 429 → 可重试
 *  - HTTP 4xx（除 408/429）→ 不可重试
 *  - 网络错误码（ECONNREFUSED 等）→ 可重试
 *  - 应用层错误码（NETWORK_ERROR/TIMEOUT/RATE_LIMITED/API_SERVER_ERROR）→ 可重试
 *  - 错误消息匹配已知模式 → 可重试
 *  - 其它 → 不可重试
 */
export function defaultRetryableError(error: unknown): boolean {
  if (!error) return false;

  // AbortError 不可重试
  if (error instanceof Error && error.name === "AbortError") return false;

  // 非对象类型不可重试
  if (typeof error !== "object") return false;

  // HTTP 状态码判断（优先级最高）
  const httpStatus = readHttpStatus(error);
  if (httpStatus !== undefined) {
    if (RETRYABLE_HTTP_STATUS.has(httpStatus)) return true;
    if (httpStatus >= 400 && httpStatus < 500) return false;
    if (httpStatus >= 500) return true;
  }

  // 错误码判断
  const code = readErrorCode(error);
  if (code !== undefined) {
    if (RETRYABLE_NETWORK_CODES.has(code)) return true;
    if (RETRYABLE_APP_CODES.has(code)) return true;
  }

  // 错误消息模式匹配
  if (error instanceof Error) {
    const message = error.message;
    for (const pattern of RETRYABLE_MESSAGE_PATTERNS) {
      if (pattern.test(message)) return true;
    }
  }

  return false;
}

/**
 * 计算单次重试的延迟（毫秒）。
 *
 * 公式：
 *  - exponential: baseDelayMs * 2^attempt
 *  - linear:      baseDelayMs * (attempt + 1)
 *  - fixed:       baseDelayMs
 *
 * 之后先应用 maxDelayMs 上限，再（如启用）应用抖动 [0.5*delay, delay]，
 * 最后向下取整返回。
 */
export function calculateBackoffDelay(
  attempt: number,
  baseDelayMs: number,
  strategy: BackoffStrategy,
  maxDelayMs: number,
  shouldJitter: boolean,
): number {
  let delay: number;
  switch (strategy) {
    case "exponential":
      delay = baseDelayMs * Math.pow(2, attempt);
      break;
    case "linear":
      delay = baseDelayMs * (attempt + 1);
      break;
    case "fixed":
      delay = baseDelayMs;
      break;
    default:
      delay = baseDelayMs * Math.pow(2, attempt);
  }

  delay = Math.min(delay, maxDelayMs);

  if (shouldJitter) {
    delay = delay * (0.5 + Math.random() * 0.5);
  }

  return Math.floor(delay);
}

/**
 * 创建具有 AbortError 语义的错误对象。
 *
 * 不直接使用 DOMException（shared-logic 的 lib 配置不含 dom），
 * 改用普通 Error 并设置 name="AbortError"，所有下游消费者均通过
 * error.name === "AbortError" 判断，行为与 DOMException 等价。
 */
function createAbortError(): Error {
  const error = new Error("Request was aborted");
  error.name = "AbortError";
  return error;
}

/**
 * 统一的重试执行函数。
 *
 * 行为：
 *  - attempt 从 0 到 maxRetries（含），总尝试次数 = maxRetries + 1
 *  - 每次重试前等待 calculateBackoffDelay 计算的延迟
 *  - 若 signal 在尝试前或等待期间被 abort，立即抛出 name="AbortError" 的错误
 *  - retryOn 返回 false 的错误立即抛出，不消耗重试次数
 *  - 重试前调用 onRetry 回调（attempt 参数从 1 开始计数）
 *
 * @returns fn 的成功返回值
 * @throws fn 抛出的最后一个错误，或 AbortError
 */
export async function retryWithBackoff<T>(
  options: RetryWithBackoffOptions<T>,
): Promise<T> {
  const {
    fn,
    maxRetries,
    baseDelayMs,
    maxDelayMs = Number.POSITIVE_INFINITY,
    backoff = "exponential",
    shouldJitter = true,
    retryOn = defaultRetryableError,
    onRetry,
    signal,
    getDelayOverride,
  } = options;

  let lastError: Error = new Error("All retries exhausted");

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // 尝试前检查 abort
    if (signal?.aborted) {
      throw createAbortError();
    }

    try {
      return await fn();
    } catch (error) {
      const normalizedError: Error =
        error instanceof Error ? error : new Error(String(error));
      lastError = normalizedError;

      // 不可重试错误立即抛出
      if (!retryOn(error)) {
        throw normalizedError;
      }

      // 已达重试上限
      if (attempt >= maxRetries) {
        throw normalizedError;
      }

      let delay = calculateBackoffDelay(
        attempt,
        baseDelayMs,
        backoff,
        maxDelayMs,
        shouldJitter,
      );

      // 允许调用方根据错误类型覆盖延迟（如 429 限流强制至少 5000ms）
      if (getDelayOverride) {
        delay = getDelayOverride(normalizedError, delay);
      }

      // 重试回调（attempt 从 1 开始计数，表示第几次重试）
      onRetry?.(attempt + 1, normalizedError, delay);

      // 等待延迟，期间支持 abort
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delay);
        if (signal) {
          const onAbort = (): void => {
            clearTimeout(timer);
            signal.removeEventListener("abort", onAbort);
            reject(createAbortError());
          };
          signal.addEventListener("abort", onAbort, { once: true });
        }
      }).catch((abortError: unknown) => {
        throw abortError;
      });
    }
  }

  // 理论上不可达：循环内要么 return 要么 throw
  throw lastError;
}
