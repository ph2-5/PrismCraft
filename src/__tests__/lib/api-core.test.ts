import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  apiCall,
  apiCallWithRetry,
  apiCallWithFallback,
  getErrorMessage,
  checkApiHealth,
  ApiClientError,
} from "@/infrastructure/ai-providers/core";
import { apiCache } from "@/infrastructure/ai-providers/api-cache";

const mockFetch = vi.fn();
const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = mockFetch;
  vi.clearAllMocks();
  apiCache.invalidateAll();
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function createMockResponse(options: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  jsonData?: unknown;
  textData?: string;
  shouldJsonThrow?: boolean;
}): Response {
  const {
    ok = true,
    status = 200,
    statusText = "OK",
    jsonData,
    textData,
    shouldJsonThrow = false,
  } = options;

  return {
    ok,
    status,
    statusText,
    json: async () => {
      if (shouldJsonThrow) {
        throw new SyntaxError("Invalid JSON");
      }
      return jsonData ?? {};
    },
    text: async () => textData ?? JSON.stringify(jsonData ?? {}),
    headers: new Headers(),
    redirected: false,
    type: "basic",
    url: "",
    clone: () => createMockResponse(options),
    body: null,
    bodyUsed: false,
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob(),
    formData: async () => new FormData(),
  } as unknown as Response;
}

describe("apiCall", () => {
  it("应携带正确的 Content-Type 请求头发送 POST 请求", async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({ jsonData: { task_id: "task_123", status: "pending" } }),
    );

    const result = await apiCall("generate-video", {
      method: "POST",
      body: JSON.stringify({ prompt: "test prompt" }),
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/generate-video",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ prompt: "test prompt" }),
      }),
    );
    expect(result).toMatchObject({ task_id: "task_123", status: "pending" });
  });

  it("GET 请求成功后应缓存结果", async () => {
    mockFetch.mockResolvedValue(
      createMockResponse({ jsonData: { providers: [] } }),
    );

    await apiCall("config");
    await apiCall("config");

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("POST 请求不应使用缓存", async () => {
    mockFetch.mockResolvedValue(
      createMockResponse({ jsonData: { task_id: "task_123" } }),
    );

    await apiCall("generate-video", {
      method: "POST",
      body: JSON.stringify({ prompt: "test" }),
    });
    await apiCall("generate-video", {
      method: "POST",
      body: JSON.stringify({ prompt: "test" }),
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("400 错误应抛出 ApiClientError 并包含 code", async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({
        ok: false,
        status: 400,
        jsonData: { error: "Missing prompt", code: "CONFIG_MISSING" },
      }),
    );

    try {
      await apiCall("generate-video", {
        method: "POST",
        body: JSON.stringify({}),
      });
      expect.fail("应抛出错误");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiClientError);
      expect((error as ApiClientError).statusCode).toBe(400);
      expect((error as ApiClientError).code).toBe("CONFIG_MISSING");
    }
  });

  it("401 错误应抛出 ApiClientError", async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({
        ok: false,
        status: 401,
        jsonData: { error: "Invalid API Key", code: "UNAUTHORIZED" },
      }),
    );

    await expect(
      apiCall("test-connection", {
        method: "POST",
        body: JSON.stringify({ api_key: "invalid" }),
      }),
    ).rejects.toThrow(ApiClientError);
  });

  it("429 错误应抛出 ApiClientError 并包含限流信息", async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({
        ok: false,
        status: 429,
        jsonData: { error: "Too Many Requests" },
      }),
    );

    try {
      await apiCall("test-connection");
      expect.fail("应抛出错误");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiClientError);
      expect((error as ApiClientError).statusCode).toBe(429);
    }
  });

  it("500 错误且服务端未返回 error 字段时应显示 HTTP 状态码", async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({
        ok: false,
        status: 500,
        jsonData: { code: "INTERNAL_ERROR" },
      }),
    );

    try {
      await apiCall("test-connection");
      expect.fail("应抛出错误");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiClientError);
      expect((error as ApiClientError).message).toBe("HTTP 500");
      expect((error as ApiClientError).statusCode).toBe(500);
    }
  });

  it("500 错误且服务端返回 error 字段时应显示该字段", async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({
        ok: false,
        status: 500,
        jsonData: { error: "Database connection failed" },
      }),
    );

    try {
      await apiCall("test-connection");
      expect.fail("应抛出错误");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiClientError);
      expect((error as ApiClientError).message).toBe("Database connection failed");
    }
  });

  it("非 JSON 响应应抛出格式错误", async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({
        ok: true,
        status: 200,
        textData: "not json",
        shouldJsonThrow: true,
      }),
    );

    await expect(apiCall("test-connection")).rejects.toThrow("响应格式错误");
  });

  it("超时应抛出 TIMEOUT 错误", async () => {
    mockFetch.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          const error = new Error("The operation was aborted");
          error.name = "AbortError";
          setTimeout(() => reject(error), 100);
        }),
    );

    await expect(
      apiCall("test-connection", { timeout: 50 }),
    ).rejects.toThrow("请求超时");
  });

  it("网络错误且不在可队列端点列表中时应直接抛出错误", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    Object.defineProperty(navigator, "onLine", { value: false, writable: true, configurable: true });

    await expect(
      apiCall("config", { method: "GET" }),
    ).rejects.toThrow("Failed to fetch");

    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
  });
});

