/**
 * R118: HTTP 重定向必须校验 SSRF
 * 回归防护: 确保 cacheRemoteImageLocally 在处理 HTTP 重定向时，
 *           必须校验重定向目标协议（仅 http/https）和是否为私有地址
 *           （调用 isPrivateUrl），防止 SSRF 攻击。
 *
 * 攻击场景：远程图片 URL 返回 3xx 重定向到 file:///etc/passwd 或
 *           http://127.0.0.1:8080/admin 等内部地址，若不校验则导致
 *           SSRF 攻击，可读取本地文件或访问内网服务。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// 提升 mock，确保在模块导入前生效
const {
  mockSsrfValidate,
  mockHttpGet,
  mockHttpsGet,
  mockFsExistsSync,
  mockFsMkdirSync,
  mockFsWriteFileSync,
  mockFspAccess,
  mockFspMkdir,
  mockFspWriteFile,
} = vi.hoisted(() => ({
  mockSsrfValidate: vi.fn(),
  mockHttpGet: vi.fn(),
  mockHttpsGet: vi.fn(),
  mockFsExistsSync: vi.fn(() => true),
  mockFsMkdirSync: vi.fn(),
  mockFsWriteFileSync: vi.fn(),
  mockFspAccess: vi.fn(),
  mockFspMkdir: vi.fn(),
  mockFspWriteFile: vi.fn(),
}));

vi.mock("../security/ssrf-guard/ssrf-guard", () => ({
  ssrfGuard: { validate: mockSsrfValidate },
}));

vi.mock("../logging/logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("../handlers/config", () => ({
  loadConfig: vi.fn(() => ({ providers: [], mapping: {} })),
}));

vi.mock("../plugins", () => ({
  pluginRegistry: { selectById: vi.fn(), select: vi.fn() },
}));

vi.mock("http", () => ({
  default: { get: mockHttpGet, request: vi.fn() },
}));

vi.mock("https", () => ({
  default: { get: mockHttpsGet, request: vi.fn() },
}));

vi.mock("fs", () => ({
  default: {
    existsSync: mockFsExistsSync,
    mkdirSync: mockFsMkdirSync,
    writeFileSync: mockFsWriteFileSync,
    promises: {
      access: mockFspAccess,
      mkdir: mockFspMkdir,
      writeFile: mockFspWriteFile,
    },
  },
  existsSync: mockFsExistsSync,
  mkdirSync: mockFsMkdirSync,
  writeFileSync: mockFsWriteFileSync,
  promises: {
    access: mockFspAccess,
    mkdir: mockFspMkdir,
    writeFile: mockFspWriteFile,
  },
}));

/**
 * 设置 mock HTTP/HTTPS get，模拟响应。
 * 事件在 callback 调用后同步触发（此时 listener 已注册）。
 */
function setupMockGet(
  mockFn: ReturnType<typeof vi.fn>,
  options: {
    statusCode: number;
    location?: string;
    body?: Buffer;
  },
): void {
  mockFn.mockImplementationOnce(
    (_url: string, _opts: unknown, callback: (res: unknown) => void) => {
      const listeners: Record<string, Array<(data?: unknown) => void>> = {};
      const res = {
        statusCode: options.statusCode,
        headers: options.location ? { location: options.location } : {},
        on(event: string, fn: (data?: unknown) => void) {
          if (!listeners[event]) listeners[event] = [];
          listeners[event].push(fn);
        },
        resume: vi.fn(),
      };
      callback(res);
      // 同步触发 data 和 end 事件（此时 listener 已注册）
      // 仅当非重定向响应时才触发 data/end（重定向响应不读取 body）
      const isRedirect = options.statusCode >= 300 && options.statusCode < 400 && options.location;
      if (!isRedirect) {
        listeners["data"]?.forEach((fn) => fn(options.body ?? Buffer.from("image-data")));
        listeners["end"]?.forEach((fn) => fn());
      }
      return {
        on: vi.fn(),
      };
    },
  );
}

