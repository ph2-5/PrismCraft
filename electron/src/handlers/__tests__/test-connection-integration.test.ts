/**
 * handleTestConnection 集成测试 - 真实 HTTP 链路验证
 *
 * 验证 test-connection 处理器在真实 HTTP 请求链路中的行为，覆盖盲区：
 * - lightweight 模式下不同 provider（OpenAI/Anthropic/Google）的请求构造差异
 * - capability 模式（text/image/video）的端点构造
 * - SSRF 防护：私有 IP 应被拦截
 * - 各种 HTTP 响应状态码处理（200/401/429/500）
 * - apiKey 缺失、网络错误等边界场景
 *
 * 测试策略：
 * - 启动本地 mock HTTP 服务器模拟云端 API
 * - mock loadConfigAsync 返回空配置（避免依赖真实配置文件）
 * - 保留真实的 pluginRegistry（验证 provider 选择和请求构造差异）
 * - 本地服务器地址通过 handleTestConnection 内部 registerUserEndpoint 注册到 SSRF 白名单
 */
import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from "vitest";
import http from "http";
import type { IncomingMessage } from "http";

// mock loadConfigAsync 返回空配置，避免依赖真实配置文件
vi.mock("../config", () => ({
  loadConfigAsync: vi.fn(async () => ({
    providers: [],
    mapping: {},
    capabilities: {},
  })),
  loadConfig: vi.fn(() => ({
    providers: [],
    mapping: {},
    capabilities: {},
  })),
  saveConfig: vi.fn(() => true),
  saveConfigAsync: vi.fn(async () => true),
  handleConfig: vi.fn(),
  handleSecureConfig: vi.fn(),
  getConfigFile: vi.fn(() => "/tmp/test-config.json"),
  getConfigDir: vi.fn(() => "/tmp"),
}));

