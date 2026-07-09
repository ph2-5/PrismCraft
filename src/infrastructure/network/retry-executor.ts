import type { RetryPolicy } from "./types";
import {
  retryWithBackoff,
  calculateBackoffDelay,
} from "@/shared-logic/retry/retry-with-backoff";

const RETRY_POLICIES: Record<string, RetryPolicy> = {
  api: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoff: "exponential",
    jitter: true,
    retryableErrors: ["NETWORK_ERROR", "TIMEOUT", "RATE_LIMITED", "API_SERVER_ERROR", "ECONNREFUSED", "ETIMEDOUT"],
  },
  video: {
    maxRetries: 5,
    baseDelay: 2000,
    maxDelay: 30000,
    backoff: "exponential",
    jitter: true,
    retryableErrors: ["NETWORK_ERROR", "TIMEOUT", "API_SERVER_ERROR", "ECONNREFUSED", "ETIMEDOUT"],
  },
  download: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 5000,
    backoff: "linear",
    jitter: true,
    retryableErrors: ["NETWORK_ERROR", "TIMEOUT", "ECONNREFUSED", "ETIMEDOUT"],
  },
  status: {
    maxRetries: 5,
    baseDelay: 3000,
    maxDelay: 15000,
    backoff: "exponential",
    jitter: true,
    retryableErrors: ["NETWORK_ERROR", "TIMEOUT", "API_SERVER_ERROR", "ECONNREFUSED", "ETIMEDOUT"],
  },
};

function calculateDelay(
  attempt: number,
  policy: RetryPolicy,
): number {
  // 代理到统一实现，行为与原内联实现完全一致
  return calculateBackoffDelay(
    attempt,
    policy.baseDelay,
    policy.backoff,
    policy.maxDelay,
    policy.jitter,
  );
}

function isRetryableError(error: unknown, policy: RetryPolicy): boolean {
  if (!error) return false;

  const errorCode = extractErrorCode(error);
  if (!errorCode) return false;

  return policy.retryableErrors.length === 0 || policy.retryableErrors.includes(errorCode);
}

function extractErrorCode(error: unknown): string | null {
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    if (typeof e.code === "string") return e.code;
    if (typeof e.apiCode === "string") return e.apiCode;
    if (e instanceof Error) {
      const msg = e.message;
      if (msg.includes("ECONNREFUSED")) return "ECONNREFUSED";
      if (msg.includes("ETIMEDOUT")) return "ETIMEDOUT";
      if (msg.includes("Failed to fetch")) return "NETWORK_ERROR";
      if (msg.includes("net::ERR_")) return "NETWORK_ERROR";
      if (msg.includes("abort")) return "ABORT";
    }
  }
  return null;
}

function isClientError(error: unknown): boolean {
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    const statusCode = typeof e.statusCode === "number" ? e.statusCode : 0;
    if (statusCode >= 400 && statusCode < 500 && statusCode !== 429 && statusCode !== 408) {
      return true;
    }
  }
  return false;
}

/**
 * 带重试的异步执行器（适配层）。
 *
 * 内部代理到 @/shared-logic/retry/retry-with-backoff 的 retryWithBackoff，
 * 对外保持原有 (fn, policy, signal) 签名与行为不变。
 *
 * 可重试判定规则（与历史行为一致）：
 *  - 4xx 客户端错误（除 429/408）立即抛出，不重试
 *  - 错误码命中 policy.retryableErrors 才重试（retryableErrors 为空时全部重试）
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy | keyof typeof RETRY_POLICIES,
  signal?: AbortSignal,
): Promise<T> {
  const resolvedPolicy: RetryPolicy =
    typeof policy === "string" ? RETRY_POLICIES[policy]! : policy;

  return retryWithBackoff<T>({
    fn,
    maxRetries: resolvedPolicy.maxRetries,
    baseDelayMs: resolvedPolicy.baseDelay,
    maxDelayMs: resolvedPolicy.maxDelay,
    backoff: resolvedPolicy.backoff,
    shouldJitter: resolvedPolicy.jitter,
    signal,
    onRetry: resolvedPolicy.onRetry,
    // 可重试谓词：客户端错误（4xx 除 429/408）不可重试，其余按 policy.retryableErrors 判定
    retryOn: (error: unknown) => {
      if (isClientError(error)) return false;
      return isRetryableError(error, resolvedPolicy);
    },
  });
}

export { RETRY_POLICIES, calculateDelay, isRetryableError };
