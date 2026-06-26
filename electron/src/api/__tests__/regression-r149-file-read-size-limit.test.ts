/**
 * R149: file/read 文件大小限制
 * 回归防护: 确保 file/read 路由在读取文件前检查文件大小，
 *           超过 50MB 时返回错误，避免读取超大文件导致 OOM。
 *
 * 问题场景：若 file/read 不检查文件大小直接 readFile，攻击者可构造
 *           超大文件（如数 GB 的视频）导致主进程内存耗尽崩溃。
 *           修复后在 readFile 前调用 fsp.stat 检查大小，超过 50MB 拒绝。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockStat,
  mockReadFile,
  mockRealpath,
  mockAccess,
  mockMkdir,
} = vi.hoisted(() => ({
  mockStat: vi.fn(),
  mockReadFile: vi.fn(),
  mockRealpath: vi.fn(),
  mockAccess: vi.fn(),
  mockMkdir: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  default: {
    stat: mockStat,
    readFile: mockReadFile,
    realpath: mockRealpath,
    access: mockAccess,
    mkdir: mockMkdir,
    readdir: vi.fn(),
    copyFile: vi.fn(),
    writeFile: vi.fn(),
    unlink: vi.fn(),
    statfs: vi.fn(),
  },
  stat: mockStat,
  readFile: mockReadFile,
  realpath: mockRealpath,
  access: mockAccess,
  mkdir: mockMkdir,
}));

vi.mock("../../logging", () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("../../handlers/assets", () => ({
  ensureVideoCacheDir: vi.fn().mockResolvedValue("/tmp/cache"),
}));

vi.mock("../../app-paths", () => ({
  getUserDataRootDir: vi.fn(() => "/tmp/user-data"),
  getAllUserDataDirs: vi.fn(() => ["/tmp/user-data"]),
  isPathUnderAnyRoot: vi.fn(() => true),
  isPathUnderRoot: vi.fn(() => true),
}));

import { fileRoutes } from "../route-groups/file-routes";

const MAX_READ_SIZE = 50 * 1024 * 1024; // 50MB

describe("R149: file/read 文件大小限制", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认 mock：路径解析成功、文件存在、路径允许
    mockRealpath.mockResolvedValue("/tmp/user-data/Assets/character/test.png");
    mockAccess.mockResolvedValue(undefined);
    mockStat.mockResolvedValue({
      size: 1024,
      isFile: () => true,
      birthtime: new Date(),
      mtime: new Date(),
    });
    mockReadFile.mockResolvedValue(Buffer.from("test-content"));
  });

  it("读取小于 50MB 的文件应成功", async () => {
    mockStat.mockResolvedValue({
      size: 10 * 1024 * 1024, // 10MB
      isFile: () => true,
      birthtime: new Date(),
      mtime: new Date(),
    });
    mockReadFile.mockResolvedValue(Buffer.from("file-content"));

    const handler = fileRoutes["file/read"].handler;
    const result = await handler("POST", { key: "test.png" });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(mockReadFile).toHaveBeenCalled();
  });

  it("读取大于 50MB 的文件应返回错误", async () => {
    const largeSize = 60 * 1024 * 1024; // 60MB
    mockStat.mockResolvedValue({
      size: largeSize,
      isFile: () => true,
      birthtime: new Date(),
      mtime: new Date(),
    });

    const handler = fileRoutes["file/read"].handler;
    const result = await handler("POST", { key: "large-file.mp4" });

    expect(result.success).toBe(false);
    // 错误以错误码形式返回，渲染端通过 mapUserFacingError 映射为 i18n
    expect(result.error).toBe("FILE_TOO_LARGE");
    // readFile 不应被调用
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it("超大文件应返回 FILE_TOO_LARGE 错误码", async () => {
    const largeSize = 100 * 1024 * 1024; // 100MB
    mockStat.mockResolvedValue({
      size: largeSize,
      isFile: () => true,
      birthtime: new Date(),
      mtime: new Date(),
    });

    const handler = fileRoutes["file/read"].handler;
    const result = await handler("POST", { key: "huge-file.mp4" });

    expect(result.success).toBe(false);
    // 错误码统一返回，文件大小通过 logger.warn 记录到主进程日志
    expect(result.error).toBe("FILE_TOO_LARGE");
  });

  it("文件大小等于 50MB 边界应成功（<=）", async () => {
    mockStat.mockResolvedValue({
      size: MAX_READ_SIZE, // 正好 50MB
      isFile: () => true,
      birthtime: new Date(),
      mtime: new Date(),
    });
    mockReadFile.mockResolvedValue(Buffer.from("boundary-content"));

    const handler = fileRoutes["file/read"].handler;
    const result = await handler("POST", { key: "boundary.bin" });

    expect(result.success).toBe(true);
    expect(mockReadFile).toHaveBeenCalled();
  });

  it("文件大小为 50MB + 1 字节应被拒绝", async () => {
    mockStat.mockResolvedValue({
      size: MAX_READ_SIZE + 1,
      isFile: () => true,
      birthtime: new Date(),
      mtime: new Date(),
    });

    const handler = fileRoutes["file/read"].handler;
    const result = await handler("POST", { key: "over-boundary.bin" });

    expect(result.success).toBe(false);
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it("file/read-base64 也应执行大小检查", async () => {
    const largeSize = 80 * 1024 * 1024; // 80MB
    mockStat.mockResolvedValue({
      size: largeSize,
      isFile: () => true,
      birthtime: new Date(),
      mtime: new Date(),
    });

    const handler = fileRoutes["file/read-base64"].handler;
    const result = await handler("POST", { key: "large-base64.mp4" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("FILE_TOO_LARGE");
    expect(mockReadFile).not.toHaveBeenCalled();
  });
});
