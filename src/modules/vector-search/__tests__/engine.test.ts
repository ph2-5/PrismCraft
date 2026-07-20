/**
 * VectorSearchEngine 策略链单元测试
 *
 * 注入 3 个 mock 策略，无需 mock 外部依赖。
 *
 * 覆盖：
 * - 策略链按顺序调用
 * - isAvailable=false 跳过策略
 * - search=null 进入下一个策略
 * - 首个非 null 结果直接返回
 * - 全部失败返回 []
 * - 单策略异常不阻断后续策略
 * - prewarmEmbeddings 跳过 keyword 策略
 */

import { describe, it, expect, vi } from "vitest";
import { VectorSearchEngine } from "../engine";
import type { RetrievalStrategy, ProgressCallback } from "../types";
import type { ArchivalMemoryEntry } from "@/domain/types/memory";

function makeEntry(overrides: Partial<ArchivalMemoryEntry> = {}): ArchivalMemoryEntry {
  return {
    id: `mem_${Math.random().toString(36).slice(2, 8)}`,
    type: "summary",
    content: "test content",
    createdAt: Date.now(),
    ...overrides,
  };
}

interface MockStrategy extends RetrievalStrategy {
  isAvailable: ReturnType<typeof vi.fn>;
  search: ReturnType<typeof vi.fn>;
}

function mockStrategy(
  name: string,
  opts: {
    available?: boolean;
    result?: ArchivalMemoryEntry[] | null;
    throwError?: Error;
  } = {},
): MockStrategy {
  const isAvailable = vi.fn(async (): Promise<boolean> => opts.available ?? true);
  const search = vi.fn(async (): Promise<ArchivalMemoryEntry[] | null> => {
    if (opts.throwError) throw opts.throwError;
    return opts.result ?? null;
  });
  return { name, isAvailable, search } as unknown as MockStrategy;
}