describe("apiCallWithRetry", () => {
  it("成功时不应重试", async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({ jsonData: { task_id: "task_123" } }),
    );

    const result = await apiCallWithRetry("generate-video", {
      method: "POST",
      body: JSON.stringify({ prompt: "test" }),
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ task_id: "task_123" });
  });

  it("429 错误时应重试并最终成功", async () => {
    mockFetch
      .mockResolvedValueOnce(
        createMockResponse({
          ok: false,
          status: 429,
          jsonData: { error: "Too Many Requests" },
        }),
      )
      .mockResolvedValueOnce(
        createMockResponse({ jsonData: { task_id: "retry_success" } }),
      );

    const result = await apiCallWithRetry("generate-video", {
      method: "POST",
      body: JSON.stringify({ prompt: "test" }),
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ task_id: "retry_success" });
  });

  it("429 重试时应使用至少 5000ms 的延迟", async () => {
    const startTime = Date.now();
    mockFetch
      .mockResolvedValueOnce(
        createMockResponse({
          ok: false,
          status: 429,
          jsonData: { error: "Too Many Requests" },
        }),
      )
      .mockResolvedValueOnce(
        createMockResponse({ jsonData: { task_id: "retry_success" } }),
      );

    await apiCallWithRetry("generate-video", {
      method: "POST",
      body: JSON.stringify({ prompt: "test" }),
    });

    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeGreaterThanOrEqual(2500);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("408 超时错误时应重试", async () => {
    mockFetch
      .mockImplementationOnce(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error("AbortError")), 100);
        });
      })
      .mockResolvedValueOnce(
        createMockResponse({ jsonData: { task_id: "timeout_success" } }),
      );

    const result = await apiCallWithRetry(
      "generate-video",
      {
        method: "POST",
        body: JSON.stringify({ prompt: "test" }),
        timeout: 50,
      },
      3,
    );

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ task_id: "timeout_success" });
  });

  it("400 客户端错误不应重试", async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({
        ok: false,
        status: 400,
        jsonData: { error: "Bad Request", code: "CONFIG_MISSING" },
      }),
    );

    await expect(
      apiCallWithRetry("generate-video", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    ).rejects.toThrow(ApiClientError);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("达到最大重试次数后应抛出最后错误", async () => {
    mockFetch.mockResolvedValue(
      createMockResponse({
        ok: false,
        status: 503,
        jsonData: { error: "Service Unavailable" },
      }),
    );

    await expect(
      apiCallWithRetry(
        "generate-video",
        {
          method: "POST",
          body: JSON.stringify({ prompt: "test" }),
        },
        2,
      ),
    ).rejects.toThrow("Service Unavailable");

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("非 429/408 的服务器错误应使用指数退避重试", async () => {
    const startTime = Date.now();
    mockFetch
      .mockResolvedValueOnce(
        createMockResponse({
          ok: false,
          status: 503,
          jsonData: { error: "Service Unavailable" },
        }),
      )
      .mockResolvedValueOnce(
        createMockResponse({ jsonData: { task_id: "success" } }),
      );

    await apiCallWithRetry(
      "generate-video",
      {
        method: "POST",
        body: JSON.stringify({ prompt: "test" }),
      },
      2,
    );

    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeGreaterThanOrEqual(500);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe("apiCallWithFallback", () => {
  it("第一个提供商成功时不应尝试后续", async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({ jsonData: { task_id: "task_123" } }),
    );

    const result = await apiCallWithFallback([
      {
        endpoint: "generate-video",
        options: {
          method: "POST",
          body: JSON.stringify({ prompt: "test" }),
        },
      },
    ]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ task_id: "task_123" });
  });

  it("第一个失败时应尝试第二个提供商", async () => {
    mockFetch
      .mockResolvedValueOnce(
        createMockResponse({
          ok: false,
          status: 500,
          jsonData: { error: "Primary failed" },
        }),
      )
      .mockResolvedValueOnce(
        createMockResponse({ jsonData: { task_id: "fallback_success" } }),
      );

    const result = await apiCallWithFallback([
      {
        endpoint: "generate-video",
        options: {
          method: "POST",
          body: JSON.stringify({ prompt: "test" }),
        },
      },
      {
        endpoint: "generate-image",
        options: {
          method: "POST",
          body: JSON.stringify({ prompt: "test" }),
        },
      },
    ]);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ task_id: "fallback_success" });
  });

  it("所有提供商均失败时应抛出错误", async () => {
    mockFetch.mockResolvedValue(
      createMockResponse({
        ok: false,
        status: 500,
        jsonData: { error: "Failed" },
      }),
    );

    await expect(
      apiCallWithFallback([
        {
          endpoint: "generate-video",
          options: { method: "POST", body: JSON.stringify({ prompt: "test" }) },
        },
        {
          endpoint: "generate-image",
          options: { method: "POST", body: JSON.stringify({ prompt: "test" }) },
        },
      ]),
    ).rejects.toThrow();

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe("getErrorMessage", () => {
  it("400 + CONFIG_MISSING 应返回 API 未配置提示", () => {
    const error = new ApiClientError("Missing config", 400, "CONFIG_MISSING");
    expect(getErrorMessage(error)).toBe("API 未配置，请先在设置中配置 API Key");
  });

  it("400 无 code 时应返回通用参数错误", () => {
    const error = new ApiClientError("Invalid prompt", 400);
    expect(getErrorMessage(error)).toBe("请求参数错误: Invalid prompt");
  });

  it("401 应返回 API Key 无效提示", () => {
    const error = new ApiClientError("Unauthorized", 401);
    expect(getErrorMessage(error)).toBe("API Key 无效或已过期，请检查设置");
  });

  it("403 应返回权限提示", () => {
    const error = new ApiClientError("Forbidden", 403);
    expect(getErrorMessage(error)).toBe("没有权限访问该资源");
  });

  it("404 应返回资源不存在提示", () => {
    const error = new ApiClientError("Not Found", 404);
    expect(getErrorMessage(error)).toBe("请求的资源不存在");
  });

  it("408 应返回超时提示", () => {
    const error = new ApiClientError("Timeout", 408);
    expect(getErrorMessage(error)).toBe("请求超时，请检查网络连接后重试");
  });

  it("429 应返回限流提示", () => {
    const error = new ApiClientError("Too Many Requests", 429);
    expect(getErrorMessage(error)).toBe("请求过于频繁，请稍后再试");
  });

  it("500 应返回服务器错误提示", () => {
    const error = new ApiClientError("Server Error", 500);
    expect(getErrorMessage(error)).toBe("服务器错误: Server Error");
  });

  it("503 应返回服务不可用提示", () => {
    const error = new ApiClientError("Service Unavailable", 503);
    expect(getErrorMessage(error)).toBe("服务暂时不可用，请稍后再试");
  });

  it("网络错误应返回网络连接失败提示", () => {
    const error = new Error("Failed to fetch");
    expect(getErrorMessage(error)).toBe("网络连接失败，请检查网络设置");
  });

  it("未知错误应返回通用提示", () => {
    expect(getErrorMessage("unknown")).toBe("未知错误");
  });
});

describe("checkApiHealth", () => {
  it("API 正常时应返回 true", async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({ jsonData: { status: "ok" } }),
    );

    const result = await checkApiHealth();
    expect(result).toBe(true);
  });

  it("API 异常时应返回 false", async () => {
    mockFetch.mockImplementationOnce(() => {
      return Promise.reject(new Error("Network error"));
    });

    const result = await checkApiHealth();
    expect(result).toBe(false);
  });
});
