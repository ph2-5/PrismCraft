import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockApiCache,
  mockEnqueueRequest,
  mockIsNetworkError,
  mockIsElectron,
  mockExtractErrorMessage,
  mockExecuteThroughCircuit,
  mockExecuteWithRetry,
} = vi.hoisted(() => ({
  mockApiCache: {
    get: vi.fn(),
    set: vi.fn(),
    invalidate: vi.fn(),
    invalidateAll: vi.fn(),
  },
  mockEnqueueRequest: vi.fn(),
  mockIsNetworkError: vi.fn(() => false),
  mockIsElectron: vi.fn(() => true),
  mockExtractErrorMessage: vi.fn((e: unknown) => {
    if (e instanceof Error) return e.message;
    if (typeof e === "string") return e;
    return "Unknown error";
  }),
  mockExecuteThroughCircuit: vi.fn((_providerId: string, fn: () => Promise<Response>) => fn()),
  mockExecuteWithRetry: vi.fn(<T>(fn: () => Promise<T>) => fn()),
}));

vi.mock("@/infrastructure/ai-providers/api-cache", () => ({
  apiCache: mockApiCache,
}));

vi.mock("@/infrastructure/ai-providers/offline-queue", () => ({
  enqueueRequest: mockEnqueueRequest,
}));

vi.mock("@/shared/utils/platform", () => ({
  isElectron: mockIsElectron,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { warn: vi.fn(), error: vi.fn() },
  extractErrorMessage: mockExtractErrorMessage,
}));

vi.mock("@/shared/utils/error-classifier", () => ({
  isNetworkError: mockIsNetworkError,
}));

vi.mock("@/config/constants", () => ({
  API_SERVER_PORT: 3456,
  ELECTRON_APP_HEADERS: { "X-Electron-App": "test" },
}));

vi.mock("@/infrastructure/network/circuit-breaker", () => ({
  executeThroughCircuit: mockExecuteThroughCircuit,
}));

vi.mock("@/infrastructure/network/retry-executor", () => ({
  executeWithRetry: mockExecuteWithRetry,
}));

import { apiCall, apiCallWithRetry, apiCallWithFallback, getErrorMessage, checkApiHealth, isQueuedResponse, ApiClientError } from "../core";

