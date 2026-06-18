/**
 * R108: API client Result 模式不 throw 测试
 *
 * 回归规则: src/infrastructure/api/client.ts 中的 request 函数必须遵循 Result 模式，
 * 在任何错误情况下都返回 err() 而非 throw。
 *
 * 这确保调用方可以使用 Result 模式安全地处理错误，无需 try/catch。
 *
 * 测试场景:
 * 1. 网络错误（fetch reject）应返回 err() 而非 throw
 * 2. AppApiClientError 应返回 err() 而非 throw
 * 3. 成功响应应返回 ok(data)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

// Mock 网络配置，避免加载真实的拦截器链（lifecycle/circuitBreaker/cache/retry/logging）
vi.mock("@/infrastructure/network/profiles", () => ({
  aiApiProfile: {
    interceptors: [],
    timeout: 60000,
    retryPolicy: "api",
    circuitBreakerEnabled: false,
  },
}));

vi.stubGlobal("fetch", mockFetch);

import { apiClient, AppApiClientError } from "@/infrastructure/api/client";
import { ApiError, NetworkError } from "@/domain/types";

describe("R108: API client Result 模式不 throw", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("网络错误应返回 err() 而非 throw", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const result = await apiClient.get("/test");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(NetworkError);
      expect(result.error.message).toContain("Failed to fetch");
    }
  });

  it("AppApiClientError 应返回 err() 而非 throw", async () => {
    const apiError = new AppApiClientError("INVALID_API_KEY", "Invalid API key", 401);
    mockFetch.mockRejectedValueOnce(apiError);

    const result = await apiClient.get("/test");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ApiError);
      expect(result.error.message).toBe("Invalid API key");
      if (result.error instanceof ApiError) {
        expect(result.error.statusCode).toBe(401);
      }
    }
  });

  it("成功响应应返回 ok(data)", async () => {
    const mockData = { id: 1, name: "test" };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockData,
    } as Response);

    const result = await apiClient.get("/test");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(mockData);
    }
  });

  it("POST 请求网络错误同样应返回 err() 而非 throw", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("Network connection lost"));

    const result = await apiClient.post("/submit", { data: "value" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(NetworkError);
      expect(result.error.message).toContain("Network connection lost");
    }
  });
});
