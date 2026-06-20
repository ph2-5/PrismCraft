/**
 * R128: IPC handler 必须校验输入
 * 回归防护: 确保 config-storage IPC handler 运行时校验输入结构
 *           （isValidConfigMetadata、isValidVersion），
 *           secure-config handler 校验 apiKey 长度，
 *           防止恶意渲染进程传入任意对象污染 store 或存储超长字符串。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Module from "module";

// 提升 mock，确保在模块导入前生效（vi.mock 工厂会被提升，不能引用外部变量）
const {
  mockIpcMainHandle,
  mockStoreGet,
  mockStoreSet,
  mockKeyStorageSave,
  electronMock,
} = vi.hoisted(() => {
  // 先定义 mock 函数，再组装 electronMock（避免对象属性间相互引用）
  const fnIpcMainHandle = vi.fn();
  const fnStoreGet = vi.fn(() => null);
  const fnStoreSet = vi.fn();
  const fnSafeStorageEncrypt = vi.fn(() => Buffer.from("encrypted"));
  const fnKeyStorageSave = vi.fn().mockResolvedValue({ ok: true });

  const mock = {
    app: {
      getPath: vi.fn(() => "/tmp/test-user-data"),
      getName: vi.fn(() => "ai-animation-studio"),
      getVersion: vi.fn(() => "1.0.0"),
    },
    ipcMain: {
      handle: fnIpcMainHandle,
    },
    safeStorage: {
      isEncryptionAvailable: vi.fn(() => true),
      encryptString: fnSafeStorageEncrypt,
    },
    BrowserWindow: {
      getAllWindows: vi.fn(() => []),
    },
  };

  return {
    mockIpcMainHandle: fnIpcMainHandle,
    mockStoreGet: fnStoreGet,
    mockStoreSet: fnStoreSet,
    mockSafeStorageEncrypt: fnSafeStorageEncrypt,
    mockAppGetPath: mock.app.getPath,
    mockKeyStorageSave: fnKeyStorageSave,
    electronMock: mock,
  };
});

// Mock electron 模块（拦截 ESM import）
vi.mock("electron", () => ({ ...electronMock, default: electronMock }));

// Mock electron-store
vi.mock("electron-store", () => ({
  default: vi.fn(() => ({
    get: mockStoreGet,
    set: mockStoreSet,
  })),
}));

// Mock logger
vi.mock("../logging/logger", () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Mock key-storage（secure-config 依赖）
vi.mock("../security/key-storage/key-storage", () => ({
  keyStorage: {
    save: mockKeyStorageSave,
    load: vi.fn().mockResolvedValue({ ok: true, value: null }),
    delete: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

import { registerConfigStorageHandlers } from "../handlers/config-storage";
import { registerSecureConfigHandlers } from "../handlers/secure-config";

// 拦截 CJS require("electron") 调用（config-storage.ts 内部使用 require 而非 import）
const originalModuleLoad = Module._load;
let electronMockOverride: typeof electronMock | null = null;

Module._load = function (request: string, parent?: NodeJS.Module, isMain?: boolean) {
  if (request === "electron" && electronMockOverride) {
    return electronMockOverride;
  }
  return originalModuleLoad.call(Module, request, parent, isMain);
} as typeof Module._load;

/**
 * 从 ipcMain.handle 调用中提取 handler 函数映射。
 * 每次调用 ipcMain.handle(channel, handler) 都会将 handler 注册到 map 中。
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

describe("R128: IPC handler 必须校验输入", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreGet.mockReturnValue(null);
    mockKeyStorageSave.mockResolvedValue({ ok: true });
    // 启用 CJS require 拦截
    electronMockOverride = electronMock;
  });

  afterEach(() => {
    electronMockOverride = null;
  });

  describe("config:metadata:save 输入校验", () => {
    let handlers: Map<string, (...args: unknown[]) => unknown>;

    beforeEach(() => {
      handlers = extractHandlers(registerConfigStorageHandlers);
    });

    it("传入无效 metadata（缺少 providers）应返回 false", async () => {
      const handler = handlers.get("config:metadata:save")!;
      // 缺少 providers 字段
      const invalidMetadata = {
        updatedAt: 1234567890,
        version: 1,
      };

      const result = await handler({}, invalidMetadata);

      expect(result).toBe(false);
      // 不应调用 store.set 写入无效数据
      expect(mockStoreSet).not.toHaveBeenCalled();
    });

    it("传入无效 updatedAt（字符串）应返回 false", async () => {
      const handler = handlers.get("config:metadata:save")!;
      // updatedAt 应为 number，这里传字符串
      const invalidMetadata = {
        providers: {},
        updatedAt: "not-a-number",
        version: 1,
      };

      const result = await handler({}, invalidMetadata);

      expect(result).toBe(false);
      expect(mockStoreSet).not.toHaveBeenCalled();
    });
  });

  describe("config:history:restore 输入校验", () => {
    let handlers: Map<string, (...args: unknown[]) => unknown>;

    beforeEach(() => {
      handlers = extractHandlers(registerConfigStorageHandlers);
    });

    it("传入负数 version 应返回 false", async () => {
      const handler = handlers.get("config:history:restore")!;

      const result = await handler({}, -1);

      expect(result).toBe(false);
    });

    it("传入非整数 version 应返回 false", async () => {
      const handler = handlers.get("config:history:restore")!;

      const result = await handler({}, 1.5);

      expect(result).toBe(false);
    });
  });

  describe("secure-config:save 输入校验", () => {
    let handlers: Map<string, (...args: unknown[]) => unknown>;

    beforeEach(() => {
      handlers = extractHandlers(registerSecureConfigHandlers);
    });

    it("传入超长 apiKey（>4096）应返回失败", async () => {
      const handler = handlers.get("secure-config:save")!;
      const longApiKey = "a".repeat(4097);
      const validProviderId = "openai";

      const result = await handler({}, validProviderId, longApiKey);

      expect(result).toEqual({ success: false, error: "Invalid apiKey" });
      // 不应调用 keyStorage.save 存储超长字符串
      expect(mockKeyStorageSave).not.toHaveBeenCalled();
    });

    it("传入空 apiKey 应返回失败", async () => {
      const handler = handlers.get("secure-config:save")!;
      const validProviderId = "openai";

      const result = await handler({}, validProviderId, "");

      expect(result).toEqual({ success: false, error: "Invalid apiKey" });
      expect(mockKeyStorageSave).not.toHaveBeenCalled();
    });
  });
});
