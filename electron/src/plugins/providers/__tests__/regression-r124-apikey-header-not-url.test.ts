/**
 * R124: apiKey 通过 header 传递，不通过 URL query 传递
 * 回归防护: 确保 GooglePlugin 的 getAuthHeaders 通过 x-goog-api-key header 传递 apiKey，
 *           appendAuthToUrl 不将 apiKey 附加到 URL query 中。
 *
 * 攻击场景：若 apiKey 通过 URL query 传递（如 ?key=AIza...），则 apiKey 会出现在：
 *           - 服务器访问日志
 *           - 代理/CDN 缓存
 *           - 浏览器历史记录
 *           - 错误监控/APM 系统
 *           正确行为：apiKey 通过 HTTP header 传递，URL 中不包含 apiKey。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// mock logger，避免导入真实 logger 产生副作用
vi.mock("../../../logging/logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// mock utils，避免网络/文件系统操作
vi.mock("../../utils", () => ({
  ensureAccessibleUrl: vi.fn((url: string) => url),
  downloadAsBase64: vi.fn(() => Promise.resolve("base64data")),
  resolveLocalUrlToBase64: vi.fn(() => Promise.resolve("data:image/png;base64,localdata")),
  stripDataUriPrefix: vi.fn((s: string) => s.replace(/^data:[^;]+;base64,/, "")),
  urlToPureBase64: vi.fn((s: string) => s.replace(/^data:[^;]+;base64,/, "")),
}));

import { GooglePlugin } from "../google";

describe("R124: apiKey 通过 header 传递，不通过 URL query 传递", () => {
  let plugin: GooglePlugin;
  const testApiKey = "AIzaSyTestApiKey1234567890123456789";
  const testUrl = "https://generativeai.googleapis.com/v1/models/veo-3:predictLongRunning";

  beforeEach(() => {
    plugin = new GooglePlugin();
  });

  describe("getAuthHeaders", () => {
    it("应返回包含 x-goog-api-key 的 header 对象", () => {
      const headers = plugin.getAuthHeaders(testApiKey);

      // 应返回 header 对象，包含 x-goog-api-key
      expect(headers).toBeDefined();
      expect(headers).toHaveProperty("x-goog-api-key");
    });

    it("x-goog-api-key header 的值应为 apiKey", () => {
      const headers = plugin.getAuthHeaders(testApiKey);

      // header 值应为 apiKey 本身
      expect(headers["x-goog-api-key"]).toBe(testApiKey);
    });

    it("不应使用 Authorization Bearer 方式传递 apiKey", () => {
      const headers = plugin.getAuthHeaders(testApiKey);

      // Google API 使用 x-goog-api-key，不使用 Authorization: Bearer
      expect(headers["Authorization"]).toBeUndefined();
      expect(headers["authorization"]).toBeUndefined();
    });

    it("应支持传入 endpoint 参数但不影响 header", () => {
      const headersWithoutEndpoint = plugin.getAuthHeaders(testApiKey);
      const headersWithEndpoint = plugin.getAuthHeaders(testApiKey, "/models/veo-3:predictLongRunning");

      // endpoint 参数不影响 header 内容
      expect(headersWithEndpoint).toEqual(headersWithoutEndpoint);
    });

    it("apiKey 为空时也应返回 header 结构", () => {
      const headers = plugin.getAuthHeaders("");

      // 即使 apiKey 为空，也应返回 header 对象（不抛错）
      expect(headers).toBeDefined();
      expect(headers["x-goog-api-key"]).toBe("");
    });
  });

  describe("appendAuthToUrl", () => {
    it("应返回原始 URL，不附加 apiKey", () => {
      const result = plugin.appendAuthToUrl(testUrl, testApiKey);

      // URL 应保持不变
      expect(result).toBe(testUrl);
    });

    it("URL 中不应包含 apiKey", () => {
      const result = plugin.appendAuthToUrl(testUrl, testApiKey);

      // URL 中不应出现 apiKey
      expect(result).not.toContain(testApiKey);
    });

    it("URL 中不应包含 key= query 参数", () => {
      const result = plugin.appendAuthToUrl(testUrl, testApiKey);

      // 不应有 ?key= 或 &key= 参数
      expect(result).not.toMatch(/[?&]key=/);
    });

    it("URL 中不应包含 api_key= query 参数", () => {
      const result = plugin.appendAuthToUrl(testUrl, testApiKey);

      // 不应有 ?api_key= 或 &api_key= 参数
      expect(result).not.toMatch(/[?&]api_key=/);
    });

    it("URL 中不应包含 access_token= query 参数", () => {
      const result = plugin.appendAuthToUrl(testUrl, testApiKey);

      // 不应有 ?access_token= 或 &access_token= 参数
      expect(result).not.toMatch(/[?&]access_token=/);
    });

    it("URL 已有 query 参数时也不应附加 apiKey", () => {
      const urlWithQuery = `${testUrl}?alt=json`;
      const result = plugin.appendAuthToUrl(urlWithQuery, testApiKey);

      // 已有 query 参数时也不附加 apiKey
      expect(result).toBe(urlWithQuery);
      expect(result).not.toContain(testApiKey);
      expect(result).not.toMatch(/[?&]key=/);
    });

    it("多次调用 appendAuthToUrl 应保持 URL 不变", () => {
      const once = plugin.appendAuthToUrl(testUrl, testApiKey);
      const twice = plugin.appendAuthToUrl(once, testApiKey);

      // 多次调用不应累积 query 参数
      expect(twice).toBe(testUrl);
    });
  });

  describe("apiKey 不泄露到 URL 的综合验证", () => {
    it("getAuthHeaders + appendAuthToUrl 组合使用时 apiKey 仅在 header 中", () => {
      const headers = plugin.getAuthHeaders(testApiKey);
      const url = plugin.appendAuthToUrl(testUrl, testApiKey);

      // apiKey 应在 header 中
      expect(headers["x-goog-api-key"]).toBe(testApiKey);
      // apiKey 不应在 URL 中
      expect(url).not.toContain(testApiKey);
      // URL 不应包含任何形式的 apiKey query 参数
      expect(url).not.toMatch(/[?&](key|api_key|access_token)=/);
    });

    it("apiKey 模式（AIza 前缀）不应出现在 URL 中", () => {
      const result = plugin.appendAuthToUrl(testUrl, testApiKey);

      // Google API key 以 AIza 开头，不应出现在 URL 中
      expect(result).not.toMatch(/AIza/);
    });

    it("buildVideoRequest 生成的 endpoint 不应包含 apiKey", () => {
      const videoResult = plugin.buildVideoRequest({
        prompt: "test prompt",
        model: "veo-3",
        firstFrameUrl: undefined,
      });

      // endpoint 不应包含 apiKey
      expect(videoResult.endpoint).not.toContain(testApiKey);
      expect(videoResult.endpoint).not.toMatch(/AIza/);
    });
  });
});