// mock logger 避免日志输出干扰测试
vi.mock("../../logging/logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { handleTestConnection } from "../test-connection";

/** mock 服务器配置：根据 path + headers 返回指定状态码 */
interface MockServerConfig {
  /** 路径匹配规则（精确匹配 path，或 regex 匹配） */
  pathMatcher: RegExp | string;
  /** 期望的请求方法 */
  method?: string;
  /** 返回的状态码 */
  statusCode: number;
  /** 返回的 JSON body */
  responseBody?: unknown;
  /** 验证请求的回调（可选，用于断言请求构造） */
  requestValidator?: (req: IncomingMessage, body: unknown) => void;
}

class MockApiServer {
  private server: http.Server;
  private configs: MockServerConfig[] = [];
  public receivedRequests: Array<{
    method: string;
    url: string;
    headers: IncomingMessage["headers"];
    body: unknown;
  }> = [];
  public baseUrl = "";

  constructor() {
    this.server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const bodyStr = Buffer.concat(chunks).toString("utf-8");
        let parsedBody: unknown = bodyStr;
        try {
          if (bodyStr) parsedBody = JSON.parse(bodyStr);
        } catch {
          // 保留原始字符串
        }

        this.receivedRequests.push({
          method: req.method || "GET",
          url: req.url || "",
          headers: req.headers,
          body: parsedBody,
        });

        const config = this.matchConfig(req);
        if (!config) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Mock endpoint not found" }));
          return;
        }

        try {
          config.requestValidator?.(req, parsedBody);
        } catch (e) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Request validation failed", detail: (e as Error).message }));
          return;
        }

        res.writeHead(config.statusCode, { "Content-Type": "application/json" });
        res.end(JSON.stringify(config.responseBody ?? { ok: true }));
      });
    });
  }

  private matchConfig(req: IncomingMessage): MockServerConfig | undefined {
    const url = req.url || "";
    const method = req.method || "GET";
    return this.configs.find(
      (c) =>
        (typeof c.pathMatcher === "string"
          ? url === c.pathMatcher || url.startsWith(c.pathMatcher)
          : c.pathMatcher.test(url)) &&
        (!c.method || c.method === method),
    );
  }

  addConfig(config: MockServerConfig): void {
    this.configs.push(config);
  }

  clearConfigs(): void {
    this.configs = [];
    this.receivedRequests = [];
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(0, "127.0.0.1", () => {
        const addr = this.server.address();
        if (addr && typeof addr === "object") {
          this.baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }
}

describe("handleTestConnection 集成测试 - 真实 HTTP 链路", () => {
  let mockServer: MockApiServer;

  beforeAll(async () => {
    mockServer = new MockApiServer();
    await mockServer.start();
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  beforeEach(() => {
    mockServer.clearConfigs();
  });

  describe("参数校验与配置解析", () => {
    it("apiUrl 和 apiKey 都缺失时应返回 API_NOT_CONFIGURED", async () => {
      const result = await handleTestConnection("POST", {});
      expect(result.success).toBe(false);
      expect(result.error).toBe("api_not_configured");
      expect(result.code).toBe("api_not_configured");
      expect(result.httpStatus).toBe(400);
    });

    it("仅提供 apiUrl 但无 apiKey（且无 providerId/capability 可解析）应返回 API_NOT_CONFIGURED", async () => {
      const result = await handleTestConnection("POST", {
        apiUrl: mockServer.baseUrl,
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe("api_not_configured");
    });
  });

  describe("lightweight 模式 - OpenAI 兼容 endpoint", () => {
    it("GET /models 返回 200 应返回 success=true", async () => {
      mockServer.addConfig({
        pathMatcher: "/models",
        method: "GET",
        statusCode: 200,
        responseBody: { data: [{ id: "gpt-4o" }] },
        requestValidator: (req) => {
          expect(req.headers["authorization"]).toBe("Bearer test-key-123");
        },
      });

      const result = await handleTestConnection("POST", {
        apiUrl: mockServer.baseUrl,
        apiKey: "test-key-123",
        mode: "lightweight",
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe("CONNECTION_SUCCESS_API_KEY_VALID");
      // 验证请求确实是 GET /models
      expect(mockServer.receivedRequests).toHaveLength(1);
      expect(mockServer.receivedRequests[0]?.method).toBe("GET");
      expect(mockServer.receivedRequests[0]?.url).toBe("/models");
    });

    it("GET /models 返回 401 应返回 API_KEY_INVALID_OR_EXPIRED", async () => {
      mockServer.addConfig({
        pathMatcher: "/models",
        method: "GET",
        statusCode: 401,
        responseBody: { error: "Invalid API key" },
      });

      const result = await handleTestConnection("POST", {
        apiUrl: mockServer.baseUrl,
        apiKey: "invalid-key",
        mode: "lightweight",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("API_KEY_INVALID_OR_EXPIRED");
    });

    it("GET /models 返回 429 应返回 success=true（quota 不足但 key 有效）", async () => {
      mockServer.addConfig({
        pathMatcher: "/models",
        method: "GET",
        statusCode: 429,
      });

      const result = await handleTestConnection("POST", {
        apiUrl: mockServer.baseUrl,
        apiKey: "rate-limited-key",
        mode: "lightweight",
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe("API_KEY_VALID_QUOTA_MAY_BE_INSUFFICIENT");
    });

    it("GET /models 返回 500 应返回 CONNECTION_FAILED", async () => {
      mockServer.addConfig({
        pathMatcher: "/models",
        method: "GET",
        statusCode: 500,
      });

      const result = await handleTestConnection("POST", {
        apiUrl: mockServer.baseUrl,
        apiKey: "any-key",
        mode: "lightweight",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("CONNECTION_FAILED");
      expect(result.error).toContain("500");
    });
  });

  describe("lightweight 模式 - Anthropic endpoint", () => {
    it("应使用 x-api-key 头和 /models 端点", async () => {
      // AnthropicPlugin.match 需要 URL 包含 "anthropic.com" 或 "bedrock-runtime"
      // 本地 mock 服务器使用 path 前缀 /anthropic.com 模拟
      mockServer.addConfig({
        pathMatcher: /\/models$/,
        method: "GET",
        statusCode: 200,
        requestValidator: (req) => {
          expect(req.headers["x-api-key"]).toBe("anthropic-key-456");
          expect(req.headers["anthropic-version"]).toBe("2023-06-01");
          // 不应有 Authorization Bearer 头
          expect(req.headers["authorization"]).toBeUndefined();
        },
      });

      const anthropicUrl = `${mockServer.baseUrl}/anthropic.com`;
      const result = await handleTestConnection("POST", {
        apiUrl: anthropicUrl,
        apiKey: "anthropic-key-456",
        mode: "lightweight",
      });

      expect(result.success).toBe(true);
      // 验证请求路径包含 /models（因为 apiUrl 包含 /anthropic.com 前缀，请求路径是 /anthropic.com/models）
      expect(mockServer.receivedRequests[0]?.url).toContain("/models");
    });

    it("bedrock-runtime 也应识别为 Anthropic", async () => {
      mockServer.addConfig({
        pathMatcher: /\/models$/,
        method: "GET",
        statusCode: 200,
        requestValidator: (req) => {
          expect(req.headers["x-api-key"]).toBe("bedrock-key");
          expect(req.headers["anthropic-version"]).toBe("2023-06-01");
        },
      });

      const bedrockUrl = `${mockServer.baseUrl}/bedrock-runtime`;
      const result = await handleTestConnection("POST", {
        apiUrl: bedrockUrl,
        apiKey: "bedrock-key",
        mode: "lightweight",
      });

      expect(result.success).toBe(true);
    });
  });

  describe("lightweight 模式 - Google endpoint", () => {
    it("本地 URL 无法匹配 GooglePlugin，应走 fallback 路径使用 Authorization Bearer", async () => {
      // Google API URL 需要包含 googleapis.com 才能被 GooglePlugin 匹配
      // 本地 mock 服务器无法使用 googleapis.com 域名，因此验证 fallback 路径下的请求构造
      // pluginRegistry.select 会回退到 OpenAICompatiblePlugin（fallback）
      mockServer.addConfig({
        pathMatcher: "/models",
        method: "GET",
        statusCode: 200,
        requestValidator: (req) => {
          // fallback 路径使用 Authorization Bearer 头
          expect(req.headers["authorization"]).toBe("Bearer google-key-789");
        },
      });

      const result = await handleTestConnection("POST", {
        apiUrl: mockServer.baseUrl,
        apiKey: "google-key-789",
        mode: "lightweight",
      });

      expect(result.success).toBe(true);
      expect(mockServer.receivedRequests[0]?.headers["authorization"]).toBe("Bearer google-key-789");
    });
  });

  describe("capability 模式 - text", () => {
    it("OpenAI 兼容：POST /chat/completions 返回 200 应返回 TEXT_GENERATION_TEST_SUCCESS", async () => {
      mockServer.addConfig({
        pathMatcher: "/chat/completions",
        method: "POST",
        statusCode: 200,
        responseBody: { choices: [{ message: { content: "Hi" } }] },
        requestValidator: (req, body) => {
          expect(req.headers["authorization"]).toBe("Bearer text-key");
          const parsed = body as { model: string; messages: unknown[]; max_tokens: number };
          expect(parsed.model).toBe("gpt-4o");
          expect(parsed.messages).toHaveLength(1);
          expect(parsed.max_tokens).toBe(5);
        },
      });

      const result = await handleTestConnection("POST", {
        apiUrl: mockServer.baseUrl,
        apiKey: "text-key",
        capability: "text",
        mode: "capability",
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe("TEXT_GENERATION_TEST_SUCCESS");
    });

    it("Anthropic：POST /messages 应使用 Anthropic 格式", async () => {
      mockServer.addConfig({
        pathMatcher: /\/messages$/,
        method: "POST",
        statusCode: 200,
        requestValidator: (req, body) => {
          expect(req.headers["x-api-key"]).toBe("anthropic-text-key");
          expect(req.headers["anthropic-version"]).toBe("2023-06-01");
          const parsed = body as { model: string; max_tokens: number; messages: unknown[] };
          expect(parsed.model).toBe("claude-3-sonnet-20240229");
          expect(parsed.max_tokens).toBe(5);
        },
      });

      // AnthropicPlugin.match 需要 URL 包含 "anthropic.com" 或 "bedrock-runtime"
      const anthropicUrl = `${mockServer.baseUrl}/anthropic.com`;
      const result = await handleTestConnection("POST", {
        apiUrl: anthropicUrl,
        apiKey: "anthropic-text-key",
        capability: "text",
        mode: "capability",
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe("TEXT_GENERATION_TEST_SUCCESS");
    });

    it("POST 返回 429 应返回 success=true（key 有效但 quota 不足）", async () => {
      mockServer.addConfig({
        pathMatcher: "/chat/completions",
        method: "POST",
        statusCode: 429,
      });

      const result = await handleTestConnection("POST", {
        apiUrl: mockServer.baseUrl,
        apiKey: "any-key",
        capability: "text",
        mode: "capability",
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe("API_KEY_VALID_QUOTA_MAY_BE_INSUFFICIENT");
    });

    it("POST 返回 500 应返回 TEST_FAILED", async () => {
      mockServer.addConfig({
        pathMatcher: "/chat/completions",
        method: "POST",
        statusCode: 500,
      });

      const result = await handleTestConnection("POST", {
        apiUrl: mockServer.baseUrl,
        apiKey: "any-key",
        capability: "text",
        mode: "capability",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("TEST_FAILED");
      expect(result.error).toContain("500");
    });
  });

  describe("capability 模式 - image/vision/video", () => {
    it("image capability：GET /models 返回 200 应返回 IMAGE_API_CONNECTION_SUCCESS", async () => {
      mockServer.addConfig({
        pathMatcher: "/models",
        method: "GET",
        statusCode: 200,
      });

      const result = await handleTestConnection("POST", {
        apiUrl: mockServer.baseUrl,
        apiKey: "image-key",
        capability: "image",
        mode: "capability",
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe("IMAGE_API_CONNECTION_SUCCESS");
    });

    it("vision capability：GET /models 返回 200 应返回 VISION_API_CONNECTION_SUCCESS", async () => {
      mockServer.addConfig({
        pathMatcher: "/models",
        method: "GET",
        statusCode: 200,
      });

      const result = await handleTestConnection("POST", {
        apiUrl: mockServer.baseUrl,
        apiKey: "vision-key",
        capability: "vision",
        mode: "capability",
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe("VISION_API_CONNECTION_SUCCESS");
    });

    it("video capability：GET /models 返回 200 应返回 VIDEO_API_CONNECTION_SUCCESS", async () => {
      mockServer.addConfig({
        pathMatcher: "/models",
        method: "GET",
        statusCode: 200,
      });

      const result = await handleTestConnection("POST", {
        apiUrl: mockServer.baseUrl,
        apiKey: "video-key",
        capability: "video",
        mode: "capability",
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe("VIDEO_API_CONNECTION_SUCCESS");
    });

    it("GET /models 返回 429 应返回 API_KEY_VALID_QUOTA_MAY_BE_INSUFFICIENT", async () => {
      mockServer.addConfig({
        pathMatcher: "/models",
        method: "GET",
        statusCode: 429,
      });

      const result = await handleTestConnection("POST", {
        apiUrl: mockServer.baseUrl,
        apiKey: "any-key",
        capability: "image",
        mode: "capability",
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe("API_KEY_VALID_QUOTA_MAY_BE_INSUFFICIENT");
    });

    it("GET /models 返回 404 应返回 CONNECTION_FAILED", async () => {
      mockServer.addConfig({
        pathMatcher: "/models",
        method: "GET",
        statusCode: 404,
      });

      const result = await handleTestConnection("POST", {
        apiUrl: mockServer.baseUrl,
        apiKey: "any-key",
        capability: "video",
        mode: "capability",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("CONNECTION_FAILED");
    });

    it("不支持的 capability 应返回 UNSUPPORTED_CAPABILITY", async () => {
      const result = await handleTestConnection("POST", {
        apiUrl: mockServer.baseUrl,
        apiKey: "any-key",
        capability: "audio",
        mode: "capability",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("UNSUPPORTED_CAPABILITY");
      expect(result.error).toContain("audio");
    });
  });

  describe("SSRF 防护", () => {
    it("私有 IP（192.168.x.x）应被拦截并返回 CONNECTION_FAILED", async () => {
      const result = await handleTestConnection("POST", {
        apiUrl: "http://192.168.1.100:8080",
        apiKey: "any-key",
        mode: "lightweight",
      });

      expect(result.success).toBe(false);
      // SSRF 拦截会抛错 "Cannot access private/internal URLs"，被 catch 后返回 CONNECTION_FAILED
      expect(result.error).toContain("CONNECTION_FAILED");
      expect(result.httpStatus).toBe(500);
    });

    it("AWS 元数据端点 169.254.169.254 应被拦截", async () => {
      const result = await handleTestConnection("POST", {
        apiUrl: "http://169.254.169.254/latest",
        apiKey: "any-key",
        mode: "lightweight",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("CONNECTION_FAILED");
    });

    it("file:// 协议应被拦截", async () => {
      const result = await handleTestConnection("POST", {
        apiUrl: "file:///etc/passwd",
        apiKey: "any-key",
        mode: "lightweight",
      });

      expect(result.success).toBe(false);
      // file:// 协议在 SSRF 校验时被拦截
      expect(result.error).toBeDefined();
    });
  });

  describe("网络错误处理", () => {
    it("连接不存在的端口应返回 CONNECTION_FAILED", async () => {
      // 使用一个几乎不可能被占用的端口
      const result = await handleTestConnection("POST", {
        apiUrl: "http://127.0.0.1:1",
        apiKey: "any-key",
        mode: "lightweight",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("CONNECTION_FAILED");
      expect(result.httpStatus).toBe(500);
    });

    it("无效的 URL 应返回 CONNECTION_FAILED", async () => {
      const result = await handleTestConnection("POST", {
        apiUrl: "not-a-valid-url",
        apiKey: "any-key",
        mode: "lightweight",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("请求构造验证", () => {
    it("lightweight 模式应发送 GET 请求到 /models", async () => {
      mockServer.addConfig({
        pathMatcher: "/models",
        method: "GET",
        statusCode: 200,
      });

      await handleTestConnection("POST", {
        apiUrl: mockServer.baseUrl,
        apiKey: "verify-key",
        mode: "lightweight",
      });

      expect(mockServer.receivedRequests).toHaveLength(1);
      const req = mockServer.receivedRequests[0];
      expect(req?.method).toBe("GET");
      expect(req?.url).toBe("/models");
      expect(req?.headers["authorization"]).toBe("Bearer verify-key");
    });

    it("text capability 应发送 POST 请求到 /chat/completions", async () => {
      mockServer.addConfig({
        pathMatcher: "/chat/completions",
        method: "POST",
        statusCode: 200,
      });

      await handleTestConnection("POST", {
        apiUrl: mockServer.baseUrl,
        apiKey: "verify-key",
        capability: "text",
        mode: "capability",
      });

      expect(mockServer.receivedRequests).toHaveLength(1);
      const req = mockServer.receivedRequests[0];
      expect(req?.method).toBe("POST");
      expect(req?.url).toBe("/chat/completions");
    });
  });
});
