import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "/tmp/test-user-data"),
    getName: vi.fn(() => "ai-animation-studio"),
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => false),
    encryptString: vi.fn(),
    decryptString: vi.fn(),
  },
}));

vi.mock("../../../database/db-schema", () => ({
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

vi.mock("../../../logging/logger", () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock("node-machine-id", () => ({
  machineIdSync: vi.fn(() => "test-machine-id"),
}));

import type { KeyStorageStrategy, StorageResult } from "../types";
import { KeyStorageManager } from "../key-storage";

function createMockStrategy(options: {
  name?: string;
  priority?: number;
  available?: boolean;
}): KeyStorageStrategy & {
  save: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
  isAvailable: ReturnType<typeof vi.fn>;
} {
  const store = new Map<string, string>();

  return {
    name: options.name ?? "mock-strategy",
    priority: options.priority ?? 10,
    isAvailable: vi.fn(() => options.available ?? true),
    save: vi.fn(async (key: string, value: string): Promise<StorageResult> => {
      store.set(key, value);
      return { ok: true, value: undefined };
    }),
    load: vi.fn(async (key: string): Promise<StorageResult<string | null>> => {
      return { ok: true, value: store.get(key) ?? null };
    }),
    delete: vi.fn(async (key: string): Promise<StorageResult> => {
      store.delete(key);
      return { ok: true, value: undefined };
    }),
    list: vi.fn(async (): Promise<StorageResult<string[]>> => {
      return { ok: true, value: [...store.keys()] };
    }),
    clear: vi.fn(async (): Promise<StorageResult> => {
      store.clear();
      return { ok: true, value: undefined };
    }),
  };
}

describe("KeyStorageManager", () => {
  let manager: KeyStorageManager;

  beforeEach(() => {
    manager = new KeyStorageManager();
  });

  describe("策略注册", () => {
    it("应按优先级排序策略", () => {
      const low = createMockStrategy({ name: "low", priority: 20 });
      const high = createMockStrategy({ name: "high", priority: 5 });

      manager.register(low);
      manager.register(high);

      const strategies = manager.getAllStrategies();
      expect(strategies[0].name).toBe("high");
      expect(strategies[1].name).toBe("low");
    });

    it("getStrategy 应返回指定名称的策略", () => {
      const strategy = createMockStrategy({ name: "test-strategy" });
      manager.register(strategy);

      const found = manager.getStrategy("test-strategy");
      expect(found).toBeDefined();
      expect(found!.name).toBe("test-strategy");
    });

    it("getStrategy 对不存在的名称应返回 undefined", () => {
      expect(manager.getStrategy("nonexistent")).toBeUndefined();
    });
  });

  describe("初始化", () => {
    it("应选择第一个可用的策略", async () => {
      const primary = createMockStrategy({ name: "primary", priority: 5 });
      const fallback = createMockStrategy({ name: "fallback", priority: 20 });

      manager.register(fallback);
      manager.register(primary);

      const result = await manager.initialize();
      expect(result.ok).toBe(true);
      expect(manager.getActiveStrategy()!.name).toBe("primary");
    });

    it("无可用策略时应返回错误", async () => {
      const unavailable = createMockStrategy({ name: "unavailable", available: false });
      manager.register(unavailable);

      const result = await manager.initialize();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("No key storage strategy available");
      }
    });

    it("重复初始化应返回成功", async () => {
      const strategy = createMockStrategy({ name: "test" });
      manager.register(strategy);

      const r1 = await manager.initialize();
      expect(r1.ok).toBe(true);

      const r2 = await manager.initialize();
      expect(r2.ok).toBe(true);
    });
  });

  describe("CRUD 操作", () => {
    let strategy: ReturnType<typeof createMockStrategy>;

    beforeEach(async () => {
      strategy = createMockStrategy({ name: "test" });
      manager.register(strategy);
      await manager.initialize();
    });

    it("save 应调用策略的 save 方法", async () => {
      const result = await manager.save("api_key", "sk-12345");
      expect(result.ok).toBe(true);
      expect(strategy.save).toHaveBeenCalledWith("api_key", "sk-12345");
    });

    it("load 应调用策略的 load 方法", async () => {
      await manager.save("api_key", "sk-12345");
      const result = await manager.load("api_key");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe("sk-12345");
      }
    });

    it("delete 应调用策略的 delete 方法", async () => {
      await manager.save("api_key", "sk-12345");
      const result = await manager.delete("api_key");
      expect(result.ok).toBe(true);
      expect(strategy.delete).toHaveBeenCalledWith("api_key");
    });

    it("list 应调用策略的 list 方法", async () => {
      await manager.save("key1", "val1");
      await manager.save("key2", "val2");
      const result = await manager.list();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain("key1");
        expect(result.value).toContain("key2");
      }
    });

    it("clear 应调用策略的 clear 方法", async () => {
      await manager.save("key1", "val1");
      const result = await manager.clear();
      expect(result.ok).toBe(true);
      expect(strategy.clear).toHaveBeenCalled();
    });
  });

  describe("策略失败场景", () => {
    it("策略 save 返回 ok:false 时应传播错误", async () => {
      const failingStrategy = createMockStrategy({ name: "failing" });
      failingStrategy.save.mockResolvedValue({ ok: false, error: "加密失败" });

      manager.register(failingStrategy);
      await manager.initialize();

      const result = await manager.save("key1", "secret");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("加密失败");
      }
    });

    it("策略 load 返回 ok:false 时应传播错误", async () => {
      const failingStrategy = createMockStrategy({ name: "failing" });
      failingStrategy.load.mockResolvedValue({ ok: false, error: "解密失败" });

      manager.register(failingStrategy);
      await manager.initialize();

      const result = await manager.load("key1");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("解密失败");
      }
    });

    it("未初始化时 CRUD 操作应自动初始化", async () => {
      const strategy = createMockStrategy({ name: "auto-init" });
      manager.register(strategy);

      const result = await manager.save("key1", "val1");
      expect(result.ok).toBe(true);
      expect(manager.getActiveStrategy()).toBeDefined();
    });

    it("无策略可用时 CRUD 操作应返回错误", async () => {
      const result = await manager.save("key1", "val1");
      expect(result.ok).toBe(false);
    });
  });

  describe("策略选择与 fallback", () => {
    it("高优先级策略不可用时应选择次优策略", async () => {
      const primary = createMockStrategy({ name: "primary", priority: 5, available: false });
      const fallback = createMockStrategy({ name: "fallback", priority: 20, available: true });

      manager.register(primary);
      manager.register(fallback);

      const result = await manager.initialize();
      expect(result.ok).toBe(true);
      expect(manager.getActiveStrategy()!.name).toBe("fallback");
    });
  });
});
