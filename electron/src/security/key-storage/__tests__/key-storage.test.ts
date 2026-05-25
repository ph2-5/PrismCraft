/**
 * security/key-storage/__tests__/key-storage.test.ts
 *
 * 密钥存储模块单元测试
 */

import { describe, it, expect, beforeEach } from "vitest";
import { KeyStorageManager } from "../key-storage";
import type { KeyStorageStrategy, StorageResult } from "../types";

/** 创建 mock 策略用于测试 */
function createMockStrategy(name: string, priority: number, available: boolean): KeyStorageStrategy {
  const store = new Map<string, string>();

  return {
    name,
    priority,
    isAvailable: () => available,
    save: async (key: string, value: string): Promise<StorageResult> => {
      store.set(key, value);
      return { ok: true, value: undefined };
    },
    load: async (key: string): Promise<StorageResult<string | null>> => {
      return { ok: true, value: store.get(key) ?? null };
    },
    delete: async (key: string): Promise<StorageResult> => {
      store.delete(key);
      return { ok: true, value: undefined };
    },
    list: async (): Promise<StorageResult<string[]>> => {
      return { ok: true, value: Array.from(store.keys()) };
    },
    clear: async (): Promise<StorageResult> => {
      store.clear();
      return { ok: true, value: undefined };
    },
  };
}

describe("KeyStorageManager", () => {
  let manager: KeyStorageManager;

  beforeEach(() => {
    manager = new KeyStorageManager();
  });

  describe("strategy registration", () => {
    it("should register strategies", () => {
      const strategy = createMockStrategy("test", 1, true);
      manager.register(strategy);
      expect(manager.getStrategy("test")).toBe(strategy);
    });

    it("should sort strategies by priority", () => {
      const low = createMockStrategy("low", 99, true);
      const high = createMockStrategy("high", 1, true);
      const mid = createMockStrategy("mid", 50, true);

      manager.register(low);
      manager.register(high);
      manager.register(mid);

      const all = manager.getAllStrategies();
      expect(all[0].name).toBe("high");
      expect(all[1].name).toBe("mid");
      expect(all[2].name).toBe("low");
    });

    it("should return undefined for unknown strategy", () => {
      expect(manager.getStrategy("unknown")).toBeUndefined();
    });
  });

  describe("initialization", () => {
    it("should select first available strategy", async () => {
      const unavailable = createMockStrategy("unavailable", 1, false);
      const available = createMockStrategy("available", 2, true);

      manager.register(unavailable);
      manager.register(available);

      const result = await manager.initialize();
      expect(result.ok).toBe(true);
      expect(manager.getActiveStrategy()?.name).toBe("available");
    });

    it("should fail when no strategy available", async () => {
      const unavailable = createMockStrategy("unavailable", 1, false);
      manager.register(unavailable);

      const result = await manager.initialize();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("No key storage strategy");
      }
    });

    it("should not reinitialize if already initialized", async () => {
      const strategy = createMockStrategy("test", 1, true);
      manager.register(strategy);

      await manager.initialize();
      const active = manager.getActiveStrategy();
      await manager.initialize();
      expect(manager.getActiveStrategy()).toBe(active);
    });
  });

  describe("CRUD operations", () => {
    beforeEach(async () => {
      const strategy = createMockStrategy("test", 1, true);
      manager.register(strategy);
      await manager.initialize();
    });

    it("should save and load a key", async () => {
      const saveResult = await manager.save("openai", "sk-test-123");
      expect(saveResult.ok).toBe(true);

      const loadResult = await manager.load("openai");
      expect(loadResult.ok).toBe(true);
      if (loadResult.ok) {
        expect(loadResult.value).toBe("sk-test-123");
      }
    });

    it("should return null for non-existent key", async () => {
      const result = await manager.load("non-existent");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it("should delete a key", async () => {
      await manager.save("openai", "sk-test-123");
      const deleteResult = await manager.delete("openai");
      expect(deleteResult.ok).toBe(true);

      const loadResult = await manager.load("openai");
      if (loadResult.ok) {
        expect(loadResult.value).toBeNull();
      }
    });

    it("should list all keys", async () => {
      await manager.save("openai", "sk-1");
      await manager.save("anthropic", "sk-2");
      await manager.save("google", "sk-3");

      const result = await manager.list();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(3);
        expect(result.value).toContain("openai");
        expect(result.value).toContain("anthropic");
        expect(result.value).toContain("google");
      }
    });

    it("should clear all keys", async () => {
      await manager.save("openai", "sk-1");
      await manager.save("anthropic", "sk-2");

      const clearResult = await manager.clear();
      expect(clearResult.ok).toBe(true);

      const listResult = await manager.list();
      if (listResult.ok) {
        expect(listResult.value).toHaveLength(0);
      }
    });

    it("should return error when no strategy available", async () => {
      const emptyManager = new KeyStorageManager();
      const result = await emptyManager.save("test", "value");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("No storage strategy");
      }
    });
  });

  describe("strategy selection", () => {
    it("should prefer higher priority strategy", async () => {
      const primary = createMockStrategy("primary", 1, true);
      const fallback = createMockStrategy("fallback", 99, true);

      manager.register(fallback);
      manager.register(primary);

      await manager.initialize();
      expect(manager.getActiveStrategy()?.name).toBe("primary");
    });

    it("should fall back when primary unavailable", async () => {
      const primary = createMockStrategy("primary", 1, false);
      const fallback = createMockStrategy("fallback", 99, true);

      manager.register(fallback);
      manager.register(primary);

      await manager.initialize();
      expect(manager.getActiveStrategy()?.name).toBe("fallback");
    });
  });
});
