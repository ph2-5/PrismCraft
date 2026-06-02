import { describe, it, expect, vi } from "vitest";
import {
  executeWithRetry,
  RETRY_POLICIES,
  calculateDelay,
  isRetryableError,
} from "../retry-executor";
import type { RetryPolicy } from "../types";

describe("retry-executor", () => {
  describe("RETRY_POLICIES", () => {
    it("should define api policy with correct defaults", () => {
      expect(RETRY_POLICIES.api.maxRetries).toBe(3);
      expect(RETRY_POLICIES.api.backoff).toBe("exponential");
      expect(RETRY_POLICIES.api.retryableErrors).toContain("NETWORK_ERROR");
      expect(RETRY_POLICIES.api.retryableErrors).toContain("RATE_LIMITED");
    });

    it("should define video policy with higher retries", () => {
      expect(RETRY_POLICIES.video.maxRetries).toBe(5);
      expect(RETRY_POLICIES.video.baseDelay).toBe(2000);
    });

    it("should define download policy with linear backoff", () => {
      expect(RETRY_POLICIES.download.backoff).toBe("linear");
    });

    it("should define status policy", () => {
      expect(RETRY_POLICIES.status.maxRetries).toBe(5);
      expect(RETRY_POLICIES.status.backoff).toBe("exponential");
    });
  });

  describe("calculateDelay", () => {
    const basePolicy: RetryPolicy = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoff: "exponential",
      jitter: false,
      retryableErrors: [],
    };

    it("should calculate exponential backoff", () => {
      expect(calculateDelay(0, basePolicy)).toBe(1000);
      expect(calculateDelay(1, basePolicy)).toBe(2000);
      expect(calculateDelay(2, basePolicy)).toBe(4000);
      expect(calculateDelay(3, basePolicy)).toBe(8000);
    });

    it("should calculate linear backoff", () => {
      const linearPolicy = { ...basePolicy, backoff: "linear" as const };
      expect(calculateDelay(0, linearPolicy)).toBe(1000);
      expect(calculateDelay(1, linearPolicy)).toBe(2000);
      expect(calculateDelay(2, linearPolicy)).toBe(3000);
    });

    it("should calculate fixed backoff", () => {
      const fixedPolicy = { ...basePolicy, backoff: "fixed" as const };
      expect(calculateDelay(0, fixedPolicy)).toBe(1000);
      expect(calculateDelay(1, fixedPolicy)).toBe(1000);
      expect(calculateDelay(5, fixedPolicy)).toBe(1000);
    });

    it("should cap delay at maxDelay", () => {
      expect(calculateDelay(10, basePolicy)).toBe(10000);
    });

    it("should apply jitter when enabled", () => {
      const jitterPolicy = { ...basePolicy, jitter: true };
      const delays = new Set<number>();
      for (let i = 0; i < 20; i++) {
        delays.add(calculateDelay(1, jitterPolicy));
      }
      expect(delays.size).toBeGreaterThan(1);
    });

    it("should produce delay within jitter range [0.5*delay, delay]", () => {
      const jitterPolicy = { ...basePolicy, jitter: true, maxDelay: 100000 };
      for (let i = 0; i < 50; i++) {
        const delay = calculateDelay(1, jitterPolicy);
        const baseExpected = 2000;
        expect(delay).toBeGreaterThanOrEqual(Math.floor(baseExpected * 0.5));
        expect(delay).toBeLessThanOrEqual(baseExpected);
      }
    });
  });

  describe("isRetryableError", () => {
    const policy: RetryPolicy = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoff: "exponential",
      jitter: false,
      retryableErrors: ["NETWORK_ERROR", "TIMEOUT", "RATE_LIMITED"],
    };

    it("should return true for retryable error codes", () => {
      expect(isRetryableError({ code: "NETWORK_ERROR" }, policy)).toBe(true);
      expect(isRetryableError({ code: "TIMEOUT" }, policy)).toBe(true);
      expect(isRetryableError({ code: "RATE_LIMITED" }, policy)).toBe(true);
    });

    it("should return false for non-retryable error codes", () => {
      expect(isRetryableError({ code: "INVALID_API_KEY" }, policy)).toBe(false);
      expect(isRetryableError({ code: "BAD_REQUEST" }, policy)).toBe(false);
    });

    it("should return false when error has no code (unknown error)", () => {
      expect(isRetryableError(new Error("unknown"), policy)).toBe(false);
    });

    it("should return false for null/undefined error", () => {
      expect(isRetryableError(null, policy)).toBe(false);
      expect(isRetryableError(undefined, policy)).toBe(false);
    });

    it("should return true for all errors when retryableErrors is empty", () => {
      const permissivePolicy = { ...policy, retryableErrors: [] };
      expect(isRetryableError({ code: "ANYTHING" }, permissivePolicy)).toBe(true);
    });

    it("should detect error codes from Error message patterns", () => {
      expect(isRetryableError(new Error("ECONNREFUSED at localhost"), policy)).toBe(false);
      expect(
        isRetryableError(
          { code: "ECONNREFUSED" },
          { ...policy, retryableErrors: ["ECONNREFUSED"] },
        ),
      ).toBe(true);
    });
  });

  describe("executeWithRetry", () => {
    it("should return result on first success", async () => {
      const fn = vi.fn().mockResolvedValue("success");
      const result = await executeWithRetry(fn, "api");
      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should retry on retryable error and succeed", async () => {
      const networkError = Object.assign(new Error("network error"), { code: "NETWORK_ERROR" });
      const fn = vi
        .fn()
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce("success");

      const result = await executeWithRetry(fn, {
        maxRetries: 3,
        baseDelay: 1,
        maxDelay: 10,
        backoff: "fixed",
        jitter: false,
        retryableErrors: ["NETWORK_ERROR"],
      });

      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("should not retry client errors (4xx except 429/408)", async () => {
      const clientError = new Error("Bad Request") as Error & { statusCode: number };
      clientError.statusCode = 400;
      const fn = vi.fn().mockRejectedValue(clientError);

      await expect(
        executeWithRetry(fn, {
          maxRetries: 3,
          baseDelay: 1,
          maxDelay: 10,
          backoff: "fixed",
          jitter: false,
          retryableErrors: ["BAD_REQUEST"],
        }),
      ).rejects.toThrow("Bad Request");

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should retry 429 (rate limit) errors", async () => {
      const rateLimitError = Object.assign(new Error("Rate Limited"), { statusCode: 429, code: "RATE_LIMITED" });
      const fn = vi
        .fn()
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce("ok");

      const result = await executeWithRetry(fn, {
        maxRetries: 3,
        baseDelay: 1,
        maxDelay: 10,
        backoff: "fixed",
        jitter: false,
        retryableErrors: ["RATE_LIMITED"],
      });

      expect(result).toBe("ok");
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("should exhaust all retries and throw last error", async () => {
      const networkError = Object.assign(new Error("NETWORK_ERROR"), { code: "NETWORK_ERROR" });
      const fn = vi.fn().mockRejectedValue(networkError);

      await expect(
        executeWithRetry(fn, {
          maxRetries: 2,
          baseDelay: 1,
          maxDelay: 10,
          backoff: "fixed",
          jitter: false,
          retryableErrors: ["NETWORK_ERROR"],
        }),
      ).rejects.toThrow("NETWORK_ERROR");

      expect(fn).toHaveBeenCalledTimes(3);
    });

    it("should accept policy name string", async () => {
      const fn = vi.fn().mockResolvedValue("ok");
      const result = await executeWithRetry(fn, "api");
      expect(result).toBe("ok");
    });

    it("should call onRetry callback", async () => {
      const onRetry = vi.fn();
      const networkError = Object.assign(new Error("network error"), { code: "NETWORK_ERROR" });
      const fn = vi
        .fn()
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce("ok");

      await executeWithRetry(fn, {
        maxRetries: 3,
        baseDelay: 1,
        maxDelay: 10,
        backoff: "fixed",
        jitter: false,
        retryableErrors: ["NETWORK_ERROR"],
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error), expect.any(Number));
    });

    it("should throw AbortError when signal is aborted", async () => {
      const fn = vi.fn().mockResolvedValue("ok");
      const controller = new AbortController();
      controller.abort();

      await expect(executeWithRetry(fn, "api", controller.signal)).rejects.toThrow(
        "Request was aborted",
      );
    });

    it("should not retry non-retryable non-client errors", async () => {
      const error = Object.assign(new Error("invalid"), { code: "INVALID_API_KEY" });
      const fn = vi.fn().mockRejectedValue(error);

      await expect(
        executeWithRetry(fn, {
          maxRetries: 3,
          baseDelay: 1,
          maxDelay: 10,
          backoff: "fixed",
          jitter: false,
          retryableErrors: ["NETWORK_ERROR"],
        }),
      ).rejects.toThrow("invalid");

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should abort during retry delay", async () => {
      vi.useFakeTimers();
      const networkError = Object.assign(new Error("network error"), { code: "NETWORK_ERROR" });
      const fn = vi.fn().mockRejectedValue(networkError);
      const controller = new AbortController();

      const promise = executeWithRetry(fn, {
        maxRetries: 3,
        baseDelay: 5000,
        maxDelay: 5000,
        backoff: "fixed",
        jitter: false,
        retryableErrors: ["NETWORK_ERROR"],
      }, controller.signal);

      await vi.advanceTimersByTimeAsync(100);
      controller.abort();

      await expect(promise).rejects.toThrow("Request was aborted");
      vi.useRealTimers();
    });
  });
});