describe("VectorSearchEngine", () => {
  // ============= 构造函数 =============

  describe("构造函数", () => {
    it("空策略数组抛错", () => {
      expect(() => new VectorSearchEngine([])).toThrow();
    });

    it("getStrategies 返回策略列表", () => {
      const s = mockStrategy("s1");
      const engine = new VectorSearchEngine([s]);
      expect(engine.getStrategies()).toHaveLength(1);
      expect(engine.getStrategies()[0].name).toBe("s1");
    });
  });

  // ============= 策略链顺序调用 =============

  describe("策略链顺序调用", () => {
    it("按顺序调用策略，首个非 null 结果直接返回", async () => {
      const entries = [makeEntry({ id: "x" })];
      const s1 = mockStrategy("s1", { result: null });
      const s2 = mockStrategy("s2", { result: entries });
      const s3 = mockStrategy("s3", { result: [] });

      const engine = new VectorSearchEngine([s1, s2, s3]);
      const result = await engine.search("q", entries, 5);

      expect(result).toBe(entries);
      expect(s1.search).toHaveBeenCalledTimes(1);
      expect(s2.search).toHaveBeenCalledTimes(1);
      expect(s3.search).not.toHaveBeenCalled();
    });

    it("isAvailable=false 的策略被跳过", async () => {
      const s1 = mockStrategy("s1", { available: false, result: [] });
      const s2 = mockStrategy("s2", { result: [] });

      const engine = new VectorSearchEngine([s1, s2]);
      await engine.search("q", [], 5);

      expect(s1.isAvailable).toHaveBeenCalledTimes(1);
      expect(s1.search).not.toHaveBeenCalled();
      expect(s2.search).toHaveBeenCalledTimes(1);
    });

    it("search=null 进入下一个策略", async () => {
      const s1 = mockStrategy("s1", { result: null });
      const s2 = mockStrategy("s2", { result: null });
      const s3 = mockStrategy("s3", { result: [] });

      const engine = new VectorSearchEngine([s1, s2, s3]);
      await engine.search("q", [], 5);

      expect(s1.search).toHaveBeenCalledTimes(1);
      expect(s2.search).toHaveBeenCalledTimes(1);
      expect(s3.search).toHaveBeenCalledTimes(1);
    });

    it("首个非 null 结果（空数组）也直接返回", async () => {
      const s1 = mockStrategy("s1", { result: [] });
      const s2 = mockStrategy("s2", { result: [makeEntry()] });

      const engine = new VectorSearchEngine([s1, s2]);
      const result = await engine.search("q", [], 5);

      expect(result).toEqual([]);
      expect(s2.search).not.toHaveBeenCalled();
    });
  });

  // ============= 全部失败 =============

  describe("全部失败", () => {
    it("所有策略返回 null 时返回空数组", async () => {
      const s1 = mockStrategy("s1", { result: null });
      const s2 = mockStrategy("s2", { result: null });

      const engine = new VectorSearchEngine([s1, s2]);
      const result = await engine.search("q", [], 5);

      expect(result).toEqual([]);
    });

    it("所有策略不可用时返回空数组", async () => {
      const s1 = mockStrategy("s1", { available: false });
      const s2 = mockStrategy("s2", { available: false });

      const engine = new VectorSearchEngine([s1, s2]);
      const result = await engine.search("q", [], 5);

      expect(result).toEqual([]);
    });

    it("单策略配置：全部 null + 不可用混合，返回空数组", async () => {
      const s1 = mockStrategy("s1", { available: false });
      const s2 = mockStrategy("s2", { result: null });
      const s3 = mockStrategy("s3", { available: false });

      const engine = new VectorSearchEngine([s1, s2, s3]);
      const result = await engine.search("q", [], 5);

      expect(result).toEqual([]);
    });
  });

  // ============= 异常隔离 =============

  describe("异常隔离", () => {
    it("单策略 search 异常不阻断后续策略", async () => {
      const s1 = mockStrategy("s1", { throwError: new Error("boom") });
      const s2 = mockStrategy("s2", { result: [] });

      const engine = new VectorSearchEngine([s1, s2]);
      const result = await engine.search("q", [], 5);

      expect(result).toEqual([]);
      expect(s2.search).toHaveBeenCalledTimes(1);
    });

    it("isAvailable 异常不阻断后续策略", async () => {
      const s1: RetrievalStrategy = {
        name: "s1",
        isAvailable: async () => {
          throw new Error("availability check failed");
        },
        search: async () => [],
      };
      const s2 = mockStrategy("s2", { result: [] });

      const engine = new VectorSearchEngine([s1, s2]);
      const result = await engine.search("q", [], 5);

      expect(result).toEqual([]);
      expect(s2.search).toHaveBeenCalledTimes(1);
    });

    it("所有策略都异常时返回空数组", async () => {
      const s1 = mockStrategy("s1", { throwError: new Error("e1") });
      const s2 = mockStrategy("s2", { throwError: new Error("e2") });

      const engine = new VectorSearchEngine([s1, s2]);
      const result = await engine.search("q", [], 5);

      expect(result).toEqual([]);
    });
  });

  // ============= prewarmEmbeddings =============

  describe("prewarmEmbeddings", () => {
    it("跳过 keyword 策略", async () => {
      const api = mockStrategy("api", { result: [] });
      const local = mockStrategy("local", { result: [] });
      const keyword = mockStrategy("keyword", { result: [] });

      const engine = new VectorSearchEngine([api, local, keyword]);
      await engine.prewarmEmbeddings([makeEntry()]);

      expect(api.search).toHaveBeenCalledTimes(1);
      expect(keyword.search).not.toHaveBeenCalled();
    });

    it("首个可用非 keyword 策略被触发", async () => {
      const api = mockStrategy("api", { available: false });
      const local = mockStrategy("local", { result: [] });
      const keyword = mockStrategy("keyword", { result: [] });

      const engine = new VectorSearchEngine([api, local, keyword]);
      const result = await engine.prewarmEmbeddings([makeEntry()]);

      expect(result.success).toBe(true);
      expect(result.strategy).toBe("local");
      expect(api.search).not.toHaveBeenCalled();
      expect(local.search).toHaveBeenCalledTimes(1);
      expect(keyword.search).not.toHaveBeenCalled();
    });

    it("所有非 keyword 策略不可用时返回 success=false", async () => {
      const api = mockStrategy("api", { available: false });
      const local = mockStrategy("local", { available: false });
      const keyword = mockStrategy("keyword", { result: [] });

      const engine = new VectorSearchEngine([api, local, keyword]);
      const result = await engine.prewarmEmbeddings([makeEntry()]);

      expect(result.success).toBe(false);
      expect(keyword.search).not.toHaveBeenCalled();
    });

    it("空 entries 时直接返回 success=true", async () => {
      const api = mockStrategy("api", { result: [] });

      const engine = new VectorSearchEngine([api]);
      const result = await engine.prewarmEmbeddings([]);

      expect(result.success).toBe(true);
      expect(result.message).toBe("no entries");
      expect(api.search).not.toHaveBeenCalled();
    });

    it("策略异常时继续尝试下一个", async () => {
      const api = mockStrategy("api", { throwError: new Error("api error") });
      const local = mockStrategy("local", { result: [] });

      const engine = new VectorSearchEngine([api, local]);
      const result = await engine.prewarmEmbeddings([makeEntry()]);

      expect(result.success).toBe(true);
      expect(result.strategy).toBe("local");
    });

    it("使用通用 query 触发 search（limit=1）", async () => {
      const api = mockStrategy("api", { result: [] });
      const engine = new VectorSearchEngine([api]);
      const entries = [makeEntry({ id: "x" })];

      await engine.prewarmEmbeddings(entries);

      expect(api.search).toHaveBeenCalledTimes(1);
      const [query, , limit] = api.search.mock.calls[0]!;
      expect(query).toBe("prewarm all archival memory embeddings");
      expect(limit).toBe(1);
    });
  });

  // ============= onProgress 透传 =============

  describe("onProgress 透传", () => {
    it("透传 onProgress 到策略", async () => {
      const onProgress = vi.fn();
      const entries = [makeEntry({ id: "x" })];
      const s1: RetrievalStrategy = {
        name: "s1",
        isAvailable: async () => true,
        search: async (_q, _e, _l, cb) => {
          cb?.({ phase: "search", current: 1, total: 2, strategy: "s1", message: "test" });
          return entries;
        },
      };

      const engine = new VectorSearchEngine([s1]);
      await engine.search("q", entries, 5, onProgress as ProgressCallback);

      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({ phase: "search", strategy: "s1" }),
      );
    });
  });
});
