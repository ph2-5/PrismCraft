/**
 * Vector Search 子模块单元测试
 *
 * 覆盖：
 * - FileEmbeddingStore：独立存储 + 维度版本检测 + 缓存 + 容错
 * - 三策略（ApiVectorStrategy / LocalVectorStrategy / KeywordStrategy）
 * - VectorSearchEngine：策略链调度 + 异常隔离
 *
 * Mock @/shared/file-http 与 @/infrastructure/di，不真实读写文件。
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import {
  FileEmbeddingStore,
  ApiVectorStrategy,
  LocalVectorStrategy,
  KeywordStrategy,
  keywordSearch,
  VectorSearchEngine,
  createDefaultEngine,
  type RetrievalStrategy,
} from "../vector-search";
import type { ArchivalMemoryEntry } from "../memory-service";

// ── vi.hoisted 声明 mock 变量 ──
const mocks = vi.hoisted(() => ({
  writeFile: vi.fn(),
  readFile: vi.fn(),
  fileExists: vi.fn(),
  getCacheDirectory: vi.fn(),
  embeddingProvider: {
    generateEmbedding: vi.fn(),
    generateEmbeddings: vi.fn(),
  },
  detectLocalModel: vi.fn(),
  getLocalEmbeddingProvider: vi.fn(),
  findTopK: vi.fn(),
}));

vi.mock("@/shared/file-http", () => ({
  writeFile: mocks.writeFile,
  readFile: mocks.readFile,
  fileExists: mocks.fileExists,
  getCacheDirectory: mocks.getCacheDirectory,
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    embeddingProvider: mocks.embeddingProvider,
  },
}));

vi.mock("@/infrastructure/embedding", () => ({
  detectLocalModel: mocks.detectLocalModel,
  getLocalEmbeddingProvider: mocks.getLocalEmbeddingProvider,
  findTopK: mocks.findTopK,
}));

// ============= Helpers =============

function encodeJson(data: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(data));
}

function makeEntry(overrides: Partial<ArchivalMemoryEntry> = {}): ArchivalMemoryEntry {
  return {
    id: overrides.id ?? `mem_${Math.random().toString(36).slice(2, 8)}`,
    type: overrides.type ?? "summary",
    content: overrides.content ?? "test content",
    createdAt: overrides.createdAt ?? Date.now(),
    ...overrides,
  };
}

/** 构造已持久化的 embeddings.json 数据 */
function makeStoreData(
  entries: Record<string, { embedding: number[]; updatedAt: number }>,
  meta?: { modelId: string; dimensions: number; updatedAt: number },
) {
  return {
    meta: meta ?? null,
    entries,
  };
}

// ============= Tests =============

