/**
 * R119: openPath 必须路径白名单校验
 * 回归防护: 确保 shell:open-path IPC handler 必须校验路径在用户数据目录
 *           或系统临时目录内，防止任意文件访问。
 *
 * 攻击场景：恶意渲染进程调用 shell:open-path 传入任意路径（如
 *           C:\Windows\System32\cmd.exe 或 /etc/passwd），若不校验则
 *           可打开任意系统文件或可执行文件，造成安全风险。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "path";
import os from "os";

// 提升 mock，确保在模块导入前生效
const {
  mockIpcMainHandle,
  mockShellOpenPath,
  mockGetAllUserDataDirs,
  mockIsPathUnderAnyRoot,
  electronMock,
} = vi.hoisted(() => {
  const fnIpcMainHandle = vi.fn();
  const fnShellOpenPath = vi.fn().mockResolvedValue("");
  const fnGetAllUserDataDirs = vi.fn(() => []);
  const fnIsPathUnderAnyRoot = vi.fn(() => false);

  const mock = {
    app: {
      getPath: vi.fn(() => "/tmp/test-user-data"),
      getName: vi.fn(() => "ai-animation-studio"),
      getVersion: vi.fn(() => "1.0.0"),
      isPackaged: false,
    },
    ipcMain: {
      handle: fnIpcMainHandle,
      on: vi.fn(),
    },
    shell: {
      openPath: fnShellOpenPath,
      openExternal: vi.fn(),
    },
    BrowserWindow: {
      getFocusedWindow: vi.fn(() => null),
      getAllWindows: vi.fn(() => []),
    },
  };

  return {
    mockIpcMainHandle: fnIpcMainHandle,
    mockShellOpenPath: fnShellOpenPath,
    mockGetAllUserDataDirs: fnGetAllUserDataDirs,
    mockIsPathUnderAnyRoot: fnIsPathUnderAnyRoot,
    electronMock: mock,
  };
});

vi.mock("electron", () => ({ ...electronMock, default: electronMock }));

vi.mock("../logging/logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("../app-paths", () => ({
  getAllUserDataDirs: mockGetAllUserDataDirs,
  isPathUnderAnyRoot: mockIsPathUnderAnyRoot,
  getUserDataRootDir: vi.fn(() => "/tmp/test-user-data"),
  getUserDataSubDir: vi.fn(() => "/tmp/test-user-data/sub"),
  isPathUnderRoot: vi.fn(() => false),
}));

// Mock 其他 handler 模块以避免副作用
vi.mock("../handlers/assets", () => ({ setupAssetHandlers: vi.fn() }));
vi.mock("../handlers/database", () => ({ setupDatabaseHandlers: vi.fn() }));
vi.mock("../handlers/export", () => ({ registerExportHandlers: vi.fn() }));
vi.mock("../handlers/config", () => ({
  handleConfig: vi.fn(),
  handleSecureConfig: vi.fn(),
  loadConfig: vi.fn(() => ({})),
  saveConfig: vi.fn(),
  loadConfigAsync: vi.fn(),
  saveConfigAsync: vi.fn(),
  getConfigFile: vi.fn(),
  getConfigDir: vi.fn(),
}));
vi.mock("../api-gateway", () => ({
  getUploadedFile: vi.fn(),
}));
vi.mock("../api-server", () => ({
  registerAllowedOrigin: vi.fn(),
}));
vi.mock("../config/ports", () => ({
  API_SERVER_PORT: 8888,
  DEV_SERVER_PORT: 5173,
}));

import { setupApiHandlers } from "../main-common";

/**
 * 从 ipcMain.handle 调用中提取 handler 函数映射。
 */
function extractHandlers(
  registerFn: () => void,
): Map<string, (...args: unknown[]) => unknown> {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  mockIpcMainHandle.mockImplementation(
    (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    },
  );
  registerFn();
  return handlers;
}