describe("ai-providers/core", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiCache.get.mockReturnValue(null);
    mockExecuteThroughCircuit.mockImplementation((_providerId: string, fn: () => Promise<Response>) => fn());
    mockExecuteWithRetry.mockImplementation(<T>(fn: () => Promise<T>) => fn());
    globalThis.fetch = vi.fn();
  });

  describe("isQueuedResponse", () => {
    it("returns true for valid queued response", () => {
      expect(isQueuedResponse({ success: false, error: "x", message: "y", queued: true, queueId: "q1" })).toBe(true);
    });

    it("returns false for null", () => {
      expect(isQueuedResponse(null)).toBe(false);
    });

    it("returns false for non-object", () => {
      expect(isQueuedResponse("string")).toBe(false);
    });

    it("returns false when queued is false", () => {
      expect(isQueuedResponse({ queued: false })).toBe(false);
    });

    it("returns false when queued property missing", () => {
      expect(isQueuedResponse({ success: true })).toBe(false);
    });
  });

  describe("apiCall", () => {
    it("returns cached data for GET when cache hit and not stale", async () => {
      mockApiCache.get.mockReturnValue({ data: { result: "cached" }, stale: false });

      const result = await apiCall<{ result: string }>("test-endpoint");

      expect(result).toEqual({ result: "cached" });
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("proceeds with fetch when cache is stale", async () => {
      mockApiCache.get.mockReturnValue({ data: { result: "stale" }, stale: true });
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ result: "fresh" }),
        status: 200,
      } as Response);

      const result = await apiCall<{ result: string }>("test-endpoint");

      expect(result).toEqual({ result: "fresh" });
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    it("skips cache for non-GET methods", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ result: "ok" }),
        status: 200,
      } as Response);

      await apiCall("test-endpoint", { method: "POST", body: "{}" });

      expect(mockApiCache.get).not.toHaveBeenCalled();
    });

    it("caches response for GET requests", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ result: "data" }),
        status: 200,
      } as Response);

      await apiCall("test-endpoint");

      expect(mockApiCache.set).toHaveBeenCalledWith("test-endpoint", { result: "data" }, { body: undefined });
    });

    it("does not cache response for POST requests", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ result: "data" }),
        status: 200,
      } as Response);

      await apiCall("test-endpoint", { method: "POST" });

      expect(mockApiCache.set).not.toHaveBeenCalled();
    });

    it("throws ApiClientError on non-ok response with JSON error", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: "Bad Request", code: "INVALID" }),
      } as Response);

      try {
        await apiCall("test-endpoint");
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ApiClientError);
        expect((e as ApiClientError).message).toBe("Bad Request");
        expect((e as ApiClientError).statusCode).toBe(400);
        expect((e as ApiClientError).code).toBe("INVALID");
      }
    });

    it("falls back to HTTP status when error field is empty", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: false,
        status: 422,
        json: () => Promise.resolve({ error: "", code: "VALIDATION" }),
      } as Response);

      try {
        await apiCall("test-endpoint");
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ApiClientError);
        expect((e as ApiClientError).message).toBe("HTTP 422");
        expect((e as ApiClientError).statusCode).toBe(422);
      }
    });

    it("handles JSON parse failure on error response with text fallback", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error("parse error")),
        text: () => Promise.resolve("Internal Server Error"),
      } as Response);

      try {
        await apiCall("test-endpoint");
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ApiClientError);
        expect((e as ApiClientError).message).toBe("Internal Server Error");
        expect((e as ApiClientError).statusCode).toBe(500);
      }
    });

    it("handles JSON parse failure with text fallback also failing", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: false,
        status: 502,
        json: () => Promise.reject(new Error("parse error")),
        text: () => Promise.reject(new Error("text error")),
      } as Response);

      try {
        await apiCall("test-endpoint");
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ApiClientError);
        expect((e as ApiClientError).message).toBe("HTTP 502");
      }
    });

    it("throws ApiClientError on successful response JSON parse failure", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new Error("JSON parse error")),
      } as Response);

      try {
        await apiCall("test-endpoint");
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ApiClientError);
        expect((e as ApiClientError).code).toBe("INVALID_RESPONSE");
      }
    });

    it("throws timeout error on AbortError", async () => {
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      vi.mocked(globalThis.fetch).mockRejectedValue(abortError);

      try {
        await apiCall("test-endpoint", { timeout: 100 });
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ApiClientError);
        expect((e as ApiClientError).statusCode).toBe(408);
        expect((e as ApiClientError).code).toBe("TIMEOUT");
      }
    });

    it("re-throws ApiClientError as-is", async () => {
      const apiError = new ApiClientError("test error", 400);
      vi.mocked(globalThis.fetch).mockRejectedValue(apiError);

      await expect(apiCall("test-endpoint")).rejects.toBe(apiError);
    });

    it("queues request on network error for queueable endpoint", async () => {
      mockIsNetworkError.mockReturnValue(true);
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error("Network error"));
      mockEnqueueRequest.mockResolvedValue("queue-id-1");

      const result = await apiCall("generate-image", { body: '{"prompt":"test"}' });

      expect(mockEnqueueRequest).toHaveBeenCalled();
      expect(isQueuedResponse(result)).toBe(true);
    });

    it("queues request when offline for queueable endpoint", async () => {
      const originalOnLine = navigator.onLine;
      Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error("offline"));
      mockEnqueueRequest.mockResolvedValue("queue-id-2");

      const result = await apiCall("generate-video");

      expect(isQueuedResponse(result)).toBe(true);
      Object.defineProperty(navigator, "onLine", { value: originalOnLine, configurable: true });
    });

    it("queues request on circuit breaker open error for queueable endpoint", async () => {
      const circuitError = Object.assign(
        new Error("Circuit breaker is open for provider: generate-image"),
        { code: "CIRCUIT_OPEN" as const },
      );
      mockExecuteThroughCircuit.mockRejectedValue(circuitError);
      mockEnqueueRequest.mockResolvedValue("queue-id-circuit");

      const result = await apiCall("generate-image");

      expect(mockEnqueueRequest).toHaveBeenCalled();
      expect(isQueuedResponse(result)).toBe(true);
    });

    it("handles body parse failure in queue by using raw body", async () => {
      mockIsNetworkError.mockReturnValue(true);
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error("Network error"));
      mockEnqueueRequest.mockResolvedValue("queue-id-3");

      await apiCall("generate-text", { body: "not-json-body" });

      expect(mockEnqueueRequest).toHaveBeenCalledWith(
        "generate-text",
        expect.objectContaining({ _rawBody: "not-json-body", _rawBodyType: "string" }),
      );
    });

    it("throws generic error on network error for non-queueable endpoint", async () => {
      mockIsNetworkError.mockReturnValue(true);
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error("Network error"));

      await expect(apiCall("non-queueable-endpoint")).rejects.toThrow(ApiClientError);
    });

    it("throws generic error when enqueueRequest returns null", async () => {
      mockIsNetworkError.mockReturnValue(true);
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error("Network error"));
      mockEnqueueRequest.mockResolvedValue(null);

      await expect(apiCall("generate-image")).rejects.toThrow(ApiClientError);
    });

    it("throws generic error when enqueueRequest throws", async () => {
      mockIsNetworkError.mockReturnValue(true);
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error("Network error"));
      mockEnqueueRequest.mockRejectedValue(new Error("Queue error"));

      await expect(apiCall("generate-image")).rejects.toThrow(ApiClientError);
    });

    it("uses correct base URL in Electron mode", async () => {
      mockIsElectron.mockReturnValue(true);
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: 1 }),
        status: 200,
      } as Response);

      await apiCall("test");

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:3456/api/test",
        expect.any(Object),
      );
    });

    it("uses empty base URL in non-Electron mode", async () => {
      mockIsElectron.mockReturnValue(false);
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: 1 }),
        status: 200,
      } as Response);

      await apiCall("test");

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/test",
        expect.any(Object),
      );
    });

    it("clears timeout in finally block", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: 1 }),
        status: 200,
      } as Response);

      const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
      await apiCall("test");
      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it("passes endpoint as providerId to executeThroughCircuit", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: 1 }),
        status: 200,
      } as Response);

      await apiCall("generate-image");

      expect(mockExecuteThroughCircuit).toHaveBeenCalledWith(
        "generate-image",
        expect.any(Function),
      );
    });

    it("adds statusCodeToErrorCode for 429 responses", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ error: "Rate limited" }),
      } as Response);

      try {
        await apiCall("test-endpoint");
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ApiClientError);
        expect((e as ApiClientError).code).toBe("RATE_LIMITED");
      }
    });

    it("adds statusCodeToErrorCode for 500 responses", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: "Internal error" }),
      } as Response);

      try {
        await apiCall("test-endpoint");
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ApiClientError);
        expect((e as ApiClientError).code).toBe("API_SERVER_ERROR");
      }
    });
  });

  describe("apiCallWithRetry", () => {
    it("returns result on first try", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ value: 1 }),
        status: 200,
      } as Response);

      const result = await apiCallWithRetry("test");
      expect(result).toEqual({ value: 1 });
    });

    it("delegates to executeWithRetry with correct policy", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ value: 1 }),
        status: 200,
      } as Response);

      await apiCallWithRetry("test", {}, 5);

      expect(mockExecuteWithRetry).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ maxRetries: 5 }),
      );
    });

    it("uses default retries of 3", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ value: 1 }),
        status: 200,
      } as Response);

      await apiCallWithRetry("test");

      expect(mockExecuteWithRetry).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ maxRetries: 3 }),
      );
    });
  });

  describe("apiCallWithFallback", () => {
    it("returns result from first successful endpoint", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: "from-first" }),
        status: 200,
      } as Response);

      const result = await apiCallWithFallback([
        { endpoint: "provider-a" },
        { endpoint: "provider-b" },
      ]);

      expect(result).toEqual({ data: "from-first" });
    });

    it("falls back to next endpoint on failure", async () => {
      vi.useFakeTimers();
      vi.mocked(globalThis.fetch)
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: "from-second" }),
          status: 200,
        } as Response);

      const promise = apiCallWithFallback([
        { endpoint: "provider-a" },
        { endpoint: "provider-b" },
      ], 1);
      await vi.advanceTimersByTimeAsync(5000);
      const result = await promise;

      expect(result).toEqual({ data: "from-second" });
      vi.useRealTimers();
    });

    it("throws last error when all endpoints fail", async () => {
      const apiError = new ApiClientError("all fail", 500);
      vi.mocked(globalThis.fetch).mockRejectedValue(apiError);

      await expect(apiCallWithFallback([
        { endpoint: "provider-a" },
        { endpoint: "provider-b" },
      ], 1)).rejects.toThrow("all fail");
    });
  });

  describe("getErrorMessage", () => {
    it("handles 400 with CONFIG_MISSING code", () => {
      const error = new ApiClientError("missing", 400, "CONFIG_MISSING");
      expect(getErrorMessage(error)).toBe("API 未配置，请先在设置中配置 API Key");
    });

    it("handles 400 without CONFIG_MISSING code", () => {
      const error = new ApiClientError("bad request", 400);
      expect(getErrorMessage(error)).toBe("请求参数错误: bad request");
    });

    it("handles 401", () => {
      const error = new ApiClientError("unauthorized", 401);
      expect(getErrorMessage(error)).toBe("API Key 无效或已过期，请检查设置");
    });

    it("handles 403", () => {
      const error = new ApiClientError("forbidden", 403);
      expect(getErrorMessage(error)).toBe("没有权限访问该资源");
    });

    it("handles 404", () => {
      const error = new ApiClientError("not found", 404);
      expect(getErrorMessage(error)).toBe("请求的资源不存在");
    });

    it("handles 408", () => {
      const error = new ApiClientError("timeout", 408);
      expect(getErrorMessage(error)).toBe("请求超时，请检查网络连接后重试");
    });

    it("handles 429", () => {
      const error = new ApiClientError("rate limited", 429);
      expect(getErrorMessage(error)).toBe("请求过于频繁，请稍后再试");
    });

    it("handles 500", () => {
      const error = new ApiClientError("internal error", 500);
      expect(getErrorMessage(error)).toBe("服务器错误: internal error");
    });

    it("handles 503", () => {
      const error = new ApiClientError("unavailable", 503);
      expect(getErrorMessage(error)).toBe("服务暂时不可用，请稍后再试");
    });

    it("handles unknown status code", () => {
      const error = new ApiClientError("custom error", 418);
      expect(getErrorMessage(error)).toBe("custom error");
    });

    it("handles unknown status code with empty message", () => {
      const error = new ApiClientError("", 418);
      expect(getErrorMessage(error)).toBe("请求失败");
    });

    it("handles network error", () => {
      mockIsNetworkError.mockReturnValue(true);
      const error = new Error("Failed to fetch");
      expect(getErrorMessage(error)).toBe("网络连接失败，请检查网络设置");
    });

    it("handles generic Error", () => {
      mockIsNetworkError.mockReturnValue(false);
      const error = new Error("something went wrong");
      expect(getErrorMessage(error)).toBe("something went wrong");
    });

    it("handles non-Error value", () => {
      expect(getErrorMessage("string error")).toBe("未知错误");
    });
  });

  describe("checkApiHealth", () => {
    it("returns true on successful API call", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
        status: 200,
      } as Response);

      expect(await checkApiHealth()).toBe(true);
    });

    it("returns false on failed API call", async () => {
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error("fail"));

      expect(await checkApiHealth()).toBe(false);
    });
  });
});
