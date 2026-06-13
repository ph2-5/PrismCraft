import { getLogger } from "./logging/logger";

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

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 2;
  const baseDelay = options.baseDelay ?? 1000;
  const retryableCheck = options.retryableCheck ?? isRetryableError;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt >= maxRetries || !retryableCheck(error)) {
        throw error;
      }

      const jitter = 0.5 + Math.random() * 0.5;
      const delay = baseDelay * Math.pow(2, attempt) * jitter;

      logger.warn(
        `Retry attempt ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms`,
        { error: error instanceof Error ? error.message : String(error) },
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
