/**
 * R182: /api/config/set 路由必须使用 saveConfigAsync 持久化配置
 *
 * 回归规则目的：
 *   修复 C1 critical bug — 前端 saveConfig 流程将整个 config 序列化为 JSON 字符串
 *   作为 value 发送至 /api/config/set，applyConfigValue 的 `typeof value === "object"`
 *   条件对字符串永远为 false，导致明文 apiKey 写入磁盘 config.json 的字符串字段，
 *   且 keyStorage 不被调用，apiKey 更新被静默丢失。
 *
 *   R182 要求：
 *   1. applyConfigValue 必须正确解析字符串 value（JSON.parse）
 *   2. /api/config/set 必须使用 saveConfigAsync（而非同步 saveConfig）持久化
 *   3. 同步 saveConfig 检测到明文 apiKey 必须抛错（而非静默 warn）
 *
 * 被测代码：
 *   - electron/src/main-common.ts (applyConfigValue)
 *   - electron/src/api/route-groups/core-routes.ts (config/set handler)
 *   - electron/src/handlers/config.ts (saveConfig / saveConfigAsync)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============ Mocks ============
const {
  mockKeyStorageSave,
  mockKeyStorageLoad,
  mockReadFileSync,
  mockExistsSync,
  mockWriteFileSync,
  electronMock,
} = vi.hoisted(() => {
  const fnKeyStorageSave = vi.fn().mockResolvedValue({ ok: true });
  const fnKeyStorageLoad = vi.fn().mockResolvedValue({ ok: true, value: null });
  const fnSafeStorageEncrypt = vi.fn(() => Buffer.from("encrypted"));

  // fs mocks 必须在 vi.hoisted 内定义，因为 vi.mock 工厂会被提升到文件顶部
  const fnReadFileSync = vi.fn();
  const fnExistsSync = vi.fn(() => false);
  const fnWriteFileSync = vi.fn();

  const mock = {
    app: {
      getPath: vi.fn(() => "/tmp/test-user-data"),
      getName: vi.fn(() => "ai-animation-studio"),
      getVersion: vi.fn(() => "1.0.0"),
    },
    ipcMain: { handle: vi.fn() },
    safeStorage: {
      isEncryptionAvailable: vi.fn(() => true),
      encryptString: fnSafeStorageEncrypt,
    },
    BrowserWindow: { getAllWindows: vi.fn(() => []) },
  };

  return {
    mockKeyStorageSave: fnKeyStorageSave,
    mockKeyStorageLoad: fnKeyStorageLoad,
    mockReadFileSync: fnReadFileSync,
    mockExistsSync: fnExistsSync,
    mockWriteFileSync: fnWriteFileSync,
    electronMock: mock,
  };
});

vi.mock("electron", () => ({ ...electronMock, default: electronMock }));

vi.mock("electron-store", () => ({
  default: vi.fn(() => ({ get: vi.fn(() => null), set: vi.fn() })),
}));

vi.mock("../logging/logger", () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock("../security/key-storage/key-storage", () => ({
  keyStorage: {
    save: mockKeyStorageSave,
    load: mockKeyStorageLoad,
    delete: vi.fn().mockResolvedValue({ ok: true }),
    list: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    clear: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

vi.mock("fs", () => ({
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
    renameSync: vi.fn(),
    copyFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  renameSync: vi.fn(),
  copyFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

import { applyConfigValue, validateConfigValue } from "../main-common";
import { saveConfig, saveConfigAsync, loadConfigAsync } from "../handlers/config";

describe("R182: applyConfigValue 正确处理字符串 value", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("当 value 是 JSON 字符串时，必须 JSON.parse 后再 Object.assign", () => {
    // 模拟前端 saveConfig 流程：将 config 序列化为字符串发送
    const config: Record<string, unknown> = {
      version: 1,
      providers: [],
      mapping: {},
    };
    const stringValue = JSON.stringify({
      version: 1,
      providers: [{ id: "p1", apiKey: "sk-test-key-12345" }],
      mapping: {},
    });

    applyConfigValue(config, "ai_animation_studio_api_config", stringValue);

    // 必须正确解析字符串并合并到 config
    expect(config.version).toBe(1);
    expect(Array.isArray(config.providers)).toBe(true);
    expect((config.providers as Array<{ id: string }>)[0].id).toBe("p1");
  });

  it("当 value 是对象时，直接 Object.assign", () => {
    const config: Record<string, unknown> = { version: 1 };
    const objValue = { version: 2, providers: [{ id: "p2" }] };

    applyConfigValue(config, "ai_animation_studio_api_config", objValue);

    expect(config.version).toBe(2);
    expect((config.providers as Array<{ id: string }>)[0].id).toBe("p2");
  });

  it("当 value 是畸形 JSON 字符串时，必须忽略而非写入乱码", () => {
    const config: Record<string, unknown> = { version: 1 };
    const badString = "{not valid json";

    applyConfigValue(config, "ai_animation_studio_api_config", badString);

    // 不能让畸形字符串污染 config
    expect(config.version).toBe(1);
    expect(config.providers).toBeUndefined();
  });

  it("当 value 是非字符串非对象类型时（如数字），必须忽略", () => {
    const config: Record<string, unknown> = { version: 1 };

    applyConfigValue(config, "ai_animation_studio_api_config", 12345);

    expect(config.version).toBe(1);
    // 不应有 ai_animation_studio_api_config 字段被设置为 12345
  });
});

describe("R182: saveConfig (sync) 检测到明文 apiKey 必须抛错", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
  });

  it("当 config.providers[*].apiKey 是明文（非 $secure: 引用）时，sync saveConfig 必须抛错", () => {
    const config = {
      version: 1,
      providers: [
        { id: "p1", name: "Test", baseUrl: "https://api.test.com", apiKey: "sk-plaintext-key-12345", models: [] },
      ],
      mapping: {},
      fallback: { enabled: true, order: ["text"] },
    };

    expect(() => saveConfig(config)).toThrow(/plaintext apiKey.*saveConfigAsync/);
  });

  it("当所有 apiKey 都是 $secure: 引用时，sync saveConfig 不抛错", () => {
    const config = {
      version: 1,
      providers: [
        { id: "p1", name: "Test", baseUrl: "https://api.test.com", apiKey: "$secure:p1", models: [] },
      ],
      mapping: {},
      fallback: { enabled: true, order: ["text"] },
    };

    expect(() => saveConfig(config)).not.toThrow();
  });
});

describe("R182: saveConfigAsync 必须将 apiKey 持久化到 keyStorage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
  });

  it("saveConfigAsync 必须调用 keyStorage.save 并将 apiKey 替换为 $secure: 引用", async () => {
    const config = {
      version: 1,
      providers: [
        { id: "p1", name: "Test", baseUrl: "https://api.test.com", apiKey: "sk-test-key-12345", models: [] },
      ],
      mapping: {},
      fallback: { enabled: true, order: ["text"] },
    };

    const result = await saveConfigAsync(config);
    expect(result).toBe(true);
    // keyStorage.save 必须被调用
    expect(mockKeyStorageSave).toHaveBeenCalledWith("api-key:p1", "sk-test-key-12345");
    // 写入磁盘的内容必须将 apiKey 替换为 $secure: 引用
    const writeCall = mockWriteFileSync.mock.calls[0];
    const writtenContent = writeCall?.[1] as string;
    const parsed = JSON.parse(writtenContent);
    expect(parsed.providers[0].apiKey).toBe("$secure:p1");
    // 明文 apiKey 不能出现在磁盘文件中
    expect(writtenContent).not.toContain("sk-test-key-12345");
  });

  it("已迁移的 $secure: 引用不应重复保存到 keyStorage", async () => {
    const config = {
      version: 1,
      providers: [
        { id: "p1", name: "Test", baseUrl: "https://api.test.com", apiKey: "$secure:p1", models: [] },
      ],
      mapping: {},
      fallback: { enabled: true, order: ["text"] },
    };

    await saveConfigAsync(config);

    // keyStorage.save 不应被调用（因为已经是引用了）
    expect(mockKeyStorageSave).not.toHaveBeenCalled();
  });
});

describe("R182: validateConfigValue 扩展协议黑名单", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("data: 协议字符串必须被拒绝", () => {
    expect(validateConfigValue("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  it("javascript: 协议字符串必须被拒绝", () => {
    expect(validateConfigValue("javascript:alert(1)")).toBe(false);
  });

  it("vbscript: 协议字符串必须被拒绝", () => {
    expect(validateConfigValue("vbscript:msgbox(1)")).toBe(false);
  });

  it("file: 协议字符串必须被拒绝", () => {
    expect(validateConfigValue("file:///etc/passwd")).toBe(false);
  });

  it("blob: 协议字符串必须被拒绝", () => {
    expect(validateConfigValue("blob:https://example.com/uuid")).toBe(false);
  });

  it("http/https URL 必须通过校验", () => {
    expect(validateConfigValue("https://api.openai.com/v1")).toBe(true);
    expect(validateConfigValue("http://localhost:3000")).toBe(true);
  });

  it("普通字符串必须通过校验", () => {
    expect(validateConfigValue("sk-test-key-12345")).toBe(true);
    expect(validateConfigValue("hello world")).toBe(true);
  });
});

describe("R182: loadConfigAsync 必须从 keyStorage 解析 $secure: 引用", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
  });

  it("loadConfigAsync 必须将 $secure: 引用替换为 keyStorage 中的实际值", async () => {
    // 配置文件中有 $secure: 引用
    mockReadFileSync.mockReturnValue(JSON.stringify({
      version: 1,
      providers: [
        { id: "p1", name: "Test", baseUrl: "https://api.test.com", apiKey: "$secure:p1", models: [] },
      ],
      mapping: {},
      fallback: { enabled: true, order: ["text"] },
      _migratedToSecureStorage: true,
    }));

    // keyStorage.load 返回实际 apiKey
    mockKeyStorageLoad.mockResolvedValue({ ok: true, value: "sk-real-api-key-67890" });

    const config = await loadConfigAsync();

    // 返回的 apiKey 必须是实际值，不是 $secure: 引用
    expect(config.providers[0].apiKey).toBe("sk-real-api-key-67890");
    expect(mockKeyStorageLoad).toHaveBeenCalledWith("api-key:p1");
  });

  it("keyStorage 解析失败时，apiKey 必须回退为空字符串", async () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({
      version: 1,
      providers: [
        { id: "p1", name: "Test", baseUrl: "https://api.test.com", apiKey: "$secure:p1", models: [] },
      ],
      mapping: {},
      fallback: { enabled: true, order: ["text"] },
      _migratedToSecureStorage: true,
    }));

    mockKeyStorageLoad.mockResolvedValue({ ok: false, error: "decrypt failed" });

    const config = await loadConfigAsync();

    expect(config.providers[0].apiKey).toBe("");
  });
});
