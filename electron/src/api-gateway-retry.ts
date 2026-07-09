import { getLogger } from "./logging/logger";
import { retryWithBackoff } from "@shared-logic/retry/retry-with-backoff";

const logger = getLogger("api-gateway-retry");

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  retryableCheck?: (error: unknown) => boolean;
}

const NETWORK_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "ECONNABORTED",
  "EPIPE",
  "EAI_AGAIN",
]);

const RETRYABLE_HTTP_STATUS = new Set([429, 502, 503, 504]);

function getHttpStatus(error: unknown): number | undefined {
  if (error && typeof error === "object" && "statusCode" in error) {
    return (error as Error & { statusCode?: number }).statusCode;
  }
  return undefined;
}

function getErrorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    return (error as Error & { code?: string }).code as string;
  }
  return undefined;
}

export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const httpStatus = getHttpStatus(error);
  if (httpStatus !== undefined) {
    if (RETRYABLE_HTTP_STATUS.has(httpStatus)) return true;
    if (httpStatus >= 400 && httpStatus < 500) return false;
    if (httpStatus >= 500) return true;
  }

  const code = getErrorCode(error);
  if (code && NETWORK_ERROR_CODES.has(code)) return true;

  const msg = error.message;
  if (/timeout|timed?\s*out|ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT/i.test(msg)) return true;
  if (/rate[\s_-]?limit|429/i.test(msg)) return true;
  if (/50[234]|service[\s_-]?unavailable|bad[\s_-]?gateway/i.test(msg)) return true;

  return false;
}

/**
 * 带重试的异步执行器（适配层）。
 *
 * 内部代理到 @shared-logic/retry/retry-with-backoff 的 retryWithBackoff，
 * 对外保持原有 (fn, options) 签名与行为不变。
 *
 * 行为：
 *  - 默认 maxRetries=2（总尝试 3 次），baseDelay=1000ms
 *  - 指数退避 + 抖动 [0.5*delay, delay]
 *  - 默认可重试判定使用本文件的 isRetryableError（保留 HTTP 429/5xx、网络错误码、消息模式）
 *  - 可通过 retryableCheck 覆盖可重试判定
 *  - 每次重试通过 logger.warn 记录
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 2;
  const baseDelay = options.baseDelay ?? 1000;
  const retryableCheck = options.retryableCheck ?? isRetryableError;

  return retryWithBackoff<T>({
    fn,
    maxRetries,
    baseDelayMs: baseDelay,
    backoff: "exponential",
    shouldJitter: true,
    retryOn: retryableCheck,
    onRetry: (attempt: number, error: Error, delayMs: number) => {
      logger.warn(
        `Retry attempt ${attempt}/${maxRetries} after ${Math.round(delayMs)}ms`,
        { error: error.message },
      );
    },
  });
}