describe("R119: openPath 必须路径白名单校验", () => {
  let handlers: Map<string, (...args: unknown[]) => unknown>;
  const userDataDir = path.join(os.homedir(), "PrismCraft");
  const tmpDir = os.tmpdir();

  beforeEach(() => {
    vi.clearAllMocks();
    mockShellOpenPath.mockResolvedValue("");
    // 默认配置用户数据目录
    mockGetAllUserDataDirs.mockReturnValue([userDataDir]);
    // 默认 isPathUnderAnyRoot 返回 false（路径不在白名单内）
    mockIsPathUnderAnyRoot.mockReturnValue(false);

    handlers = extractHandlers(setupApiHandlers);
  });

  describe("用户数据目录内的路径应允许打开", () => {
    it("用户数据目录内的文件应允许打开", async () => {
      const filePath = path.join(userDataDir, "Assets", "image.png");
      // 模拟路径在白名单内
      mockIsPathUnderAnyRoot.mockReturnValue(true);

      const handler = handlers.get("shell:open-path")!;
      const result = await handler({}, filePath);

      expect(result).toEqual({ success: true });
      expect(mockShellOpenPath).toHaveBeenCalledWith(filePath);
    });

    it("用户数据目录子目录内的文件应允许打开", async () => {
      const filePath = path.join(userDataDir, "Cache", "Images", "abc123.png");
      mockIsPathUnderAnyRoot.mockReturnValue(true);

      const handler = handlers.get("shell:open-path")!;
      const result = await handler({}, filePath);

      expect(result).toEqual({ success: true });
      expect(mockShellOpenPath).toHaveBeenCalledWith(filePath);
    });
  });

  describe("系统临时目录内的路径应允许打开", () => {
    it("临时目录内的文件应允许打开", async () => {
      const filePath = path.join(tmpDir, "ai-animation-studio", "uploads", "test.png");
      mockIsPathUnderAnyRoot.mockReturnValue(true);

      const handler = handlers.get("shell:open-path")!;
      const result = await handler({}, filePath);

      expect(result).toEqual({ success: true });
      expect(mockShellOpenPath).toHaveBeenCalledWith(filePath);
    });
  });

  describe("用户数据目录外的路径应拒绝", () => {
    it("系统目录下的文件应被拒绝", async () => {
      const filePath = path.join("C:", "Windows", "System32", "cmd.exe");
      mockIsPathUnderAnyRoot.mockReturnValue(false);

      const handler = handlers.get("shell:open-path")!;
      const result = await handler({}, filePath);

      expect(result).toEqual({ success: false, error: "Path is outside allowed directories" });
      expect(mockShellOpenPath).not.toHaveBeenCalled();
    });

    it("用户主目录下的文件应被拒绝", async () => {
      const filePath = path.join(os.homedir(), "secret.txt");
      mockIsPathUnderAnyRoot.mockReturnValue(false);

      const handler = handlers.get("shell:open-path")!;
      const result = await handler({}, filePath);

      expect(result).toEqual({ success: false, error: "Path is outside allowed directories" });
      expect(mockShellOpenPath).not.toHaveBeenCalled();
    });
  });

  describe("空路径或非字符串应拒绝", () => {
    it("空字符串应被拒绝", async () => {
      const handler = handlers.get("shell:open-path")!;
      const result = await handler({}, "");

      expect(result).toEqual({ success: false, error: "Invalid path" });
      expect(mockShellOpenPath).not.toHaveBeenCalled();
    });

    it("null 应被拒绝", async () => {
      const handler = handlers.get("shell:open-path")!;
      const result = await handler({}, null);

      expect(result).toEqual({ success: false, error: "Invalid path" });
      expect(mockShellOpenPath).not.toHaveBeenCalled();
    });

    it("undefined 应被拒绝", async () => {
      const handler = handlers.get("shell:open-path")!;
      const result = await handler({}, undefined);

      expect(result).toEqual({ success: false, error: "Invalid path" });
      expect(mockShellOpenPath).not.toHaveBeenCalled();
    });

    it("数字类型应被拒绝", async () => {
      const handler = handlers.get("shell:open-path")!;
      const result = await handler({}, 12345);

      expect(result).toEqual({ success: false, error: "Invalid path" });
      expect(mockShellOpenPath).not.toHaveBeenCalled();
    });
  });

  describe("路径遍历攻击应拒绝", () => {
    it("../../../etc/passwd 应被拒绝（不在白名单内）", async () => {
      const filePath = "../../../etc/passwd";
      // 路径遍历攻击解析后不在白名单内
      mockIsPathUnderAnyRoot.mockReturnValue(false);

      const handler = handlers.get("shell:open-path")!;
      const result = await handler({}, filePath);

      expect(result).toEqual({ success: false, error: "Path is outside allowed directories" });
      expect(mockShellOpenPath).not.toHaveBeenCalled();
    });

    it("用户数据目录内的路径遍历应被 isPathUnderAnyRoot 拦截", async () => {
      // 即使路径看起来在用户数据目录下，但通过 .. 遍历逃逸
      const filePath = path.join(userDataDir, "..", "..", "etc", "passwd");
      // isPathUnderAnyRoot 应正确识别路径遍历并返回 false
      mockIsPathUnderAnyRoot.mockReturnValue(false);

      const handler = handlers.get("shell:open-path")!;
      const result = await handler({}, filePath);

      expect(result).toEqual({ success: false, error: "Path is outside allowed directories" });
      expect(mockShellOpenPath).not.toHaveBeenCalled();
    });
  });
});