describe("vector-search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.writeFile.mockResolvedValue({ success: true });
    mocks.readFile.mockResolvedValue({ success: false, data: undefined });
    mocks.fileExists.mockResolvedValue(false);
    mocks.getCacheDirectory.mockResolvedValue({
      success: true,
      path: "/test/cache",
    });
    mocks.embeddingProvider.generateEmbedding.mockResolvedValue({ success: false });
    mocks.embeddingProvider.generateEmbeddings.mockResolvedValue({ success: false });
    mocks.detectLocalModel.mockResolvedValue({ available: false, info: null, missingFiles: [], directory: "" });
    mocks.getLocalEmbeddingProvider.mockResolvedValue(null);
    mocks.findTopK.mockImplementation(<T>(_query: number[], candidates: T[][], k: number) => {
      // 简单实现：按 index 顺序返回前 k 个
      return candidates.slice(0, k).map((_, index) => ({ index, similarity: 1 - index * 0.1 }));
    });
  });

  // ============= FileEmbeddingStore =============

  describe("FileEmbeddingStore", () => {
    it("1. 首次加载文件不存在时返回空 store", async () => {
      const store = new FileEmbeddingStore();
      const meta = await store.getMeta();
      expect(meta).toBeNull();
      const emb = await store.getEmbedding("any");
      expect(emb).toBeNull();
    });

    it("2. 加载已存在的 store 文件", async () => {
      const storeData = makeStoreData(
        { a: { embedding: [1, 2, 3], updatedAt: 1000 } },
        { modelId: "api", dimensions: 3, updatedAt: 1000 },
      );
      mocks.fileExists.mockResolvedValue(true);
      mocks.readFile.mockResolvedValue({ success: true, data: encodeJson(storeData) });

      const store = new FileEmbeddingStore();
      const meta = await store.getMeta();
      expect(meta).toEqual({ modelId: "api", dimensions: 3, updatedAt: 1000 });

      const emb = await store.getEmbedding("a");
      expect(emb).toEqual([1, 2, 3]);

      const map = await store.getEmbeddings(["a", "b"]);
      expect(map.size).toBe(1);
      expect(map.get("a")).toEqual([1, 2, 3]);
    });

    it("3. isCompatible：无 meta 时返回 true（首次写入）", async () => {
      const store = new FileEmbeddingStore();
      const ok = await store.isCompatible("any", 384);
      expect(ok).toBe(true);
    });

    it("4. isCompatible：modelId 与 dimensions 一致时返回 true", async () => {
      const storeData = makeStoreData(
        {},
        { modelId: "api", dimensions: 384, updatedAt: 1000 },
      );
      mocks.fileExists.mockResolvedValue(true);
      mocks.readFile.mockResolvedValue({ success: true, data: encodeJson(storeData) });

      const store = new FileEmbeddingStore();
      expect(await store.isCompatible("api", 384)).toBe(true);
      expect(await store.isCompatible("api", 768)).toBe(false);
      expect(await store.isCompatible("local", 384)).toBe(false);
    });

    it("5. setEmbeddings 写入并更新 meta", async () => {
      const store = new FileEmbeddingStore();
      const updates = new Map<string, number[]>();
      updates.set("id1", [1, 0, 0]);
      updates.set("id2", [0, 1, 0]);

      await store.setEmbeddings(updates, "api", 3);

      expect(mocks.writeFile).toHaveBeenCalledTimes(1);
      const [path, jsonStr] = mocks.writeFile.mock.calls[0]!;
      expect(String(path)).toContain("embeddings.json");
      const saved = JSON.parse(jsonStr as string);
      expect(saved.meta.modelId).toBe("api");
      expect(saved.meta.dimensions).toBe(3);
      expect(saved.entries.id1.embedding).toEqual([1, 0, 0]);
      expect(saved.entries.id2.embedding).toEqual([0, 1, 0]);
    });

    it("6. setEmbeddings 维度变更时清空旧 entries", async () => {
      // 初始 store 含旧模型 embedding
      const oldData = makeStoreData(
        { old: { embedding: [1, 2], updatedAt: 1000 } },
        { modelId: "old-model", dimensions: 2, updatedAt: 1000 },
      );
      mocks.fileExists.mockResolvedValue(true);
      mocks.readFile.mockResolvedValue({ success: true, data: encodeJson(oldData) });

      const store = new FileEmbeddingStore();
      // 先读取一次让 store 加载
      await store.getMeta();

      // 用新模型（不同 dimensions）写入
      const updates = new Map<string, number[]>();
      updates.set("new", [1, 2, 3, 4]);
      await store.setEmbeddings(updates, "new-model", 4);

      const [, jsonStr] = mocks.writeFile.mock.calls[0]!;
      const saved = JSON.parse(jsonStr as string);
      // 旧 entry 应被清空
      expect(saved.entries.old).toBeUndefined();
      // 新 entry 应存在
      expect(saved.entries.new.embedding).toEqual([1, 2, 3, 4]);
      // meta 应更新为新模型
      expect(saved.meta.modelId).toBe("new-model");
      expect(saved.meta.dimensions).toBe(4);
    });

    it("7. setEmbeddings 跳过维度不匹配的单条 embedding", async () => {
      const store = new FileEmbeddingStore();
      const updates = new Map<string, number[]>();
      updates.set("good", [1, 0, 0]);
      updates.set("bad", [1, 0]); // 维度不匹配

      await store.setEmbeddings(updates, "api", 3);

      const [, jsonStr] = mocks.writeFile.mock.calls[0]!;
      const saved = JSON.parse(jsonStr as string);
      expect(saved.entries.good).toBeDefined();
      expect(saved.entries.bad).toBeUndefined();
    });

    it("8. invalidateAll 清空所有数据", async () => {
      const store = new FileEmbeddingStore();
      // 先写入一些数据
      const updates = new Map<string, number[]>();
      updates.set("id1", [1, 0]);
      await store.setEmbeddings(updates, "api", 2);

      // 清空
      await store.invalidateAll();

      // 第二次写入（清空后的）
      const [, jsonStr] = mocks.writeFile.mock.calls[1]!;
      const saved = JSON.parse(jsonStr as string);
      expect(saved.meta).toBeNull();
      expect(saved.entries).toEqual({});
    });

    it("9. 文件损坏（无效 JSON）退化为空 store", async () => {
      mocks.fileExists.mockResolvedValue(true);
      mocks.readFile.mockResolvedValue({
        success: true,
        data: encodeJsonToText("not valid json"),
      });

      const store = new FileEmbeddingStore();
      const meta = await store.getMeta();
      expect(meta).toBeNull();
    });

    it("10. 单条 entry 损坏时跳过该条保留其他", async () => {
      const storeData = {
        meta: { modelId: "api", dimensions: 2, updatedAt: 1000 },
        entries: {
          good: { embedding: [1, 2], updatedAt: 1000 },
          bad: { embedding: "not_array", updatedAt: 1000 }, // 损坏
          bad2: { embedding: [1, 2] }, // 缺 updatedAt
        },
      };
      mocks.fileExists.mockResolvedValue(true);
      mocks.readFile.mockResolvedValue({ success: true, data: encodeJson(storeData) });

      const store = new FileEmbeddingStore();
      const good = await store.getEmbedding("good");
      expect(good).toEqual([1, 2]);
      const bad = await store.getEmbedding("bad");
      expect(bad).toBeNull();
      const bad2 = await store.getEmbedding("bad2");
      expect(bad2).toBeNull();
    });

    it("11. getCacheDirectory 失败时退化为空 store", async () => {
      mocks.getCacheDirectory.mockResolvedValue({ success: false, error: "no cache" });
      const store = new FileEmbeddingStore();
      const meta = await store.getMeta();
      expect(meta).toBeNull();
    });

    it("12. 缓存：第二次读取不重新读文件", async () => {
      const storeData = makeStoreData(
        { a: { embedding: [1], updatedAt: 1000 } },
        { modelId: "api", dimensions: 1, updatedAt: 1000 },
      );
      mocks.fileExists.mockResolvedValue(true);
      mocks.readFile.mockResolvedValue({ success: true, data: encodeJson(storeData) });

      const store = new FileEmbeddingStore();
      await store.getMeta();
      await store.getMeta();
      await store.getEmbedding("a");

      // fileExists 只被调用一次（首次 load）
      expect(mocks.fileExists).toHaveBeenCalledTimes(1);
      expect(mocks.readFile).toHaveBeenCalledTimes(1);
    });

    it("13. resetCache 后重新读取文件", async () => {
      const storeData = makeStoreData(
        { a: { embedding: [1], updatedAt: 1000 } },
        { modelId: "api", dimensions: 1, updatedAt: 1000 },
      );
      mocks.fileExists.mockResolvedValue(true);
      mocks.readFile.mockResolvedValue({ success: true, data: encodeJson(storeData) });

      const store = new FileEmbeddingStore();
      await store.getMeta();

      store.resetCache();
      await store.getMeta();

      expect(mocks.fileExists).toHaveBeenCalledTimes(2);
    });
  });

  // ============= KeywordStrategy =============

  describe("KeywordStrategy", () => {
    it("14. isAvailable 总是返回 true", async () => {
      const strategy = new KeywordStrategy();
      expect(await strategy.isAvailable()).toBe(true);
    });

    it("15. 关键词匹配返回相关条目", async () => {
      const entries = [
        makeEntry({ id: "1", content: "赛博朋克风格", createdAt: Date.now() }),
        makeEntry({ id: "2", content: "奇幻风格", createdAt: Date.now() }),
      ];
      const strategy = new KeywordStrategy();
      const result = await strategy.search("赛博朋克", entries, 5);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
    });

    it("16. 无匹配返回空数组（非 null）", async () => {
      const entries = [makeEntry({ id: "1", content: "hello" })];
      const strategy = new KeywordStrategy();
      const result = await strategy.search("nonexistent", entries, 5);
      expect(result).toEqual([]);
    });

    it("17. 时间衰减：7 天内得分更高", async () => {
      const now = Date.now();
      const DAY = 24 * 60 * 60 * 1000;
      const entries = [
        makeEntry({ id: "recent", content: "test", createdAt: now - 1 * DAY }),
        makeEntry({ id: "old", content: "test", createdAt: now - 60 * DAY }),
      ];
      const strategy = new KeywordStrategy();
      const result = await strategy.search("test", entries, 5);
      expect(result[0].id).toBe("recent");
      expect(result[1].id).toBe("old");
    });

    it("18. keywordSearch 函数：query 无关键词时按时间倒序", () => {
      const entries = [
        makeEntry({ id: "old", content: "a", createdAt: 1000 }),
        makeEntry({ id: "new", content: "b", createdAt: 2000 }),
      ];
      const result = keywordSearch("!!!", entries, 5);
      // "!!!" 分词后无关键词 → 按时间倒序
      expect(result[0].id).toBe("new");
      expect(result[1].id).toBe("old");
    });
  });

  // ============= ApiVectorStrategy =============

  describe("ApiVectorStrategy", () => {
    it("19. isAvailable：provider 存在时返回 true", async () => {
      const store = new FileEmbeddingStore();
      const strategy = new ApiVectorStrategy(store);
      expect(await strategy.isAvailable()).toBe(true);
    });

    it("20. search：generateEmbedding 失败时返回 null", async () => {
      mocks.embeddingProvider.generateEmbedding.mockResolvedValue({ success: false });
      const store = new FileEmbeddingStore();
      const strategy = new ApiVectorStrategy(store);
      const result = await strategy.search("query", [makeEntry()], 5);
      expect(result).toBeNull();
    });

    it("21. search：store 已有 embedding 时直接计算 Top-K", async () => {
      const entries = [
        makeEntry({ id: "cat", content: "cats" }),
        makeEntry({ id: "dog", content: "dogs" }),
      ];
      const storeData = makeStoreData(
        {
          cat: { embedding: [1, 0], updatedAt: 1 },
          dog: { embedding: [0, 1], updatedAt: 1 },
        },
        { modelId: "api", dimensions: 2, updatedAt: 1 },
      );
      mocks.fileExists.mockResolvedValue(true);
      mocks.readFile.mockResolvedValue({ success: true, data: encodeJson(storeData) });
      mocks.embeddingProvider.generateEmbedding.mockResolvedValue({
        success: true,
        data: { embedding: [0.9, 0.1] },
      });
      // findTopK mock 返回 cat 在前
      mocks.findTopK.mockReturnValue([
        { index: 0, similarity: 0.95 },
        { index: 1, similarity: 0.1 },
      ]);

      const store = new FileEmbeddingStore();
      const strategy = new ApiVectorStrategy(store);
      const result = await strategy.search("feline", entries, 2);
      expect(result).toHaveLength(2);
      expect(result![0].id).toBe("cat");
      expect(result![1].id).toBe("dog");
    });

    it("22. search：store 缺 embedding 时懒生成并持久化", async () => {
      const entries = [makeEntry({ id: "1", content: "cats" })];
      // store 初始为空
      mocks.embeddingProvider.generateEmbedding.mockResolvedValue({
        success: true,
        data: { embedding: [1, 0] },
      });
      mocks.embeddingProvider.generateEmbeddings.mockResolvedValue({
        success: true,
        data: { embeddings: [[1, 0]] },
      });
      mocks.findTopK.mockReturnValue([{ index: 0, similarity: 1.0 }]);

      const store = new FileEmbeddingStore();
      const strategy = new ApiVectorStrategy(store);
      const result = await strategy.search("cats", entries, 5);
      expect(result).toHaveLength(1);
      expect(result![0].id).toBe("1");
      // 持久化被调用
      expect(mocks.writeFile).toHaveBeenCalled();
    });

    it("23. search：维度变更时清空 store 旧 embedding", async () => {
      // 旧 store：api/2 维
      const oldData = makeStoreData(
        { old: { embedding: [1, 0], updatedAt: 1 } },
        { modelId: "api", dimensions: 2, updatedAt: 1 },
      );
      mocks.fileExists.mockResolvedValue(true);
      mocks.readFile.mockResolvedValue({ success: true, data: encodeJson(oldData) });
      // 新 query embedding 是 3 维（模拟模型变更）
      mocks.embeddingProvider.generateEmbedding.mockResolvedValue({
        success: true,
        data: { embedding: [1, 0, 0] },
      });
      mocks.findTopK.mockReturnValue([]);

      const store = new FileEmbeddingStore();
      const strategy = new ApiVectorStrategy(store);
      await strategy.search("query", [], 5);

      // 应该调用 invalidateAll（写空 store）
      const writeCalls = mocks.writeFile.mock.calls;
      const invalidateCall = writeCalls.find(
        (call: unknown[]) => {
          const json = call[1] as string;
          try {
            const parsed = JSON.parse(json);
            return parsed.meta === null && Object.keys(parsed.entries).length === 0;
          } catch {
            return false;
          }
        },
      );
      expect(invalidateCall).toBeDefined();
    });

    it("24. search：批量 embedding 失败时返回 null", async () => {
      const entries = [makeEntry({ id: "1", content: "cats" })];
      mocks.embeddingProvider.generateEmbedding.mockResolvedValue({
        success: true,
        data: { embedding: [1, 0] },
      });
      mocks.embeddingProvider.generateEmbeddings.mockResolvedValue({ success: false });

      const store = new FileEmbeddingStore();
      const strategy = new ApiVectorStrategy(store);
      const result = await strategy.search("query", entries, 5);
      // 批量失败 → 无 candidates → null
      expect(result).toBeNull();
    });

    it("25. search：container.embeddingProvider 异常时返回 null", async () => {
      mocks.embeddingProvider.generateEmbedding.mockRejectedValue(new Error("network error"));
      const store = new FileEmbeddingStore();
      const strategy = new ApiVectorStrategy(store);
      const result = await strategy.search("query", [makeEntry()], 5);
      expect(result).toBeNull();
    });
  });

  // ============= LocalVectorStrategy =============

  describe("LocalVectorStrategy", () => {
    it("26. isAvailable：本地模型不可用时返回 false", async () => {
      mocks.detectLocalModel.mockResolvedValue({ available: false, info: null });
      const store = new FileEmbeddingStore();
      const strategy = new LocalVectorStrategy(store);
      expect(await strategy.isAvailable()).toBe(false);
    });

    it("27. isAvailable：本地模型可用时返回 true", async () => {
      mocks.detectLocalModel.mockResolvedValue({
        available: true,
        info: { modelName: "test-model", dimensions: 384, directory: "/test" },
      });
      const store = new FileEmbeddingStore();
      const strategy = new LocalVectorStrategy(store);
      expect(await strategy.isAvailable()).toBe(true);
    });

    it("28. search：getLocalEmbeddingProvider 返回 null 时返回 null", async () => {
      mocks.detectLocalModel.mockResolvedValue({
        available: true,
        info: { modelName: "test", dimensions: 2, directory: "/test" },
      });
      mocks.getLocalEmbeddingProvider.mockResolvedValue(null);

      const store = new FileEmbeddingStore();
      const strategy = new LocalVectorStrategy(store);
      const result = await strategy.search("query", [makeEntry()], 5);
      expect(result).toBeNull();
    });

    it("29. search：本地模型正常检索", async () => {
      const entries = [makeEntry({ id: "1", content: "cats" })];
      mocks.detectLocalModel.mockResolvedValue({
        available: true,
        info: { modelName: "test-model", dimensions: 2, directory: "/test" },
      });
      const localProvider = {
        generateEmbedding: vi.fn().mockResolvedValue({
          success: true,
          data: { embedding: [1, 0] },
        }),
        generateEmbeddings: vi.fn().mockResolvedValue({
          success: true,
          data: { embeddings: [[1, 0]] },
        }),
      };
      mocks.getLocalEmbeddingProvider.mockResolvedValue(localProvider);
      mocks.findTopK.mockReturnValue([{ index: 0, similarity: 1.0 }]);

      const store = new FileEmbeddingStore();
      const strategy = new LocalVectorStrategy(store);
      const result = await strategy.search("cats", entries, 5);
      expect(result).toHaveLength(1);
      expect(result![0].id).toBe("1");
      // 持久化使用 modelId = "test-model"
      const [, jsonStr] = mocks.writeFile.mock.calls[0]!;
      const saved = JSON.parse(jsonStr as string);
      expect(saved.meta.modelId).toBe("test-model");
      expect(saved.meta.dimensions).toBe(2);
    });
  });

  // ============= VectorSearchEngine =============

  describe("VectorSearchEngine", () => {
    it("30. 空策略数组抛错", () => {
      expect(() => new VectorSearchEngine([])).toThrow();
    });

    it("31. 按顺序尝试策略，首个非 null 结果直接返回", async () => {
      const strategy1: RetrievalStrategy = {
        name: "s1",
        isAvailable: async () => true,
        search: async () => null, // 返回 null
      };
      const strategy2: RetrievalStrategy = {
        name: "s2",
        isAvailable: async () => true,
        search: async (_q, entries, _l) => entries, // 返回数组
      };
      const strategy3: RetrievalStrategy = {
        name: "s3",
        isAvailable: async () => true,
        search: async () => [],
      };

      const engine = new VectorSearchEngine([strategy1, strategy2, strategy3]);
      const entries = [makeEntry({ id: "x" })];
      const result = await engine.search("q", entries, 5);
      expect(result).toBe(entries);
    });

    it("32. isAvailable=false 的策略被跳过", async () => {
      const strategy1: RetrievalStrategy = {
        name: "s1",
        isAvailable: async () => false, // 不可用
        search: async () => {
          throw new Error("should not be called");
        },
      };
      const strategy2: RetrievalStrategy = {
        name: "s2",
        isAvailable: async () => true,
        search: async () => [],
      };

      const engine = new VectorSearchEngine([strategy1, strategy2]);
      const result = await engine.search("q", [], 5);
      expect(result).toEqual([]);
    });

    it("33. 单策略异常不阻断链式调用", async () => {
      const strategy1: RetrievalStrategy = {
        name: "s1",
        isAvailable: async () => true,
        search: async () => {
          throw new Error("boom");
        },
      };
      const strategy2: RetrievalStrategy = {
        name: "s2",
        isAvailable: async () => true,
        search: async () => [],
      };

      const engine = new VectorSearchEngine([strategy1, strategy2]);
      const result = await engine.search("q", [], 5);
      expect(result).toEqual([]);
    });

    it("34. 全部策略失败时返回空数组", async () => {
      const strategy1: RetrievalStrategy = {
        name: "s1",
        isAvailable: async () => true,
        search: async () => null,
      };
      const strategy2: RetrievalStrategy = {
        name: "s2",
        isAvailable: async () => true,
        search: async () => null,
      };

      const engine = new VectorSearchEngine([strategy1, strategy2]);
      const result = await engine.search("q", [], 5);
      expect(result).toEqual([]);
    });

    it("35. getStrategies 返回策略列表", () => {
      const s1: RetrievalStrategy = {
        name: "s1",
        isAvailable: async () => true,
        search: async () => [],
      };
      const engine = new VectorSearchEngine([s1]);
      expect(engine.getStrategies()).toHaveLength(1);
      expect(engine.getStrategies()[0].name).toBe("s1");
    });

    it("36. createDefaultEngine 返回包含 3 个策略的引擎", () => {
      const engine = createDefaultEngine();
      const strategies = engine.getStrategies();
      expect(strategies).toHaveLength(3);
      expect(strategies[0].name).toBe("api");
      expect(strategies[1].name).toBe("local");
      expect(strategies[2].name).toBe("keyword");
    });

    it("37. S2 端到端：API→本地模型切换时旧 embedding 自动失效", async () => {
      // 场景：用户先用 API 模型生成 2 维 embedding，后切换到本地 3 维模型
      // 应自动清空旧 2 维 embedding，用本地模型重新生成 3 维 embedding

      // Step 1: API 策略检索，生成 2 维 embedding
      const entries = [
        makeEntry({ id: "1", content: "cats" }),
        makeEntry({ id: "2", content: "dogs" }),
      ];
      mocks.embeddingProvider.generateEmbedding.mockResolvedValue({
        success: true,
        data: { embedding: [0.9, 0.1] }, // API 2 维
      });
      mocks.embeddingProvider.generateEmbeddings.mockResolvedValue({
        success: true,
        data: { embeddings: [[1, 0], [0, 1]] }, // 批量 2 维
      });
      mocks.findTopK.mockReturnValue([
        { index: 0, similarity: 0.95 },
        { index: 1, similarity: 0.1 },
      ]);

      const store = new FileEmbeddingStore();
      const apiStrategy = new ApiVectorStrategy(store);
      await apiStrategy.search("cats", entries, 2);

      // 验证 API embedding 已持久化（2 维）
      const apiWriteCall = mocks.writeFile.mock.calls[0]!;
      const apiSaved = JSON.parse(apiWriteCall[1] as string);
      expect(apiSaved.meta.modelId).toBe("api");
      expect(apiSaved.meta.dimensions).toBe(2);
      expect(Object.keys(apiSaved.entries)).toHaveLength(2);

      // Step 2: 切换到本地模型（3 维）
      // 模拟 store 已有 API 的 2 维数据（readFile 返回上次写入的内容）
      mocks.readFile.mockResolvedValue({
        success: true,
        data: encodeJson(apiSaved),
      });
      mocks.fileExists.mockResolvedValue(true);

      mocks.detectLocalModel.mockResolvedValue({
        available: true,
        info: { modelName: "local-miniLM", dimensions: 3, directory: "/test" },
      });
      const localProvider = {
        generateEmbedding: vi.fn().mockResolvedValue({
          success: true,
          data: { embedding: [1, 0, 0] }, // 本地 3 维
        }),
        generateEmbeddings: vi.fn().mockResolvedValue({
          success: true,
          data: { embeddings: [[1, 0, 0], [0, 1, 0]] }, // 批量 3 维
        }),
      };
      mocks.getLocalEmbeddingProvider.mockResolvedValue(localProvider);
      mocks.findTopK.mockReturnValue([{ index: 0, similarity: 1.0 }]);

      // 重置 store 缓存，模拟新会话
      store.resetCache();

      const localStrategy = new LocalVectorStrategy(store);
      await localStrategy.search("cats", entries, 2);

      // 验证：本地策略发现维度不一致（2→3），触发 invalidateAll + 新写入
      const writeCalls = mocks.writeFile.mock.calls;
      // 找到 invalidateAll 的写入（meta=null, entries={}）
      const invalidateCall = writeCalls.find((call: unknown[]) => {
        try {
          const parsed = JSON.parse(call[1] as string);
          return parsed.meta === null && Object.keys(parsed.entries).length === 0;
        } catch {
          return false;
        }
      });
      expect(invalidateCall).toBeDefined();

      // 找到本地模型的新写入（modelId=local-miniLM, dimensions=3）
      const localWriteCall = writeCalls.find((call: unknown[]) => {
        try {
          const parsed = JSON.parse(call[1] as string);
          return parsed.meta?.modelId === "local-miniLM" && parsed.meta?.dimensions === 3;
        } catch {
          return false;
        }
      });
      expect(localWriteCall).toBeDefined();

      const localSaved = JSON.parse(localWriteCall![1] as string);
      // 旧的 API embedding 应不存在（被 invalidateAll 清空）
      // 新的本地 embedding 应存在（3 维）
      for (const entry of Object.values(localSaved.entries) as Array<{ embedding: number[] }>) {
        expect(entry.embedding).toHaveLength(3);
      }
    });
  });

  // ============= 进度通知（S3） =============

  describe("Progress Notification (S3)", () => {
    it("38. KeywordStrategy.search 触发 search 阶段 onProgress", async () => {
      const entries = [
        makeEntry({ id: "1", content: "test" }),
        makeEntry({ id: "2", content: "test" }),
      ];
      const onProgress = vi.fn();
      const strategy = new KeywordStrategy();
      await strategy.search("test", entries, 5, onProgress);

      expect(onProgress).toHaveBeenCalled();
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: "search",
          strategy: "keyword",
          total: entries.length,
        }),
      );
    });

    it("39. ApiVectorStrategy.backfill 时触发 onProgress（批量 embedding 阶段）", async () => {
      // 构造 70 条 entries，触发两批（API_BATCH_SIZE=64）
      const entries: ArchivalMemoryEntry[] = Array.from({ length: 70 }, (_, i) =>
        makeEntry({ id: `e${i}`, content: `content ${i}` }),
      );

      mocks.embeddingProvider.generateEmbedding.mockResolvedValue({
        success: true,
        data: { embedding: [1, 0] },
      });
      // 批量返回与 batch 等长的 2 维 embedding
      mocks.embeddingProvider.generateEmbeddings.mockImplementation(
        async (batch: string[]) => ({
          success: true,
          data: { embeddings: batch.map(() => [1, 0]) },
        }),
      );
      mocks.findTopK.mockReturnValue([]);

      const store = new FileEmbeddingStore();
      const strategy = new ApiVectorStrategy(store);
      const onProgress = vi.fn();
      await strategy.search("query", entries, 5, onProgress);

      // 应有多次 backfill 进度回调：
      // batch 1 (i=0, current=0)
      // batch 2 (i=64, current=64)
      // 完成 (current=70)
      const backfillCalls = onProgress.mock.calls
        .map((call) => call[0])
        .filter((p) => p.phase === "backfill");
      expect(backfillCalls.length).toBeGreaterThanOrEqual(2);

      // 第一次：current=0, total=70
      expect(backfillCalls[0]).toMatchObject({
        phase: "backfill",
        current: 0,
        total: 70,
        strategy: "api",
      });

      // 最后一次（完成）：current=70, total=70
      const lastBackfill = backfillCalls[backfillCalls.length - 1];
      expect(lastBackfill).toMatchObject({
        phase: "backfill",
        current: 70,
        total: 70,
        strategy: "api",
      });

      // 中间应包含 current=64 的批次回调
      const hasBatch2 = backfillCalls.some((p) => p.current === 64);
      expect(hasBatch2).toBe(true);
    });

    it("40. ApiVectorStrategy 完成时触发 search 阶段 onProgress", async () => {
      const entries = [makeEntry({ id: "cat", content: "cats" })];
      const storeData = makeStoreData(
        { cat: { embedding: [1, 0], updatedAt: 1 } },
        { modelId: "api", dimensions: 2, updatedAt: 1 },
      );
      mocks.fileExists.mockResolvedValue(true);
      mocks.readFile.mockResolvedValue({ success: true, data: encodeJson(storeData) });
      mocks.embeddingProvider.generateEmbedding.mockResolvedValue({
        success: true,
        data: { embedding: [0.9, 0.1] },
      });
      mocks.findTopK.mockReturnValue([{ index: 0, similarity: 1.0 }]);

      const store = new FileEmbeddingStore();
      const strategy = new ApiVectorStrategy(store);
      const onProgress = vi.fn();
      await strategy.search("feline", entries, 2, onProgress);

      // store 已有 embedding，无 backfill，只有 search 阶段
      const searchCalls = onProgress.mock.calls
        .map((call) => call[0])
        .filter((p) => p.phase === "search");
      expect(searchCalls).toHaveLength(1);
      expect(searchCalls[0]).toMatchObject({
        phase: "search",
        strategy: "api",
        current: 1,
        total: 1,
      });
    });

    it("41. VectorSearchEngine 透传 onProgress 到策略", async () => {
      const onProgress = vi.fn();
      const strategy: RetrievalStrategy = {
        name: "transparent",
        isAvailable: async () => true,
        search: async (_q, entries, _l, cb) => {
          cb?.({
            phase: "search",
            current: 1,
            total: 2,
            strategy: "transparent",
            message: "test",
          });
          return entries;
        },
      };
      const engine = new VectorSearchEngine([strategy]);
      const entries = [makeEntry({ id: "x" })];
      await engine.search("q", entries, 5, onProgress);

      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: "search",
          strategy: "transparent",
        }),
      );
    });

    it("42. ApiVectorStrategy 无 onProgress 时正常工作（向后兼容）", async () => {
      const entries = [makeEntry({ id: "1", content: "cats" })];
      mocks.embeddingProvider.generateEmbedding.mockResolvedValue({
        success: true,
        data: { embedding: [1, 0] },
      });
      mocks.embeddingProvider.generateEmbeddings.mockResolvedValue({
        success: true,
        data: { embeddings: [[1, 0]] },
      });
      mocks.findTopK.mockReturnValue([{ index: 0, similarity: 1.0 }]);

      const store = new FileEmbeddingStore();
      const strategy = new ApiVectorStrategy(store);
      // 不传 onProgress
      const result = await strategy.search("cats", entries, 5);
      expect(result).toHaveLength(1);
    });
  });

  // ============= 降级链（端到端真实策略） =============

  describe("降级链（端到端真实策略）", () => {
    it("43. API 返回 null 时 Local 策略接管", async () => {
      // API generateEmbedding 失败 → ApiVectorStrategy 返回 null
      // Local 模型可用 → LocalVectorStrategy 接管返回结果
      const entries = [
        makeEntry({ id: "1", content: "cats" }),
        makeEntry({ id: "2", content: "dogs" }),
      ];

      mocks.embeddingProvider.generateEmbedding.mockResolvedValue({ success: false });
      mocks.embeddingProvider.generateEmbeddings.mockResolvedValue({ success: false });

      mocks.detectLocalModel.mockResolvedValue({
        available: true,
        info: { modelName: "local-model", dimensions: 2, directory: "/test" },
      });
      const localProvider = {
        generateEmbedding: vi.fn().mockResolvedValue({
          success: true,
          data: { embedding: [1, 0] },
        }),
        generateEmbeddings: vi.fn().mockResolvedValue({
          success: true,
          data: { embeddings: [[1, 0], [0, 1]] },
        }),
      };
      mocks.getLocalEmbeddingProvider.mockResolvedValue(localProvider);
      mocks.findTopK.mockReturnValue([{ index: 0, similarity: 1.0 }]);

      const store = new FileEmbeddingStore();
      const engine = createDefaultEngine(store);
      const result = await engine.search("cats", entries, 5);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
      // API 策略被调用过（失败）
      expect(mocks.embeddingProvider.generateEmbedding).toHaveBeenCalled();
      // Local 策略被调用过（接管）
      expect(localProvider.generateEmbedding).toHaveBeenCalled();
    });

    it("44. API 不可用 + Local 返回 null 时 Keyword 兜底", async () => {
      // API generateEmbedding 失败
      // Local getLocalEmbeddingProvider 返回 null
      // → KeywordStrategy 兜底
      const entries = [
        makeEntry({ id: "1", content: "赛博朋克" }),
        makeEntry({ id: "2", content: "奇幻" }),
      ];

      mocks.embeddingProvider.generateEmbedding.mockResolvedValue({ success: false });
      mocks.detectLocalModel.mockResolvedValue({
        available: true,
        info: { modelName: "local", dimensions: 2, directory: "/test" },
      });
      mocks.getLocalEmbeddingProvider.mockResolvedValue(null);

      const store = new FileEmbeddingStore();
      const engine = createDefaultEngine(store);
      const result = await engine.search("赛博朋克", entries, 5);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
    });

    it("45. 全链失败（API 不可用 + Local 不可用 + Keyword 无匹配）返回空数组", async () => {
      // API generateEmbedding 失败
      // Local detectLocalModel 返回不可用
      // Keyword 无匹配
      const entries = [makeEntry({ id: "1", content: "hello" })];

      mocks.embeddingProvider.generateEmbedding.mockResolvedValue({ success: false });
      mocks.detectLocalModel.mockResolvedValue({ available: false, info: null });

      const store = new FileEmbeddingStore();
      const engine = createDefaultEngine(store);
      const result = await engine.search("nonexistent", entries, 5);

      expect(result).toEqual([]);
    });

    it("46. API 抛异常时 Local 策略接管", async () => {
      const entries = [makeEntry({ id: "1", content: "cats" })];

      mocks.embeddingProvider.generateEmbedding.mockRejectedValue(new Error("network"));
      mocks.detectLocalModel.mockResolvedValue({
        available: true,
        info: { modelName: "local", dimensions: 2, directory: "/test" },
      });
      const localProvider = {
        generateEmbedding: vi.fn().mockResolvedValue({
          success: true,
          data: { embedding: [1, 0] },
        }),
        generateEmbeddings: vi.fn().mockResolvedValue({
          success: true,
          data: { embeddings: [[1, 0]] },
        }),
      };
      mocks.getLocalEmbeddingProvider.mockResolvedValue(localProvider);
      mocks.findTopK.mockReturnValue([{ index: 0, similarity: 1.0 }]);

      const store = new FileEmbeddingStore();
      const engine = createDefaultEngine(store);
      const result = await engine.search("cats", entries, 5);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
      expect(localProvider.generateEmbedding).toHaveBeenCalled();
    });

    it("47. Local 抛异常时 Keyword 兜底", async () => {
      const entries = [makeEntry({ id: "1", content: "赛博朋克" })];

      mocks.embeddingProvider.generateEmbedding.mockResolvedValue({ success: false });
      mocks.detectLocalModel.mockResolvedValue({
        available: true,
        info: { modelName: "local", dimensions: 2, directory: "/test" },
      });
      mocks.getLocalEmbeddingProvider.mockRejectedValue(new Error("model load failed"));

      const store = new FileEmbeddingStore();
      const engine = createDefaultEngine(store);
      const result = await engine.search("赛博朋克", entries, 5);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
    });
  });

  // ============= backfill 部分失败 =============

  describe("backfill 部分失败", () => {
    it("48. API 逐条调用部分失败仍返回有 embedding 的结果", async () => {
      // provider 无 generateEmbeddings（走逐条路径）
      // 3 条 entries：第 1、3 条成功，第 2 条失败
      // 应返回第 1、3 条的 embedding 对应结果
      const entries = [
        makeEntry({ id: "good1", content: "cats" }),
        makeEntry({ id: "bad", content: "dogs" }),
        makeEntry({ id: "good2", content: "birds" }),
      ];

      // generateEmbedding 调用顺序：query, good1, bad, good2
      mocks.embeddingProvider.generateEmbedding
        .mockResolvedValueOnce({ success: true, data: { embedding: [1, 0] } }) // query
        .mockResolvedValueOnce({ success: true, data: { embedding: [1, 0] } }) // good1
        .mockResolvedValueOnce({ success: false }) // bad 失败
        .mockResolvedValueOnce({ success: true, data: { embedding: [0, 1] } }); // good2

      // 临时移除 generateEmbeddings 走逐条路径
      const originalBatch = mocks.embeddingProvider.generateEmbeddings;
      (mocks.embeddingProvider as { generateEmbeddings: unknown }).generateEmbeddings = undefined;
      try {
        mocks.findTopK.mockReturnValue([
          { index: 0, similarity: 0.9 },
          { index: 1, similarity: 0.5 },
        ]);

        const store = new FileEmbeddingStore();
        const strategy = new ApiVectorStrategy(store);
        const result = await strategy.search("query", entries, 5);

        // 应返回有 embedding 的 2 条（good1, good2），bad 被跳过
        expect(result).not.toBeNull();
        expect(result!).toHaveLength(2);
        const ids = result!.map((e) => e.id);
        expect(ids).toContain("good1");
        expect(ids).toContain("good2");
        expect(ids).not.toContain("bad");
      } finally {
        mocks.embeddingProvider.generateEmbeddings = originalBatch;
      }
    });

    it("49. Local 逐条调用部分失败仍返回有 embedding 的结果", async () => {
      const entries = [
        makeEntry({ id: "good1", content: "cats" }),
        makeEntry({ id: "bad", content: "dogs" }),
      ];

      mocks.detectLocalModel.mockResolvedValue({
        available: true,
        info: { modelName: "local-model", dimensions: 2, directory: "/test" },
      });
      // localProvider 无 generateEmbeddings → 走逐条
      // 调用顺序：query, good1, bad
      const localProvider = {
        generateEmbedding: vi.fn()
          .mockResolvedValueOnce({ success: true, data: { embedding: [1, 0] } }) // query
          .mockResolvedValueOnce({ success: true, data: { embedding: [1, 0] } }) // good1
          .mockResolvedValueOnce({ success: false }), // bad 失败
      };
      mocks.getLocalEmbeddingProvider.mockResolvedValue(localProvider);
      mocks.findTopK.mockReturnValue([{ index: 0, similarity: 1.0 }]);

      const store = new FileEmbeddingStore();
      const strategy = new LocalVectorStrategy(store);
      const result = await strategy.search("cats", entries, 5);

      expect(result).not.toBeNull();
      expect(result!).toHaveLength(1);
      expect(result![0].id).toBe("good1");
    });

    it("50. API 批量失败时不退回逐条，返回 null", async () => {
      // 有 generateEmbeddings 但批量失败 → 返回 null（不退回逐条）
      const entries = [makeEntry({ id: "1", content: "cats" })];

      mocks.embeddingProvider.generateEmbedding.mockResolvedValue({
        success: true,
        data: { embedding: [1, 0] },
      });
      mocks.embeddingProvider.generateEmbeddings.mockResolvedValue({ success: false });

      const store = new FileEmbeddingStore();
      const strategy = new ApiVectorStrategy(store);
      const result = await strategy.search("query", entries, 5);

      expect(result).toBeNull();
    });
  });

  // ============= LocalVectorStrategy 维度变更 =============

  describe("LocalVectorStrategy 维度变更", () => {
    it("51. 检测到维度变更时调用 store.invalidateAll", async () => {
      // store 已有旧模型 embedding（modelId=old-local, dim=2）
      // Local 模型用新 modelName + dim=3
      const oldData = makeStoreData(
        { old: { embedding: [1, 0], updatedAt: 1 } },
        { modelId: "old-local", dimensions: 2, updatedAt: 1 },
      );
      mocks.fileExists.mockResolvedValue(true);
      mocks.readFile.mockResolvedValue({ success: true, data: encodeJson(oldData) });

      mocks.detectLocalModel.mockResolvedValue({
        available: true,
        info: { modelName: "new-local", dimensions: 3, directory: "/test" },
      });
      const localProvider = {
        generateEmbedding: vi.fn().mockResolvedValue({
          success: true,
          data: { embedding: [1, 0, 0] },
        }),
        generateEmbeddings: vi.fn().mockResolvedValue({
          success: true,
          data: { embeddings: [[1, 0, 0]] },
        }),
      };
      mocks.getLocalEmbeddingProvider.mockResolvedValue(localProvider);
      mocks.findTopK.mockReturnValue([{ index: 0, similarity: 1.0 }]);

      const store = new FileEmbeddingStore();
      await store.getMeta(); // 触发加载旧数据

      const strategy = new LocalVectorStrategy(store);
      await strategy.search("query", [makeEntry({ id: "1", content: "cats" })], 5);

      // 应有 invalidateAll 写入（meta=null, entries={}）
      const writeCalls = mocks.writeFile.mock.calls;
      const invalidateCall = writeCalls.find((call: unknown[]) => {
        try {
          const parsed = JSON.parse(call[1] as string);
          return parsed.meta === null && Object.keys(parsed.entries).length === 0;
        } catch {
          return false;
        }
      });
      expect(invalidateCall).toBeDefined();

      // 应有新模型写入（modelId=new-local, dim=3）
      const newWriteCall = writeCalls.find((call: unknown[]) => {
        try {
          const parsed = JSON.parse(call[1] as string);
          return parsed.meta?.modelId === "new-local" && parsed.meta?.dimensions === 3;
        } catch {
          return false;
        }
      });
      expect(newWriteCall).toBeDefined();
    });

    it("52. 维度一致时不调用 invalidateAll", async () => {
      const oldData = makeStoreData(
        { a: { embedding: [1, 0], updatedAt: 1 } },
        { modelId: "local-model", dimensions: 2, updatedAt: 1 },
      );
      mocks.fileExists.mockResolvedValue(true);
      mocks.readFile.mockResolvedValue({ success: true, data: encodeJson(oldData) });

      mocks.detectLocalModel.mockResolvedValue({
        available: true,
        info: { modelName: "local-model", dimensions: 2, directory: "/test" },
      });
      const localProvider = {
        generateEmbedding: vi.fn().mockResolvedValue({
          success: true,
          data: { embedding: [1, 0] },
        }),
        generateEmbeddings: vi.fn().mockResolvedValue({
          success: true,
          data: { embeddings: [[1, 0]] },
        }),
      };
      mocks.getLocalEmbeddingProvider.mockResolvedValue(localProvider);
      mocks.findTopK.mockReturnValue([{ index: 0, similarity: 1.0 }]);

      const store = new FileEmbeddingStore();
      await store.getMeta();

      const strategy = new LocalVectorStrategy(store);
      await strategy.search("query", [makeEntry({ id: "a", content: "cats" })], 5);

      // 无 invalidateAll 写入（无 meta=null）
      const writeCalls = mocks.writeFile.mock.calls;
      const invalidateCall = writeCalls.find((call: unknown[]) => {
        try {
          const parsed = JSON.parse(call[1] as string);
          return parsed.meta === null;
        } catch {
          return false;
        }
      });
      expect(invalidateCall).toBeUndefined();
    });
  });

  // ============= FileEmbeddingStore 维度变更 edge case =============

  describe("FileEmbeddingStore 维度变更 edge case", () => {
    it("53. isCompatible：modelId 变化（dimensions 相同）返回 false", async () => {
      const storeData = makeStoreData(
        {},
        { modelId: "model-a", dimensions: 384, updatedAt: 1 },
      );
      mocks.fileExists.mockResolvedValue(true);
      mocks.readFile.mockResolvedValue({ success: true, data: encodeJson(storeData) });

      const store = new FileEmbeddingStore();
      expect(await store.isCompatible("model-a", 384)).toBe(true);
      expect(await store.isCompatible("model-b", 384)).toBe(false); // modelId 变化
    });

    it("54. isCompatible：dimensions 变化（modelId 相同）返回 false", async () => {
      const storeData = makeStoreData(
        {},
        { modelId: "model-a", dimensions: 384, updatedAt: 1 },
      );
      mocks.fileExists.mockResolvedValue(true);
      mocks.readFile.mockResolvedValue({ success: true, data: encodeJson(storeData) });

      const store = new FileEmbeddingStore();
      expect(await store.isCompatible("model-a", 384)).toBe(true);
      expect(await store.isCompatible("model-a", 768)).toBe(false); // dimensions 变化
    });

    it("55. setEmbeddings：modelId 变化（dimensions 相同）清空旧 entries", async () => {
      const oldData = makeStoreData(
        { old: { embedding: [1, 2], updatedAt: 1 } },
        { modelId: "model-a", dimensions: 2, updatedAt: 1 },
      );
      mocks.fileExists.mockResolvedValue(true);
      mocks.readFile.mockResolvedValue({ success: true, data: encodeJson(oldData) });

      const store = new FileEmbeddingStore();
      await store.getMeta();

      // 用新 modelId（dimensions 相同）写入
      const updates = new Map<string, number[]>();
      updates.set("new", [3, 4]);
      await store.setEmbeddings(updates, "model-b", 2);

      const [, jsonStr] = mocks.writeFile.mock.calls[0]!;
      const saved = JSON.parse(jsonStr as string);
      expect(saved.entries.old).toBeUndefined(); // 旧 entry 被清空
      expect(saved.entries.new.embedding).toEqual([3, 4]);
      expect(saved.meta.modelId).toBe("model-b");
      expect(saved.meta.dimensions).toBe(2);
    });

    it("56. setEmbeddings：dimensions 变化（modelId 相同）清空旧 entries", async () => {
      const oldData = makeStoreData(
        { old: { embedding: [1, 2], updatedAt: 1 } },
        { modelId: "model-a", dimensions: 2, updatedAt: 1 },
      );
      mocks.fileExists.mockResolvedValue(true);
      mocks.readFile.mockResolvedValue({ success: true, data: encodeJson(oldData) });

      const store = new FileEmbeddingStore();
      await store.getMeta();

      // 用新 dimensions（modelId 相同）写入
      const updates = new Map<string, number[]>();
      updates.set("new", [1, 2, 3]);
      await store.setEmbeddings(updates, "model-a", 3);

      const [, jsonStr] = mocks.writeFile.mock.calls[0]!;
      const saved = JSON.parse(jsonStr as string);
      expect(saved.entries.old).toBeUndefined();
      expect(saved.entries.new.embedding).toEqual([1, 2, 3]);
      expect(saved.meta.modelId).toBe("model-a");
      expect(saved.meta.dimensions).toBe(3);
    });

    it("57. invalidateAll 后 getMeta 返回 null", async () => {
      const store = new FileEmbeddingStore();
      const updates = new Map<string, number[]>();
      updates.set("id1", [1, 0]);
      await store.setEmbeddings(updates, "api", 2);

      await store.invalidateAll();

      const meta = await store.getMeta();
      expect(meta).toBeNull();
    });

    it("58. invalidateAll 后 getEmbedding 返回 null", async () => {
      const store = new FileEmbeddingStore();
      const updates = new Map<string, number[]>();
      updates.set("id1", [1, 0]);
      await store.setEmbeddings(updates, "api", 2);

      await store.invalidateAll();

      const emb = await store.getEmbedding("id1");
      expect(emb).toBeNull();
    });

    it("59. setEmbeddings 维度一致时保留旧 entries（合并写入）", async () => {
      const oldData = makeStoreData(
        { existing: { embedding: [1, 0], updatedAt: 1 } },
        { modelId: "api", dimensions: 2, updatedAt: 1 },
      );
      mocks.fileExists.mockResolvedValue(true);
      mocks.readFile.mockResolvedValue({ success: true, data: encodeJson(oldData) });

      const store = new FileEmbeddingStore();
      await store.getMeta();

      const updates = new Map<string, number[]>();
      updates.set("new", [0, 1]);
      await store.setEmbeddings(updates, "api", 2);

      const [, jsonStr] = mocks.writeFile.mock.calls[0]!;
      const saved = JSON.parse(jsonStr as string);
      expect(saved.entries.existing.embedding).toEqual([1, 0]); // 旧 entry 保留
      expect(saved.entries.new.embedding).toEqual([0, 1]); // 新 entry 写入
    });

    it("60. setEmbeddings 空 updates 不写入文件", async () => {
      const store = new FileEmbeddingStore();
      const updates = new Map<string, number[]>();
      await store.setEmbeddings(updates, "api", 2);

      expect(mocks.writeFile).not.toHaveBeenCalled();
    });
  });
});

// ============= Helper =============

function encodeJsonToText(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}
