import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withRetry, isRetryableError } from "../api-gateway-retry";

function createHttpError(statusCode: number, message = `HTTP ${statusCode}`) {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

function createNetworkError(code: string, message = code) {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

describe("isRetryableError", () => {
  it("returns true for 429", () => {
    expect(isRetryableError(createHttpError(429))).toBe(true);
  });

  it("returns true for 502", () => {
    expect(isRetryableError(createHttpError(502))).toBe(true);
  });

  it("returns true for 503", () => {
    expect(isRetryableError(createHttpError(503))).toBe(true);
  });

  it("returns true for 504", () => {
    expect(isRetryableError(createHttpError(504))).toBe(true);
  });

  it("returns true for 500 (5xx)", () => {
    expect(isRetryableError(createHttpError(500))).toBe(true);
  });

  it("returns false for 400", () => {
    expect(isRetryableError(createHttpError(400))).toBe(false);
  });

  it("returns false for 401", () => {
    expect(isRetryableError(createHttpError(401))).toBe(false);
  });

  it("returns false for 403", () => {
    expect(isRetryableError(createHttpError(403))).toBe(false);
  });

  it("returns false for 404", () => {
    expect(isRetryableError(createHttpError(404))).toBe(false);
  });

  it("returns true for ECONNREFUSED", () => {
    expect(isRetryableError(createNetworkError("ECONNREFUSED"))).toBe(true);
  });

  it("returns true for ECONNRESET", () => {
    expect(isRetryableError(createNetworkError("ECONNRESET"))).toBe(true);
  });

  it("returns true for ETIMEDOUT", () => {
    expect(isRetryableError(createNetworkError("ETIMEDOUT"))).toBe(true);
  });

  it("returns true for ENOTFOUND", () => {
    expect(isRetryableError(createNetworkError("ENOTFOUND"))).toBe(true);
  });

  it("returns true for ECONNABORTED", () => {
    expect(isRetryableError(createNetworkError("ECONNABORTED"))).toBe(true);
  });

  it("returns true for EPIPE", () => {
    expect(isRetryableError(createNetworkError("EPIPE"))).toBe(true);
  });

  it("returns true for EAI_AGAIN", () => {
    expect(isRetryableError(createNetworkError("EAI_AGAIN"))).toBe(true);
  });

  it("returns true for timeout message pattern", () => {
    expect(isRetryableError(new Error("Request timeout"))).toBe(true);
  });

  it("returns true for rate limit message pattern", () => {
    expect(isRetryableError(new Error("rate_limit exceeded"))).toBe(true);
  });

  it("returns true for 503 message pattern", () => {
    expect(isRetryableError(new Error("service_unavailable"))).toBe(true);
  });

  it("returns false for non-Error values", () => {
    expect(isRetryableError("string error")).toBe(false);
    expect(isRetryableError(42)).toBe(false);
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
  });

  it("returns false for unknown error without retryable indicators", () => {
    expect(isRetryableError(new Error("something went wrong"))).toBe(false);
  });
});

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("succeeds on first attempt without retry", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 and succeeds on 2nd attempt", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(createHttpError(429))
      .mockResolvedValueOnce("ok");

    const promise = withRetry(fn, { baseDelay: 100 });
    await vi.advanceTimersByTimeAsync(500);

    const result = await promise;
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on ECONNRESET and succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(createNetworkError("ECONNRESET"))
      .mockResolvedValueOnce("ok");

    const promise = withRetry(fn, { baseDelay: 100 });
    await vi.advanceTimersByTimeAsync(500);

    const result = await promise;
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry on 400 client error", async () => {
    const fn = vi.fn().mockRejectedValue(createHttpError(400));

    await expect(withRetry(fn, { baseDelay: 100 })).rejects.toThrow("HTTP 400");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry on 401 unauthorized", async () => {
    const fn = vi.fn().mockRejectedValue(createHttpError(401));

    await expect(withRetry(fn, { baseDelay: 100 })).rejects.toThrow("HTTP 401");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("exhausts maxRetries and throws last error", async () => {
    const fn = vi.fn().mockRejectedValue(createHttpError(429));

    const promise = withRetry(fn, { maxRetries: 2, baseDelay: 100 });
    promise.catch(() => {});

    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(2000);

    await expect(promise).rejects.toThrow("HTTP 429");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("uses exponential backoff with increasing delays", async () => {
    const fn = vi.fn().mockRejectedValue(createHttpError(503));
    const delays: number[] = [];

    const originalSetTimeout = globalThis.setTimeout;
    const spy = vi.spyOn(globalThis, "setTimeout").mockImplementation((cb: () => void, ms?: number) => {
      if (ms !== undefined && ms > 0) delays.push(ms);
      return originalSetTimeout(cb, ms);
    });

    const promise = withRetry(fn, { maxRetries: 2, baseDelay: 1000 });
    promise.catch(() => {});

    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);

    await expect(promise).rejects.toThrow("HTTP 503");

    expect(delays.length).toBe(2);
    expect(delays[0]!).toBeGreaterThanOrEqual(1000 * 0.5);
    expect(delays[0]!).toBeLessThanOrEqual(1000 * 1.0);
    expect(delays[1]!).toBeGreaterThanOrEqual(2000 * 0.5);
    expect(delays[1]!).toBeLessThanOrEqual(2000 * 1.0);

    spy.mockRestore();
  });

  it("supports custom retryableCheck override", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(createHttpError(400))
      .mockResolvedValueOnce("recovered");

    const customCheck = (error: unknown) => {
      if (error instanceof Error && "statusCode" in error) {
        return (error as Error & { statusCode: number }).statusCode === 400;
      }
      return false;
    };

    const promise = withRetry(fn, { retryableCheck: customCheck, baseDelay: 100 });
    await vi.advanceTimersByTimeAsync(500);

    const result = await promise;
    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("custom retryableCheck returning false prevents retry", async () => {
    const fn = vi.fn().mockRejectedValue(createHttpError(429));

    const customCheck = () => false;

    await expect(withRetry(fn, { retryableCheck: customCheck, baseDelay: 100 })).rejects.toThrow("HTTP 429");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
