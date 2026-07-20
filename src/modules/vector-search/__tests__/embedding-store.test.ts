/**
 * FileEmbeddingStore 容错单元测试
 *
 * Mock @/shared/file-http 的 readFile/writeFile/fileExists/getCacheDirectory。
 * 不导入 @/infrastructure/di，通过构造函数测试存储层独立行为。
 *
 * 覆盖：
 * - 首次 load 文件不存在
 * - 缓存命中
 * - 文件损坏容错（JSON.parse 失败）
 * - isCompatible 维度变更
 * - setEmbeddings 维度不匹配跳过单条
 * - resetCache 重新加载
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { FileEmbeddingStore } from "../embedding-store";

// ── vi.hoisted 声明 mock 变量 ──
const mocks = vi.hoisted(() => ({
  writeFile: vi.fn(),
  readFile: vi.fn(),
  fileExists: vi.fn(),
  getCacheDirectory: vi.fn(),
}));

vi.mock("@/shared/file-http", () => ({
  writeFile: mocks.writeFile,
  readFile: mocks.readFile,
  fileExists: mocks.fileExists,
  getCacheDirectory: mocks.getCacheDirectory,
}));

// ============= Helpers =============

function encodeJson(data: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(data));
}

function encodeText(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function makeStoreData(
  entries: Record<string, { embedding: number[]; updatedAt: number }>,
  meta?: { modelId: string; dimensions: number; updatedAt: number } | null,
) {
  return { meta: meta ?? null, entries };
}

// ============= Tests =============

describe("FileEmbeddingStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.writeFile.mockResolvedValue({ success: true });
    mocks.readFile.mockResolvedValue({ success: false, data: undefined });
    mocks.fileExists.mockResolvedValue(false);
    mocks.getCacheDirectory.mockResolvedValue({ success: true, path: "/test/cache" });
  });

  // ============= 首次加载 =============

  describe("首次加载", () => {
    it("文件不存在时返回空 store", async () => {
      const store = new FileEmbeddingStore();
      expect(await store.getMeta()).toBeNull();
      expect(await store.getEmbedding("any")).toBeNull();
    });

    it("getCacheDirectory 失败时返回空 store", async () => {
      mocks.getCacheDirectory.mockResolvedValue({ success: false, error: "no cache" });
      const store = new FileEmbeddingStore();
      expect(await store.getMeta()).toBeNull();
    });

    it("readFile 失败时返回空 store", async () => {
      mocks.fileExists.mockResolvedValue(true);
      mocks.readFile.mockResolvedValue({ success: false, error: "permission denied" });
      const store = new FileEmbeddingStore();
      expect(await store.getMeta()).toBeNull();
    });

    it("文件存在时正确加载", async () => {
      const data = makeStoreData(
        { a: { embedding: [1, 2, 3], updatedAt: 1000 } },
        { modelId: "api", dimensions: 3, updatedAt: 1000 },
      );
      mocks.fileExists.mockResolvedValue(true);
      mocks.readFile.mockResolvedValue({ success: true, data: encodeJson(data) });

      const store = new FileEmbeddingStore();
      expect(await store.getMeta()).toEqual({ modelId: "api", dimensions: 3, updatedAt: 1000 });
      expect(await store.getEmbedding("a")).toEqual([1, 2, 3]);
    });
  });

  // ============= 缓存命中 =============

  describe("缓存命中", () => {
    it("第二次读取不重新读文件", async () => {
      const data = makeStoreData(
        { a: { embedding: [1], updatedAt: 1000 } },
        { modelId: "api", dimensions: 1, updatedAt: 1000 },
      );
      mocks.fileExists.mockResolvedValue(true);
      mocks.readFile.mockResolvedValue({ success: true, data: encodeJson(data) });

      const store = new FileEmbeddingStore();
      await store.getMeta();
      await store.getMeta();
      await store.getEmbedding("a");

      expect(mocks.fileExists).toHaveBeenCalledTimes(1);
      expect(mocks.readFile).toHaveBeenCalledTimes(1);
    });

    it("getEmbeddings 批量读取使用缓存", async () => {
      const data = makeStoreData(
        {
          a: { embedding: [1], updatedAt: 1 },
          b: { embedding: [2], updatedAt: 1 },
        },
        { modelId: "api", dimensions: 1, updatedAt: 1 },
      );
      mocks.fileExists.mockResolvedValue(true);
      mocks.readFile.mockResolvedValue({ success: true, data: encodeJson(data) });

      const store = new FileEmbeddingStore();
      const map = await store.getEmbeddings(["a", "b", "c"]);

      expect(map.size).toBe(2);
      expect(map.get("a")).toEqual([1]);
      expect(map.get("b")).toEqual([2]);
      expect(map.get("c")).toBeUndefined();
    });
  });

  // ============= 文件损坏容错 =============

  describe("文件损坏容错", () => {
    it("JSON.parse 失败时退化为空 store", async () => {
      mocks.fileExists.mockResolvedValue(true);
      mocks.readFile.mockResolvedValue({ success: true, data: encodeText("not valid json") });

      const store = new FileEmbeddingStore();
      expect(await store.getMeta()).toBeNull();
      expect(await store.getEmbedding("a")).toBeNull();
    });

    it("非对象 JSON 退化为空 store", async () => {
      mocks.fileExists.mockResolvedValue(true);
      mocks.readFile.mockResolvedValue({ success: true, data: encodeJson("[1, 2, 3]") });

      const store = new FileEmbeddingStore();
      expect(await store.getMeta()).toBeNull();
    });

    it("单条 entry 损坏时跳过该条保留其他", async () => {
      const data = {
        meta: { modelId: "api", dimensions: 2, updatedAt: 1000 },
        entries: {
          good: { embedding: [1, 2], updatedAt: 1000 },
          bad1: { embedding: "not_array", updatedAt: 1000 },
          bad2: { embedding: [1, 2] }, // 缺 updatedAt
          bad3: { embedding: [1, "x"], updatedAt: 1000 }, // 元素非 number
        },
      };
      mocks.fileExists.mockResolvedValue(true);
      mocks.readFile.mockResolvedValue({ success: true, data: encodeJson(data) });

      const store = new FileEmbeddingStore();
      expect(await store.getEmbedding("good")).toEqual([1, 2]);
      expect(await store.getEmbedding("bad1")).toBeNull();
      expect(await store.getEmbedding("bad2")).toBeNull();
      expect(await store.getEmbedding("bad3")).toBeNull();
    });

    it("meta 损坏时退化为 null meta", async () => {
      const data = {
        meta: { modelId: "api" }, // 缺 dimensions 和 updatedAt
        entries: { a: { embedding: [1], updatedAt: 1 } },
      };
      mocks.fileExists.mockResolvedValue(true);
      mocks.readFile.mockResolvedValue({ success: true, data: encodeJson(data) });

      const store = new FileEmbeddingStore();
      expect(await store.getMeta()).toBeNull();
      // entries 仍可读取
      expect(await store.getEmbedding("a")).toEqual([1]);
    });
  });

  // ============= isCompatible 维度变更 =============

  describe("isCompatible 维度变更", () => {
    it("无 meta 时返回 true（首次写入）", async () => {
      const store = new FileEmbeddingStore();
      expect(await store.isCompatible("any", 384)).toBe(true);
    });

    it("modelId 和 dimensions 一致时返回 true", async () => {
      const data = makeStoreData({}, { modelId: "api", dimensions: 384, updatedAt: 1 });
      mocks.fileExists.mockResolvedValue(true);
      mocks.readFile.mockResolvedValue({ success: true, data: encodeJson(data) });

      const store = new FileEmbeddingStore();
      expect(await store.isCompatible("api", 384)).toBe(true);
    });

    it("modelId 变化时返回 false", async () => {
      const data = makeStoreData({}, { modelId: "model-a", dimensions: 384, updatedAt: 1 });
      mocks.fileExists.mockResolvedValue(true);
      mocks.readFile.mockResolvedValue({ success: true, data: encodeJson(data) });

      const store = new FileEmbeddingStore();
      expect(await store.isCompatible("model-b", 384)).toBe(false);
    });

    it("dimensions 变化时返回 false", async () => {
      const data = makeStoreData({}, { modelId: "api", dimensions: 384, updatedAt: 1 });
      mocks.fileExists.mockResolvedValue(true);
      mocks.readFile.mockResolvedValue({ success: true, data: encodeJson(data) });

      const store = new FileEmbeddingStore();
      expect(await store.isCompatible("api", 768)).toBe(false);
    });

    it("维度变更后调用 invalidateAll 清空数据", async () => {
      const data = makeStoreData(
        { old: { embedding: [1, 2], updatedAt: 1 } },
        { modelId: "api", dimensions: 2, updatedAt: 1 },
      );
      mocks.fileExists.mockResolvedValue(true);
      mocks.readFile.mockResolvedValue({ success: true, data: encodeJson(data) });

      const store = new FileEmbeddingStore();
      // 维度一致
      expect(await store.isCompatible("api", 2)).toBe(true);
      // 维度变更
      expect(await store.isCompatible("api", 3)).toBe(false);

      // 调用 invalidateAll 清空
      await store.invalidateAll();

      // 验证写入了空 store
      const [, jsonStr] = mocks.writeFile.mock.calls[0]!;
      const saved = JSON.parse(jsonStr as string);
      expect(saved.meta).toBeNull();
      expect(saved.entries).toEqual({});
    });
  });

  // ============= setEmbeddings =============

  describe("setEmbeddings", () => {
    it("正常写入并更新 meta", async () => {
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

    it("维度不匹配的单条 embedding 被跳过", async () => {
      const store = new FileEmbeddingStore();
      const updates = new Map<string, number[]>();
      updates.set("good", [1, 0, 0]);
      updates.set("bad", [1, 0]); // 维度不匹配（期望 3，实际 2）

      await store.setEmbeddings(updates, "api", 3);

      const [, jsonStr] = mocks.writeFile.mock.calls[0]!;
      const saved = JSON.parse(jsonStr as string);
      expect(saved.entries.good).toBeDefined();
      expect(saved.entries.bad).toBeUndefined();
    });

    it("维度变更时清空旧 entries", async () => {
      const oldData = makeStoreData(
        { old: { embedding: [1, 2], updatedAt: 1 } },
        { modelId: "old-model", dimensions: 2, updatedAt: 1 },
      );
      mocks.fileExists.mockResolvedValue(true);
      mocks.readFile.mockResolvedValue({ success: true, data: encodeJson(oldData) });

      const store = new FileEmbeddingStore();
      await store.getMeta(); // 触发加载

      const updates = new Map<string, number[]>();
      updates.set("new", [1, 2, 3, 4]);
      await store.setEmbeddings(updates, "new-model", 4);

      const [, jsonStr] = mocks.writeFile.mock.calls[0]!;
      const saved = JSON.parse(jsonStr as string);
      expect(saved.entries.old).toBeUndefined();
      expect(saved.entries.new.embedding).toEqual([1, 2, 3, 4]);
      expect(saved.meta.modelId).toBe("new-model");
      expect(saved.meta.dimensions).toBe(4);
    });

    it("维度一致时合并写入（保留旧 entries）", async () => {
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
      expect(saved.entries.existing.embedding).toEqual([1, 0]);
      expect(saved.entries.new.embedding).toEqual([0, 1]);
    });

    it("空 updates 不写入文件", async () => {
      const store = new FileEmbeddingStore();
      const updates = new Map<string, number[]>();
      await store.setEmbeddings(updates, "api", 2);
      expect(mocks.writeFile).not.toHaveBeenCalled();
    });
  });

  // ============= invalidateAll =============

  describe("invalidateAll", () => {
    it("清空所有数据", async () => {
      const store = new FileEmbeddingStore();
      const updates = new Map<string, number[]>();
      updates.set("id1", [1, 0]);
      await store.setEmbeddings(updates, "api", 2);

      await store.invalidateAll();

      const [, jsonStr] = mocks.writeFile.mock.calls[1]!;
      const saved = JSON.parse(jsonStr as string);
      expect(saved.meta).toBeNull();
      expect(saved.entries).toEqual({});
    });

    it("清空后 getMeta 返回 null", async () => {
      const store = new FileEmbeddingStore();
      const updates = new Map<string, number[]>();
      updates.set("id1", [1, 0]);
      await store.setEmbeddings(updates, "api", 2);

      await store.invalidateAll();

      expect(await store.getMeta()).toBeNull();
    });

    it("清空后 getEmbedding 返回 null", async () => {
      const store = new FileEmbeddingStore();
      const updates = new Map<string, number[]>();
      updates.set("id1", [1, 0]);
      await store.setEmbeddings(updates, "api", 2);

      await store.invalidateAll();

      expect(await store.getEmbedding("id1")).toBeNull();
    });
  });

  // ============= resetCache =============

  describe("resetCache", () => {
    it("resetCache 后重新读取文件", async () => {
      const data = makeStoreData(
        { a: { embedding: [1], updatedAt: 1000 } },
        { modelId: "api", dimensions: 1, updatedAt: 1000 },
      );
      mocks.fileExists.mockResolvedValue(true);
      mocks.readFile.mockResolvedValue({ success: true, data: encodeJson(data) });

      const store = new FileEmbeddingStore();
      await store.getMeta();

      store.resetCache();
      await store.getMeta();

      expect(mocks.fileExists).toHaveBeenCalledTimes(2);
    });

    it("resetCache 后读取新数据", async () => {
      const oldData = makeStoreData(
        { a: { embedding: [1], updatedAt: 1 } },
        { modelId: "api", dimensions: 1, updatedAt: 1 },
      );
      const newData = makeStoreData(
        { b: { embedding: [2, 3], updatedAt: 2 } },
        { modelId: "api", dimensions: 2, updatedAt: 2 },
      );

      mocks.fileExists.mockResolvedValue(true);
      mocks.readFile
        .mockResolvedValueOnce({ success: true, data: encodeJson(oldData) })
        .mockResolvedValueOnce({ success: true, data: encodeJson(newData) });

      const store = new FileEmbeddingStore();
      await store.getMeta();
      expect(await store.getEmbedding("a")).toEqual([1]);

      store.resetCache();
      await store.getMeta();
      expect(await store.getEmbedding("a")).toBeNull();
      expect(await store.getEmbedding("b")).toEqual([2, 3]);
    });
  });
});
