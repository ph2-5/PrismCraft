import { describe, it, expect, vi, afterEach } from "vitest";
import {
  container,
  resolve,
  overrideToken,
  resetContainer,
  TOKEN_IDS,
  getTokenRegistry,
} from "@/infrastructure/di/container";
import { createToken } from "@/infrastructure/di/types";
import { eventBus as originalEventBus } from "@/shared/event-bus";
import { apiClient as originalApiClient } from "@/infrastructure/api";

// 创建与真实 token 同 id 的 Token 对象，用于 resolve() / overrideToken()。
// registry 按 token.id 查找注册项，因此同 id 的 Token 可解析到同一注册项。
const eventBusToken = () => createToken<unknown>("eventBus", () => null);
const apiClientToken = () => createToken<unknown>("apiClient", () => null);

describe("DI Container", () => {
  afterEach(() => {
    // resetContainer() 仅清理 singleton 缓存，不恢复被 override 的 factory。
    // 因此先 re-override 恢复原始 factory，再清缓存，确保测试间隔离。
    overrideToken(eventBusToken(), () => originalEventBus);
    overrideToken(apiClientToken(), () => originalApiClient);
    resetContainer();
  });

  // ── 1. Proxy 行为 ──────────────────────────────────────────────────────

  describe("Proxy 行为", () => {
    it("访问已注册 token 返回对应实例", () => {
      const result = container.eventBus;
      expect(result).toBeDefined();
      expect(result).toBe(originalEventBus);
    });

    it("singleton 模式下多次访问返回同一实例", () => {
      const a = container.eventBus;
      const b = container.eventBus;
      expect(a).toBe(b);
    });

    it("访问未知 token 抛错（含 token 名）", () => {
      expect(() => (container as Record<string, unknown>).nonExistentToken).toThrow(
        'Unknown container token: "nonExistentToken"',
      );
    });

    it("访问 then 不抛错（白名单）", () => {
      expect(() => (container as unknown as { then?: unknown }).then).not.toThrow();
      expect((container as unknown as { then?: unknown }).then).toBeUndefined();
    });

    it("访问 toJSON 不抛错（白名单）", () => {
      expect(() => (container as unknown as { toJSON?: unknown }).toJSON).not.toThrow();
      expect((container as unknown as { toJSON?: unknown }).toJSON).toBeUndefined();
    });

    it("访问 __proto__ 不抛出 Unknown container token 错误", () => {
      // __proto__ 继承自 Object.prototype，in 检查为 true，走注册项查找分支。
      // 白名单的目的是防止 "Unknown container token" 错误，此处验证该错误不出现。
      try {
        (container as unknown as { __proto__?: unknown }).__proto__;
      } catch (e) {
        expect((e as Error).message).not.toContain("Unknown container token");
      }
    });
  });

  // ── 2. overrideToken ────────────────────────────────────────────────────

  describe("overrideToken", () => {
    it("overrideToken 替换 factory 后访问 token 返回新实例", () => {
      const mockInstance = { mock: true };
      const factory = vi.fn(() => mockInstance);

      overrideToken(eventBusToken(), factory);

      const result = container.eventBus;
      expect(result).toBe(mockInstance);
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it("overrideToken 后 singleton 缓存新实例", () => {
      const mockInstance = { cached: true };
      const factory = vi.fn(() => mockInstance);

      overrideToken(eventBusToken(), factory);

      const first = container.eventBus;
      const second = container.eventBus;

      expect(first).toBe(second);
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it("overrideToken 替换后 resetContainer 不恢复原始 factory（仅清缓存）", () => {
      let callCount = 0;
      const factory = vi.fn(() => ({ count: ++callCount }));

      overrideToken(eventBusToken(), factory);

      const first = container.eventBus as unknown as { count: number };
      expect(first.count).toBe(1);
      expect(factory).toHaveBeenCalledTimes(1);

      resetContainer();

      // 缓存清除后重新执行 overridden factory（非原始 factory）
      const second = container.eventBus as unknown as { count: number };
      expect(second.count).toBe(2);
      expect(second).not.toBe(first);
      expect(factory).toHaveBeenCalledTimes(2);
    });
  });

  // ── 3. resetContainer ───────────────────────────────────────────────────

  describe("resetContainer", () => {
    it("resetContainer 清理 singleton 缓存", () => {
      let callCount = 0;
      overrideToken(eventBusToken(), () => ({ id: ++callCount }));

      const first = container.eventBus as unknown as { id: number };
      expect(first.id).toBe(1);

      const cached = container.eventBus;
      expect(cached).toBe(first);
      expect(callCount).toBe(1);

      resetContainer();

      const second = container.eventBus as unknown as { id: number };
      expect(second).not.toBe(first);
      expect(second.id).toBe(2);
      expect(callCount).toBe(2);
    });

    it("resetContainer 后再次访问 token 重新执行 factory", () => {
      let callCount = 0;
      overrideToken(eventBusToken(), () => ({ n: ++callCount }));

      container.eventBus;
      expect(callCount).toBe(1);

      resetContainer();
      container.eventBus;
      expect(callCount).toBe(2);

      resetContainer();
      container.eventBus;
      expect(callCount).toBe(3);
    });
  });

  // ── 4. TOKEN_IDS 完整性 ─────────────────────────────────────────────────

  describe("TOKEN_IDS", () => {
    it("TOKEN_IDS 包含预期的关键 token", () => {
      expect(TOKEN_IDS.videoProvider).toBe("videoProvider");
      expect(TOKEN_IDS.imageProvider).toBe("imageProvider");
      expect(TOKEN_IDS.characterStorage).toBe("characterStorage");
      expect(TOKEN_IDS.eventBus).toBe("eventBus");
      expect(TOKEN_IDS.apiClient).toBe("apiClient");
      expect(TOKEN_IDS.mediaAssetRepository).toBe("mediaAssetRepository");
      expect(TOKEN_IDS.syncEngine).toBe("syncEngine");
      expect(TOKEN_IDS.agentConversationManager).toBe("agentConversationManager");
    });

    it("TOKEN_IDS 被冻结（不可变）", () => {
      expect(Object.isFrozen(TOKEN_IDS)).toBe(true);
    });

    it("TOKEN_IDS 每项的 key 与 value 一致（id === key）", () => {
      for (const [key, value] of Object.entries(TOKEN_IDS)) {
        expect(value).toBe(key);
      }
    });
  });

  // ── 5. getTokenRegistry ─────────────────────────────────────────────────

  describe("getTokenRegistry", () => {
    it("返回所有已注册 token", () => {
      const registry = getTokenRegistry();
      expect(registry).toHaveLength(Object.keys(TOKEN_IDS).length);
    });

    it("每个条目包含 key、id、category 字段", () => {
      const registry = getTokenRegistry();
      for (const entry of registry) {
        expect(entry).toHaveProperty("key");
        expect(entry).toHaveProperty("id");
        expect(entry).toHaveProperty("category");
        expect(typeof entry.key).toBe("string");
        expect(typeof entry.id).toBe("string");
        expect(typeof entry.category).toBe("string");
        expect(entry.key).toBe(entry.id);
      }
    });

    it("所有类别 A-F 均存在，无 unknown 类别", () => {
      const registry = getTokenRegistry();
      const categories = new Set(registry.map((e) => e.category));

      expect(categories.has("A")).toBe(true);
      expect(categories.has("B")).toBe(true);
      expect(categories.has("C")).toBe(true);
      expect(categories.has("D")).toBe(true);
      expect(categories.has("E")).toBe(true);
      expect(categories.has("F")).toBe(true);
      expect(categories.has("unknown")).toBe(false);
    });

    it("videoProvider 类别为 A（Domain Port）", () => {
      const entry = getTokenRegistry().find((e) => e.key === "videoProvider");
      expect(entry?.category).toBe("A");
    });

    it("eventBus 类别为 B（有状态服务）", () => {
      const entry = getTokenRegistry().find((e) => e.key === "eventBus");
      expect(entry?.category).toBe("B");
    });

    it("versionStorage 类别为 C（Storage 实例）", () => {
      const entry = getTokenRegistry().find((e) => e.key === "versionStorage");
      expect(entry?.category).toBe("C");
    });

    it("mediaAssetRepository 类别为 D（Repository）", () => {
      const entry = getTokenRegistry().find((e) => e.key === "mediaAssetRepository");
      expect(entry?.category).toBe("D");
    });

    it("syncEngine 类别为 E（懒加载）", () => {
      const entry = getTokenRegistry().find((e) => e.key === "syncEngine");
      expect(entry?.category).toBe("E");
    });

    it("agentConversationManager 类别为 F（Agent 服务）", () => {
      const entry = getTokenRegistry().find((e) => e.key === "agentConversationManager");
      expect(entry?.category).toBe("F");
    });
  });

  // ── 6. 异步 token 懒加载 ────────────────────────────────────────────────

  describe("异步 token 工厂懒加载", () => {
    it("异步 factory 返回 Promise，需 await", async () => {
      const asyncValue = { async: true };
      overrideToken(eventBusToken(), async () => asyncValue);

      const result = container.eventBus as unknown as Promise<{ async: boolean }>;
      expect(result).toBeInstanceOf(Promise);

      const resolved = await result;
      expect(resolved).toBe(asyncValue);
    });

    it("异步 factory 仅在访问时执行（懒加载）", async () => {
      const factory = vi.fn(async () => ({ lazy: true }));
      overrideToken(eventBusToken(), factory);

      expect(factory).not.toHaveBeenCalled();

      await (container.eventBus as unknown as Promise<unknown>);

      expect(factory).toHaveBeenCalledTimes(1);
    });

    it("异步 token singleton 缓存 Promise", async () => {
      const factory = vi.fn(async () => ({ cached: true }));
      overrideToken(eventBusToken(), factory);

      const first = container.eventBus as unknown as Promise<unknown>;
      const second = container.eventBus as unknown as Promise<unknown>;

      expect(first).toBe(second);
      expect(factory).toHaveBeenCalledTimes(1);
    });
  });

  // ── 7. 循环依赖检测 ─────────────────────────────────────────────────────

  describe("循环依赖检测", () => {
    it("两个相互依赖的 factory 抛出循环依赖错误（通过 c.resolve）", () => {
      overrideToken(eventBusToken(), (c) => c.resolve(apiClientToken()));
      overrideToken(apiClientToken(), (c) => c.resolve(eventBusToken()));

      expect(() => resolve(eventBusToken())).toThrow(/Circular dependency/);
    });

    it("循环依赖错误包含依赖链信息（通过 c.resolve）", () => {
      overrideToken(eventBusToken(), (c) => c.resolve(apiClientToken()));
      overrideToken(apiClientToken(), (c) => c.resolve(eventBusToken()));

      expect(() => resolve(eventBusToken())).toThrow(/eventBus/);
      expect(() => resolve(eventBusToken())).toThrow(/apiClient/);
    });

    it("container resolve() 函数检测循环依赖（通过导出的 resolve）", () => {
      // factory 调用导出的 resolve()（而非 c.resolve），由 container.ts 的 resolving Set 检测
      overrideToken(eventBusToken(), () => resolve(apiClientToken()));
      overrideToken(apiClientToken(), () => resolve(eventBusToken()));

      expect(() => resolve(eventBusToken())).toThrow(/\[DI\] Circular dependency/);
    });

    it("无循环依赖时正常解析", () => {
      overrideToken(eventBusToken(), () => ({ ok: true }));

      const result = resolve(eventBusToken());
      expect(result).toEqual({ ok: true });
    });
  });
});
