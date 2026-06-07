import type { RetryPolicy } from "./types";

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
  let delay: number;

  switch (policy.backoff) {
    case "exponential":
      delay = policy.baseDelay * Math.pow(2, attempt);
      break;
    case "linear":
      delay = policy.baseDelay * (attempt + 1);
      break;
    case "fixed":
      delay = policy.baseDelay;
      break;
    default:
      delay = policy.baseDelay * Math.pow(2, attempt);
  }

  delay = Math.min(delay, policy.maxDelay);

  if (policy.jitter) {
    delay = delay * (0.5 + Math.random() * 0.5);
  }

  return Math.floor(delay);
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

export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy | keyof typeof RETRY_POLICIES,
  signal?: AbortSignal,
): Promise<T> {
  const resolvedPolicy: RetryPolicy =
    typeof policy === "string" ? RETRY_POLICIES[policy]! : policy;

  let lastError: Error = new Error("All retries exhausted");

  for (let attempt = 0; attempt <= resolvedPolicy.maxRetries; attempt++) {
    if (signal?.aborted) {
      throw new DOMException("Request was aborted", "AbortError");
    }

    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (isClientError(error)) {
        throw error;
      }

      if (!isRetryableError(error, resolvedPolicy)) {
        throw error;
      }

      if (attempt >= resolvedPolicy.maxRetries) {
        throw lastError;
      }

      const delay = calculateDelay(attempt, resolvedPolicy);

      resolvedPolicy.onRetry?.(attempt + 1, lastError, delay);

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delay);

        if (signal) {
          const onAbort = () => {
            clearTimeout(timer);
            signal.removeEventListener("abort", onAbort);
            reject(new DOMException("Request was aborted", "AbortError"));
          };
          signal.addEventListener("abort", onAbort, { once: true });
        }
      }).catch((abortError) => {
        throw abortError;
      });
    }
  }

  throw lastError;
}

export { RETRY_POLICIES, calculateDelay, isRetryableError };
