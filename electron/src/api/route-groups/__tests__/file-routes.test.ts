/**
 * file-routes.ts 路由 handler 测试
 *
 * 重点验证：
 * 1. file/write-binary 路由能正确从 req.__rawBuffer 读取二进制并写入文件
 * 2. file/write-binary 的路径校验（PATH_NOT_ALLOWED）
 * 3. file/write-binary 的 500MB 限额
 * 4. file/write (JSON 路径) 仍然正常工作（向后兼容）
 * 5. file/write 的 100MB 限额
 *
 * 注：不 mock app-paths，使用真实的 USER_DATA_ROOT 路径，
 * 避免模块加载时 ALLOWED_ROOTS 被冻结成 mock 值的问题。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type http from "http";

// ── hoisted mocks ──────────────────────────────────────────────────────
const { mockFsp } = vi.hoisted(() => ({
  mockFsp: {
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    stat: vi.fn(),
    realpath: vi.fn(),
    access: vi.fn(),
    statfs: vi.fn(),
    readdir: vi.fn(),
    readFile: vi.fn(),
    unlink: vi.fn(),
    copyFile: vi.fn(),
    rename: vi.fn(),
  },
}));

vi.mock("fs/promises", () => ({ default: mockFsp }));
vi.mock("../../handlers/assets", () => ({
  ensureVideoCacheDir: vi.fn(async () => "/test/user-data/Cache/Videos"),
}));
vi.mock("../../logging", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import path from "path";
import { fileRoutes } from "../file-routes";
import { getUserDataRootDir } from "../../../app-paths";

// 使用真实的 USER_DATA_ROOT 构造测试路径，确保通过 ALLOWED_ROOTS 校验
const USER_DATA_ROOT = getUserDataRootDir();
const TEST_FILE_DIR = path.join(USER_DATA_ROOT, "Cache", "Videos");
const TEST_FILE_PATH = path.join(TEST_FILE_DIR, "test.mp4");

function createMockReq(
  filePath: string,
  _rawBuffer: Buffer,
): http.IncomingMessage & { __rawBuffer?: Buffer } {
  return {
    headers: { "x-file-path": filePath },
  } as http.IncomingMessage & { __rawBuffer?: Buffer };
}

describe("file-routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFsp.writeFile.mockResolvedValue(undefined);
    mockFsp.mkdir.mockResolvedValue(undefined);
    mockFsp.access.mockRejectedValue(new Error("ENOENT"));
    // realpath 返回原路径，使 path.resolve 后的路径能通过 isPathUnderAnyRoot 校验
    mockFsp.realpath.mockImplementation(async (p: string) => p);
  });

  describe("file/write-binary (二进制直写)", () => {
    it("应从 req.__rawBuffer 读取二进制并写入文件", async () => {
      const rawBuffer = Buffer.from("fake-video-binary-data");
      const req = createMockReq(TEST_FILE_PATH, rawBuffer);
      (req as http.IncomingMessage & { __rawBuffer?: Buffer }).__rawBuffer = rawBuffer;

      const route = fileRoutes["file/write-binary"];
      const result = (await route.handler("POST", {}, req)) as { success: boolean };

      expect(result.success).toBe(true);
      expect(mockFsp.writeFile).toHaveBeenCalledWith(TEST_FILE_PATH, rawBuffer);
    });

    it("空 body 应返回错误", async () => {
      const req = createMockReq(TEST_FILE_PATH, Buffer.alloc(0));
      (req as http.IncomingMessage & { __rawBuffer?: Buffer }).__rawBuffer = Buffer.alloc(0);

      const route = fileRoutes["file/write-binary"];
      const result = (await route.handler("POST", {}, req)) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("Empty binary body");
    });

    it("路径不在 ALLOWED_ROOTS 下应返回 PATH_NOT_ALLOWED", async () => {
      const filePath = "/etc/passwd";
      const req = createMockReq(filePath, Buffer.from("data"));
      (req as http.IncomingMessage & { __rawBuffer?: Buffer }).__rawBuffer = Buffer.from("data");

      const route = fileRoutes["file/write-binary"];
      const result = (await route.handler("POST", {}, req)) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe("FILE_PATH_NOT_ALLOWED");
      expect(mockFsp.writeFile).not.toHaveBeenCalled();
    });

    it("超过 500MB 限额应返回 FILE_TOO_LARGE", async () => {
      // 模拟 500MB + 1 字节的 Buffer（不实际分配，只改 length 属性）
      const oversizedBuffer = Buffer.alloc(1);
      Object.defineProperty(oversizedBuffer, "length", {
        value: 500 * 1024 * 1024 + 1,
        configurable: true,
      });
      const req = createMockReq(TEST_FILE_PATH, oversizedBuffer);
      (req as http.IncomingMessage & { __rawBuffer?: Buffer }).__rawBuffer = oversizedBuffer;

      const route = fileRoutes["file/write-binary"];
      const result = (await route.handler("POST", {}, req)) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe("FILE_TOO_LARGE");
      expect(mockFsp.writeFile).not.toHaveBeenCalled();
    });

    it("499MB 文件应通过（在限额内）", async () => {
      // 模拟 499MB Buffer（不实际分配）
      const largeBuffer = Buffer.alloc(1);
      Object.defineProperty(largeBuffer, "length", {
        value: 499 * 1024 * 1024,
        configurable: true,
      });
      const req = createMockReq(TEST_FILE_PATH, largeBuffer);
      (req as http.IncomingMessage & { __rawBuffer?: Buffer }).__rawBuffer = largeBuffer;

      const route = fileRoutes["file/write-binary"];
      const result = (await route.handler("POST", {}, req)) as { success: boolean };

      expect(result.success).toBe(true);
      expect(mockFsp.writeFile).toHaveBeenCalledWith(TEST_FILE_PATH, largeBuffer);
    });

    it("应自动创建父目录", async () => {
      const nestedPath = path.join(TEST_FILE_DIR, "nested", "deep", "test.mp4");
      const rawBuffer = Buffer.from("data");
      const req = createMockReq(nestedPath, rawBuffer);
      (req as http.IncomingMessage & { __rawBuffer?: Buffer }).__rawBuffer = rawBuffer;
      // 父目录不存在
      mockFsp.access.mockRejectedValueOnce(new Error("ENOENT"));

      const route = fileRoutes["file/write-binary"];
      const result = (await route.handler("POST", {}, req)) as { success: boolean };

      expect(result.success).toBe(true);
      expect(mockFsp.mkdir).toHaveBeenCalledWith(
        path.join(TEST_FILE_DIR, "nested", "deep"),
        { recursive: true },
      );
    });
  });

  describe("file/write (JSON + base64 路径，向后兼容)", () => {
    it("应继续支持 base64 编码写入", async () => {
      const base64Data = Buffer.from("small-data").toString("base64");

      const route = fileRoutes["file/write"];
      const result = (await route.handler("POST", {
        filePath: TEST_FILE_PATH,
        data: base64Data,
        encoding: "base64",
      }, {} as http.IncomingMessage)) as { success: boolean };

      expect(result.success).toBe(true);
      expect(mockFsp.writeFile).toHaveBeenCalledWith(
        TEST_FILE_PATH,
        Buffer.from(base64Data, "base64"),
      );
    });

    it("应继续支持 UTF-8 字符串写入", async () => {
      const route = fileRoutes["file/write"];
      const result = (await route.handler("POST", {
        filePath: TEST_FILE_PATH,
        data: "hello world",
      }, {} as http.IncomingMessage)) as { success: boolean };

      expect(result.success).toBe(true);
      expect(mockFsp.writeFile).toHaveBeenCalledWith(
        TEST_FILE_PATH,
        Buffer.from("hello world", "utf-8"),
      );
    });

    it("超过 100MB 限额应返回 FILE_TOO_LARGE", async () => {
      // 100MB + 1 字节的 base64 字符串
      const oversizedBuffer = Buffer.alloc(100 * 1024 * 1024 + 1);
      const base64Data = oversizedBuffer.toString("base64");

      const route = fileRoutes["file/write"];
      const result = (await route.handler("POST", {
        filePath: TEST_FILE_PATH,
        data: base64Data,
        encoding: "base64",
      }, {} as http.IncomingMessage)) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe("FILE_TOO_LARGE");
      expect(mockFsp.writeFile).not.toHaveBeenCalled();
    });
  });

  describe("路由注册", () => {
    it("file/write-binary 路由应存在且只支持 POST", () => {
      const route = fileRoutes["file/write-binary"];
      expect(route).toBeDefined();
      expect(route.methods).toEqual(["POST"]);
      // 无 schema（二进制 body 不走 Zod 校验）
      expect(route.schema).toBeUndefined();
    });

    it("file/write 路由应保持原有 schema（向后兼容）", () => {
      const route = fileRoutes["file/write"];
      expect(route).toBeDefined();
      expect(route.methods).toEqual(["POST"]);
      expect(route.schema).toBeDefined();
    });
  });
});
