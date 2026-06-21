/**
 * R134: HTTP 状态码规范化
 * 回归防护: 确保 API server 在 handler 返回 { success: false } 时使用 HTTP 400
 *           状态码（而非 200），且 httpStatus 字段优先级最高。
 *
 * 攻击场景：若 handler 返回 { success: false } 但 HTTP 状态码为 200，客户端
 * 可能将错误响应当作成功处理，导致数据不一致或安全检查被绕过。例如认证失败
 * 返回 200 可能让客户端误认为已认证。
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import http from "http";

// 测试端口
const TEST_PORT = 18998;

// 提升 mock
const { mockRoutes, mockHandleCors, mockCheckAuthHeader, mockCheckRateLimit } = vi.hoisted(() => ({
  mockRoutes: {} as Record<string, unknown>,
  mockHandleCors: vi.fn(() => true),
  mockCheckAuthHeader: vi.fn(() => true),
  mockCheckRateLimit: vi.fn(() => true),
}));

vi.mock("../../logging", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("../../config/ports", () => ({
  API_SERVER_PORT: TEST_PORT,
  APP_SERVER_PORT: 18999,
  DEV_SERVER_PORT: 19000,
}));

vi.mock("../../database", () => ({
  getDb: vi.fn(() => ({
    pragma: vi.fn(() => ({ schema_version: 1 })),
  })),
  CURRENT_SCHEMA_VERSION: 1,
}));

vi.mock("../routes", () => ({
  routes: mockRoutes,
}));

vi.mock("../middleware", () => ({
  handleCors: mockHandleCors,
  checkAuthHeader: mockCheckAuthHeader,
  checkRateLimit: mockCheckRateLimit,
  trackConnection: vi.fn(),
  destroyAllConnections: vi.fn(),
  registerAllowedOrigin: vi.fn(),
}));

function makeHttpRequest(
  port: number,
  path: string,
  method: string,
  body?: unknown,
): Promise<{ statusCode: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path,
        method,
        headers: { "Content-Type": "application/json" },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const responseBody = Buffer.concat(chunks).toString("utf-8");
          try {
            resolve({
              statusCode: res.statusCode || 0,
              body: JSON.parse(responseBody),
            });
          } catch {
            resolve({ statusCode: res.statusCode || 0, body: responseBody });
          }
        });
      },
    );
    req.on("error", reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

describe("R134: HTTP 状态码规范化", () => {
  let serverModule: typeof import("../server");
  let apiPort: number;

  beforeAll(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    serverModule = await import("../server");
    apiPort = (serverModule as unknown as { API_PORT: number }).API_PORT;
    await serverModule.startApiServer();
  });

  afterAll(async () => {
    await serverModule.stopApiServer();
  });

  afterEach(() => {
    // 清理 routes
    for (const key of Object.keys(mockRoutes)) {
      delete mockRoutes[key];
    }
  });

  it("handler 返回 { success: true } 时 HTTP 状态码应为 200", async () => {
    mockRoutes["test-success"] = {
      handler: async () => ({ success: true, data: "ok" }),
      methods: ["GET", "POST"],
    };

    const response = await makeHttpRequest(apiPort, "/test-success", "GET");
    expect(response.statusCode).toBe(200);
    expect((response.body as { success: boolean }).success).toBe(true);
  });

  it("handler 返回 { success: false } 时 HTTP 状态码应为 400", async () => {
    mockRoutes["test-failure"] = {
      handler: async () => ({ success: false, error: "Something went wrong" }),
      methods: ["GET", "POST"],
    };

    const response = await makeHttpRequest(apiPort, "/test-failure", "GET");
    expect(response.statusCode).toBe(400);
    expect((response.body as { success: boolean }).success).toBe(false);
  });

  it("handler 返回 { success: false, httpStatus: 500 } 时 HTTP 状态码应为 500", async () => {
    mockRoutes["test-http-500"] = {
      handler: async () => ({
        success: false,
        error: "Internal error",
        httpStatus: 500,
      }),
      methods: ["GET", "POST"],
    };

    const response = await makeHttpRequest(apiPort, "/test-http-500", "GET");
    expect(response.statusCode).toBe(500);
    expect((response.body as { success: boolean }).success).toBe(false);
  });

  it("handler 返回 { success: true, httpStatus: 201 } 时 HTTP 状态码应为 201", async () => {
    mockRoutes["test-http-201"] = {
      handler: async () => ({
        success: true,
        data: "created",
        httpStatus: 201,
      }),
      methods: ["GET", "POST"],
    };

    const response = await makeHttpRequest(apiPort, "/test-http-201", "GET");
    expect(response.statusCode).toBe(201);
    expect((response.body as { success: boolean }).success).toBe(true);
  });

  it("httpStatus 字段优先级应高于 success 字段", async () => {
    // success: true 但 httpStatus: 404 → 应返回 404
    mockRoutes["test-priority"] = {
      handler: async () => ({
        success: true,
        data: "ok",
        httpStatus: 404,
      }),
      methods: ["GET", "POST"],
    };

    const response = await makeHttpRequest(apiPort, "/test-priority", "GET");
    expect(response.statusCode).toBe(404);
  });

  it("handler 返回不含 success 字段时 HTTP 状态码应为 200", async () => {
    mockRoutes["test-no-success"] = {
      handler: async () => ({ data: "ok" }),
      methods: ["GET", "POST"],
    };

    const response = await makeHttpRequest(apiPort, "/test-no-success", "GET");
    // success !== false means success (default)
    expect(response.statusCode).toBe(200);
  });

  it("handler 返回 { success: false } 不含 httpStatus 时默认为 400", async () => {
    mockRoutes["test-default-400"] = {
      handler: async () => ({ success: false, error: "bad request" }),
      methods: ["GET", "POST"],
    };

    const response = await makeHttpRequest(apiPort, "/test-default-400", "GET");
    expect(response.statusCode).toBe(400);
  });

  it("handler 抛出异常时 HTTP 状态码应为 500", async () => {
    mockRoutes["test-throw"] = {
      handler: async () => {
        throw new Error("Unexpected error");
      },
      methods: ["GET", "POST"],
    };

    const response = await makeHttpRequest(apiPort, "/test-throw", "GET");
    expect(response.statusCode).toBe(500);
    expect((response.body as { success: boolean }).success).toBe(false);
  });
});
