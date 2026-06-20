/**
 * R120: 解密失败不得回退明文
 * 回归防护: 确保 safeStorage 策略的 load 方法在解密失败时必须返回空对象 "{}"，
 *           不得回退到原始明文数据。
 *
 * 攻击场景：攻击者篡改 encrypted-keys.json 文件，将密文替换为明文 JSON。
 *           若解密失败时回退到原始明文，则攻击者可绕过加密保护直接读取凭据。
 *           正确行为：解密失败返回 "{}"，强制重新初始化，不泄露任何已存储的密钥。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// 提升 mock，确保在模块导入前生效
const {
  mockSafeStorageEncrypt,
  mockSafeStorageDecrypt,
  mockSafeStorageIsAvailable,
  mockFsReadFileSync,
  mockFsExistsSync,
  mockFsWriteFileSync,
  mockFsRenameSync,
  mockFsMkdirSync,
  loggerWarn,
  loggerError,
} = vi.hoisted(() => ({
  mockSafeStorageEncrypt: vi.fn(() => Buffer.from("encrypted-data")),
  mockSafeStorageDecrypt: vi.fn(),
  mockSafeStorageIsAvailable: vi.fn(() => true),
  mockFsReadFileSync: vi.fn(),
  mockFsExistsSync: vi.fn(() => false),
  mockFsWriteFileSync: vi.fn(),
  mockFsRenameSync: vi.fn(),
  mockFsMkdirSync: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "/tmp/test-user-data"),
    getName: vi.fn(() => "ai-animation-studio"),
  },
  safeStorage: {
    isEncryptionAvailable: mockSafeStorageIsAvailable,
    encryptString: mockSafeStorageEncrypt,
    decryptString: mockSafeStorageDecrypt,
  },
}));

vi.mock("../../../../database/db-schema", () => ({
  getUserDataPath: vi.fn(() => "/tmp/test-user-data"),
  getDbPaths: vi.fn(() => ({
    DB_PATH: "/tmp/test-database.db",
    DB_TYPE_FILE: "/tmp/test-database.db.type",
  })),
  ensureDbDir: vi.fn(),
  getSchemaSQL: vi.fn(() => ""),
  getAllTableDefs: vi.fn(() => []),
  CURRENT_SCHEMA_VERSION: 4,
}));

vi.mock("../../../../logging/logger", () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: loggerWarn,
    error: loggerError,
    debug: vi.fn(),
  })),
}));

vi.mock("fs", () => ({
  default: {
    existsSync: mockFsExistsSync,
    readFileSync: mockFsReadFileSync,
    writeFileSync: mockFsWriteFileSync,
    renameSync: mockFsRenameSync,
    mkdirSync: mockFsMkdirSync,
    unlinkSync: vi.fn(),
  },
}));

import { SafeStorageStrategy } from "../safe-storage.strategy";

describe("R120: 解密失败不得回退明文", () => {
  let strategy: SafeStorageStrategy;

  beforeEach(() => {
    // 手动清除各 mock 的调用记录（不重置实现）
    mockSafeStorageEncrypt.mockClear();
    mockSafeStorageDecrypt.mockClear();
    mockSafeStorageIsAvailable.mockClear();
    mockFsReadFileSync.mockClear();
    mockFsExistsSync.mockClear();
    mockFsWriteFileSync.mockClear();
    mockFsRenameSync.mockClear();
    mockFsMkdirSync.mockClear();
    loggerWarn.mockClear();
    loggerError.mockClear();

    // 重新设置默认实现
    mockSafeStorageIsAvailable.mockReturnValue(true);
    mockSafeStorageEncrypt.mockReturnValue(Buffer.from("encrypted-data"));
    mockSafeStorageDecrypt.mockReset();
    mockFsExistsSync.mockReset();
    mockFsExistsSync.mockReturnValue(false);
    mockFsReadFileSync.mockReset();
    mockFsMkdirSync.mockReset();

    strategy = new SafeStorageStrategy();
  });

  describe("解密成功时应返回解密后的内容", () => {
    it("应正确解密并返回存储的密钥", async () => {
      // 模拟已加密的文件存在
      mockFsExistsSync.mockImplementation((p: unknown) => {
        return String(p).includes("encrypted-keys.json");
      });
      // 模拟文件内容为加密后的 base64 字符串
      const encryptedBase64 = Buffer.from("encrypted-data").toString("base64");
      mockFsReadFileSync.mockReturnValue(encryptedBase64);
      // 模拟解密成功，返回包含密钥的 JSON
      const decryptedJson = JSON.stringify({ openai: "sk-test-123", google: "AIza-test" });
      mockSafeStorageDecrypt.mockReturnValue(decryptedJson);

      const result = await strategy.load("openai");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe("sk-test-123");
      }
      // 应调用 decryptString
      expect(mockSafeStorageDecrypt).toHaveBeenCalled();
    });
  });

  describe("解密失败时应返回空结果，不返回原始明文", () => {
    it("解密抛错时应返回 null（空对象解析后无密钥）", async () => {
      // 模拟已加密的文件存在
      mockFsExistsSync.mockImplementation((p: unknown) => {
        return String(p).includes("encrypted-keys.json");
      });
      // 模拟文件内容为"明文攻击"——攻击者将密文替换为明文 JSON
      const plaintextAttack = JSON.stringify({ openai: "sk-stolen-key", google: "AIza-stolen" });
      mockFsReadFileSync.mockReturnValue(Buffer.from(plaintextAttack).toString("base64"));
      // 模拟解密失败（因为内容不是有效的加密数据）
      mockSafeStorageDecrypt.mockImplementation(() => {
        throw new Error("Could not decrypt");
      });

      const result = await strategy.load("openai");

      expect(result.ok).toBe(true);
      if (result.ok) {
        // 应返回 null（空对象 "{}" 解析后无 openai 密钥），不返回明文中的 "sk-stolen-key"
        expect(result.value).toBeNull();
      }
      // 不应返回明文中的密钥
      if (result.ok && result.value) {
        expect(result.value).not.toBe("sk-stolen-key");
      }
    });

    it("解密失败时应记录 warn 日志", async () => {
      mockFsExistsSync.mockImplementation((p: unknown) => {
        return String(p).includes("encrypted-keys.json");
      });
      mockFsReadFileSync.mockReturnValue(Buffer.from("tampered-data").toString("base64"));
      mockSafeStorageDecrypt.mockImplementation(() => {
        throw new Error("Could not decrypt");
      });

      await strategy.load("any-key");

      // 应记录 warn 日志说明解密失败且不回退明文
      expect(loggerWarn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to decrypt with safeStorage"),
      );
    });

    it("解密失败后 list 应返回空数组（无密钥泄露）", async () => {
      mockFsExistsSync.mockImplementation((p: unknown) => {
        return String(p).includes("encrypted-keys.json");
      });
      const plaintextAttack = JSON.stringify({ stolen_key: "sk-secret-value" });
      mockFsReadFileSync.mockReturnValue(Buffer.from(plaintextAttack).toString("base64"));
      mockSafeStorageDecrypt.mockImplementation(() => {
        throw new Error("Could not decrypt");
      });

      const result = await strategy.list();

      expect(result.ok).toBe(true);
      if (result.ok) {
        // 应返回空数组，不泄露明文中的密钥名
        expect(result.value).toEqual([]);
        expect(result.value).not.toContain("stolen_key");
      }
    });

    it("解密失败后 load 任何 key 都应返回 null", async () => {
      mockFsExistsSync.mockImplementation((p: unknown) => {
        return String(p).includes("encrypted-keys.json");
      });
      const plaintextAttack = JSON.stringify({
        key1: "secret1",
        key2: "secret2",
        key3: "secret3",
      });
      mockFsReadFileSync.mockReturnValue(Buffer.from(plaintextAttack).toString("base64"));
      mockSafeStorageDecrypt.mockImplementation(() => {
        throw new Error("Could not decrypt");
      });

      // 尝试加载明文中的每个 key
      for (const key of ["key1", "key2", "key3"]) {
        const result = await strategy.load(key);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value).toBeNull();
          if (result.value) {
            expect(result.value).not.toContain("secret");
          }
        }
      }
    });
  });
});