describe("R118: HTTP 重定向必须校验 SSRF", () => {
  let apiGatewayUtils: typeof import("../api-gateway-utils");

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // 默认 SSRF 校验通过（非私有地址）
    mockSsrfValidate.mockResolvedValue({ safe: true });
    mockFsExistsSync.mockReturnValue(true);

    apiGatewayUtils = await import("../api-gateway-utils");
  });

  describe("重定向到 http/https 公网地址应正常跟随", () => {
    it("http 重定向到公网 https 地址应正常下载", async () => {
      const redirectUrl = "https://cdn.example.com/image.png";

      // 第一次请求返回 302 重定向
      setupMockGet(mockHttpGet, { statusCode: 302, location: redirectUrl });
      // 第二次请求（跟随重定向）返回 200
      setupMockGet(mockHttpsGet, {
        statusCode: 200,
        body: Buffer.from("png-bytes"),
      });

      const result = await apiGatewayUtils.cacheRemoteImageLocally("http://example.com/image.png");

      // 应返回本地缓存路径（而非原始 URL）
      expect(result).not.toBe("http://example.com/image.png");
      expect(mockFspWriteFile).toHaveBeenCalledWith(expect.any(String), Buffer.from("png-bytes"));
      // 应调用 isPrivateUrl 校验重定向目标（通过 ssrfGuard.validate）
      expect(mockSsrfValidate).toHaveBeenCalledWith(redirectUrl);
      // 应跟随重定向发起第二次请求
      expect(mockHttpsGet).toHaveBeenCalled();
    });
  });

  describe("重定向到非 http/https 协议应拒绝", () => {
    it("重定向到 file:// 协议应被拒绝", async () => {
      setupMockGet(mockHttpGet, { statusCode: 302, location: "file:///etc/passwd" });

      const result = await apiGatewayUtils.cacheRemoteImageLocally("http://example.com/image.png");

      // 重定向到非 http 协议被拒绝，函数应回退返回原始 URL
      expect(result).toBe("http://example.com/image.png");
      // 不应写入文件
      expect(mockFspWriteFile).not.toHaveBeenCalled();
      // 不应发起第二次请求
      expect(mockHttpsGet).not.toHaveBeenCalled();
    });

    it("重定向到 ftp:// 协议应被拒绝", async () => {
      setupMockGet(mockHttpGet, { statusCode: 301, location: "ftp://internal-server/file" });

      const result = await apiGatewayUtils.cacheRemoteImageLocally("http://example.com/file.png");

      expect(result).toBe("http://example.com/file.png");
      expect(mockFspWriteFile).not.toHaveBeenCalled();
      expect(mockHttpsGet).not.toHaveBeenCalled();
    });
  });

  describe("重定向到私有地址应拒绝", () => {
    it("重定向到 127.0.0.1 应被拒绝", async () => {
      const redirectUrl = "http://127.0.0.1:8080/admin";

      // 初始 URL 校验通过，重定向 URL 校验失败（私有地址）
      mockSsrfValidate.mockResolvedValueOnce({ safe: true });
      mockSsrfValidate.mockResolvedValueOnce({ safe: false, reason: "Private IP" });
      setupMockGet(mockHttpGet, { statusCode: 302, location: redirectUrl });

      const result = await apiGatewayUtils.cacheRemoteImageLocally("http://example.com/image.png");

      // 重定向到私有地址被拒绝，回退返回原始 URL
      expect(result).toBe("http://example.com/image.png");
      expect(mockFspWriteFile).not.toHaveBeenCalled();
      expect(mockHttpsGet).not.toHaveBeenCalled();
      // 应调用 isPrivateUrl 校验重定向目标
      expect(mockSsrfValidate).toHaveBeenCalledWith(redirectUrl);
    });

    it("重定向到 10.0.0.1 应被拒绝", async () => {
      const redirectUrl = "http://10.0.0.1/internal";

      mockSsrfValidate.mockResolvedValueOnce({ safe: true });
      mockSsrfValidate.mockResolvedValueOnce({ safe: false, reason: "Private IP" });
      setupMockGet(mockHttpGet, { statusCode: 302, location: redirectUrl });

      const result = await apiGatewayUtils.cacheRemoteImageLocally("http://example.com/image.png");

      expect(result).toBe("http://example.com/image.png");
      expect(mockFspWriteFile).not.toHaveBeenCalled();
      expect(mockSsrfValidate).toHaveBeenCalledWith(redirectUrl);
    });

    it("重定向到 192.168.1.1 应被拒绝", async () => {
      const redirectUrl = "http://192.168.1.1/router";

      mockSsrfValidate.mockResolvedValueOnce({ safe: true });
      mockSsrfValidate.mockResolvedValueOnce({ safe: false, reason: "Private IP" });
      setupMockGet(mockHttpGet, { statusCode: 302, location: redirectUrl });

      const result = await apiGatewayUtils.cacheRemoteImageLocally("http://example.com/image.png");

      expect(result).toBe("http://example.com/image.png");
      expect(mockFspWriteFile).not.toHaveBeenCalled();
      expect(mockSsrfValidate).toHaveBeenCalledWith(redirectUrl);
    });
  });

  describe("正常请求（无重定向）应正常处理", () => {
    it("http 200 响应应直接下载并缓存", async () => {
      setupMockGet(mockHttpGet, {
        statusCode: 200,
        body: Buffer.from("image-bytes"),
      });

      const result = await apiGatewayUtils.cacheRemoteImageLocally("http://example.com/image.png");

      // 应返回本地缓存路径
      expect(result).not.toBe("http://example.com/image.png");
      expect(mockFspWriteFile).toHaveBeenCalledWith(expect.any(String), Buffer.from("image-bytes"));
      // SSRF 校验会检查初始 URL
      expect(mockSsrfValidate).toHaveBeenCalledWith("http://example.com/image.png");
      // 不应发起第二次请求
      expect(mockHttpsGet).not.toHaveBeenCalled();
    });

    it("非 http/https URL 应直接返回原始 URL 不处理", async () => {
      const result = await apiGatewayUtils.cacheRemoteImageLocally("data:image/png;base64,abc");

      expect(result).toBe("data:image/png;base64,abc");
      expect(mockHttpGet).not.toHaveBeenCalled();
      expect(mockHttpsGet).not.toHaveBeenCalled();
      expect(mockFspWriteFile).not.toHaveBeenCalled();
    });
  });
});
