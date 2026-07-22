import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSafeQuery, mockSafeRun, mockSafeTransaction } = vi.hoisted(() => ({
  mockSafeQuery: vi.fn(),
  mockSafeRun: vi.fn(),
  mockSafeTransaction: vi.fn(),
}));

vi.mock("@/infrastructure/storage/sqlite-core", () => ({
  safeQuery: mockSafeQuery,
  safeRun: mockSafeRun,
  safeTransaction: mockSafeTransaction,
}));

vi.mock(import("@/infrastructure/storage/core"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    toSqlValue: vi.fn((v: unknown) => {
      if (v === undefined || v === null) return null;
      if (Array.isArray(v) || typeof v === "object") {
        try {
          return JSON.stringify(v);
        } catch {
          return null;
        }
      }
      return v;
    }),
    trackChange: vi.fn(),
  };
});

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { warn: vi.fn(), error: vi.fn() },
  extractErrorMessage: vi.fn((e: unknown) => (e instanceof Error ? e.message : String(e))),
}));

import { mediaAssetRepository } from "../media-asset-repository";
import { trackChange } from "@/infrastructure/storage/core";
import { DatabaseError } from "@/domain/types";

function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "asset-1",
    name: "test-asset.png",
    description: "a description",
    type: "image",
    url: "file:///path/to/asset.png",
    thumbnail_url: "file:///path/to/thumb.png",
    tags: JSON.stringify(["tag1", "tag2"]),
    created_at: "1700000000",
    updated_at: "1700000001",
    bound_to_type: null,
    bound_to_id: null,
    bound_to_name: null,
    file_size: 1024,
    mime_type: "image/png",
    width: 800,
    height: 600,
    duration: null,
    ...overrides,
  };
}

describe("infrastructure/database/media-asset-repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSafeQuery.mockResolvedValue([]);
    mockSafeRun.mockResolvedValue(undefined);
    mockSafeTransaction.mockResolvedValue([]);
  });

  describe("findAll", () => {
    it("返回所有资源并按 schema 解析行数据", async () => {
      mockSafeQuery.mockResolvedValueOnce([
        makeRow({ id: "a1", name: "asset-1" }),
        makeRow({ id: "a2", name: "asset-2", tags: "[]" }),
      ]);

      const result = await mediaAssetRepository.findAll();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0]!.id).toBe("a1");
        expect(result.value[0]!.name).toBe("asset-1");
        expect(result.value[0]!.tags).toEqual(["tag1", "tag2"]);
        expect(result.value[1]!.tags).toEqual([]);
      }
      expect(mockSafeQuery).toHaveBeenCalledWith(
        "SELECT * FROM media_assets ORDER BY created_at DESC",
      );
    });

    it("数据库无数据时返回空数组", async () => {
      mockSafeQuery.mockResolvedValueOnce([]);

      const result = await mediaAssetRepository.findAll();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    it("数据库抛出错误时返回 Result.err", async () => {
      mockSafeQuery.mockRejectedValueOnce(new Error("db connection lost"));

      const result = await mediaAssetRepository.findAll();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("UNKNOWN_ERROR");
        expect(result.error.message).toContain("db connection lost");
      }
    });
  });

  describe("findById", () => {
    it("找到资源时返回解析后的对象", async () => {
      mockSafeQuery.mockResolvedValueOnce([makeRow({ id: "x1" })]);

      const result = await mediaAssetRepository.findById("x1");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).not.toBeNull();
        expect(result.value!.id).toBe("x1");
      }
      expect(mockSafeQuery).toHaveBeenCalledWith(
        "SELECT * FROM media_assets WHERE id = ?",
        ["x1"],
      );
    });

    it("未找到资源时返回 null", async () => {
      mockSafeQuery.mockResolvedValueOnce([]);

      const result = await mediaAssetRepository.findById("missing");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it("数据库错误时返回 Result.err", async () => {
      mockSafeQuery.mockRejectedValueOnce(new Error("query failed"));

      const result = await mediaAssetRepository.findById("any");

      expect(result.ok).toBe(false);
    });
  });

  describe("create", () => {
    it("成功创建并返回新资源", async () => {
      mockSafeRun.mockResolvedValueOnce(undefined);
      mockSafeQuery.mockResolvedValueOnce([makeRow({ id: "new-1", name: "new" })]);

      const result = await mediaAssetRepository.create({
        id: "new-1",
        name: "new",
        type: "image",
        url: "file:///new.png",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe("new-1");
        expect(result.value.name).toBe("new");
      }
      expect(mockSafeRun).toHaveBeenCalledOnce();
      const [sql, params] = mockSafeRun.mock.calls[0]!;
      expect(sql).toContain("INSERT OR IGNORE INTO media_assets");
      expect(params[0]).toBe("new-1");
      expect(params[1]).toBe("new");
      // owner_id 是固定值 1
      expect(params).toContain(1);
      expect(trackChange).toHaveBeenCalledWith("media_asset", "new-1", "insert");
    });

    it("创建后 findById 返回 null 时抛出 DatabaseError", async () => {
      mockSafeRun.mockResolvedValueOnce(undefined);
      mockSafeQuery.mockResolvedValueOnce([]);

      const result = await mediaAssetRepository.create({
        id: "ghost",
        name: "ghost",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(DatabaseError);
        expect(result.error.message).toContain("Failed to create media asset");
      }
    });

    it("trackChange 抛出错误时不应影响 create 返回值", async () => {
      mockSafeRun.mockResolvedValueOnce(undefined);
      mockSafeQuery.mockResolvedValueOnce([makeRow({ id: "t1" })]);
      vi.mocked(trackChange).mockRejectedValueOnce(new Error("trackChange failed"));

      const result = await mediaAssetRepository.create({ id: "t1", name: "n" });

      expect(result.ok).toBe(true);
    });

    it("safeRun 失败时返回 Result.err", async () => {
      mockSafeRun.mockRejectedValueOnce(new Error("insert failed"));

      const result = await mediaAssetRepository.create({ id: "fail", name: "n" });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("insert failed");
      }
    });

    it("未提供 type 时默认使用 'image'", async () => {
      mockSafeRun.mockResolvedValueOnce(undefined);
      mockSafeQuery.mockResolvedValueOnce([makeRow({ id: "def" })]);

      await mediaAssetRepository.create({ id: "def", name: "default-type" });

      const params = mockSafeRun.mock.calls[0]![1] as unknown[];
      // type 字段在 SQL 中位于第 4 个参数 (index 3)
      expect(params[3]).toBe("image");
    });
  });

  describe("update", () => {
    it("成功更新并返回更新后的资源", async () => {
      mockSafeRun.mockResolvedValueOnce(undefined);
      mockSafeQuery.mockResolvedValueOnce([makeRow({ id: "u1", name: "updated" })]);

      const result = await mediaAssetRepository.update({
        id: "u1",
        name: "updated",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe("u1");
        expect(result.value.name).toBe("updated");
      }
      const [sql] = mockSafeRun.mock.calls[0]!;
      expect(sql).toContain("UPDATE media_assets SET");
      expect(trackChange).toHaveBeenCalledWith("media_asset", "u1", "update");
    });

    it("更新后 findById 返回 null 时抛出 DatabaseError", async () => {
      mockSafeRun.mockResolvedValueOnce(undefined);
      mockSafeQuery.mockResolvedValueOnce([]);

      const result = await mediaAssetRepository.update({ id: "missing", name: "x" });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(DatabaseError);
        expect(result.error.message).toContain("Failed to update media asset");
      }
    });

    it("safeRun 抛出错误时返回 Result.err", async () => {
      mockSafeRun.mockRejectedValueOnce(new Error("update failed"));

      const result = await mediaAssetRepository.update({ id: "err", name: "x" });

      expect(result.ok).toBe(false);
    });

    it("trackChange 失败不影响 update 返回值", async () => {
      mockSafeRun.mockResolvedValueOnce(undefined);
      mockSafeQuery.mockResolvedValueOnce([makeRow({ id: "ok" })]);
      vi.mocked(trackChange).mockRejectedValueOnce(new Error("track failed"));

      const result = await mediaAssetRepository.update({ id: "ok", name: "x" });

      expect(result.ok).toBe(true);
    });
  });

  describe("delete", () => {
    it("成功删除时执行事务并跟踪变更", async () => {
      mockSafeTransaction.mockResolvedValueOnce([]);

      const result = await mediaAssetRepository.delete("del-1");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeUndefined();
      }
      const statements = mockSafeTransaction.mock.calls[0]![0]!;
      expect(statements).toHaveLength(2);
      expect(statements[0]!.sql).toContain("DELETE FROM collection_assets");
      expect(statements[0]!.params).toEqual(["del-1"]);
      expect(statements[1]!.sql).toContain("DELETE FROM media_assets");
      expect(statements[1]!.params).toEqual(["del-1"]);
      expect(trackChange).toHaveBeenCalledWith("media_asset", "del-1", "delete");
    });

    it("事务抛出错误时返回 Result.err", async () => {
      mockSafeTransaction.mockRejectedValueOnce(new Error("txn failed"));

      const result = await mediaAssetRepository.delete("del-err");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("txn failed");
      }
    });

    it("trackChange 失败不影响 delete 返回值", async () => {
      mockSafeTransaction.mockResolvedValueOnce([]);
      vi.mocked(trackChange).mockRejectedValueOnce(new Error("track failed"));

      const result = await mediaAssetRepository.delete("del-track");

      expect(result.ok).toBe(true);
    });
  });

  describe("rowToMediaAsset 解析（通过 findAll 间接测试）", () => {
    it("tags 字段为数组时直接使用", async () => {
      mockSafeQuery.mockResolvedValueOnce([
        makeRow({ id: "arr", tags: ["a", "b"] as unknown as string }),
      ]);

      const result = await mediaAssetRepository.findAll();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0]!.tags).toEqual(["a", "b"]);
      }
    });

    it("boundTo 字段齐全时构建 boundTo 对象", async () => {
      mockSafeQuery.mockResolvedValueOnce([
        makeRow({
          id: "bound",
          bound_to_type: "character",
          bound_to_id: "char-1",
          bound_to_name: "Hero",
        }),
      ]);

      const result = await mediaAssetRepository.findAll();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0]!.boundTo).toEqual({
          type: "character",
          id: "char-1",
          name: "Hero",
        });
      }
    });

    it("boundTo 字段缺失时不构建 boundTo 对象", async () => {
      mockSafeQuery.mockResolvedValueOnce([
        makeRow({ bound_to_type: null, bound_to_id: null, bound_to_name: null }),
      ]);

      const result = await mediaAssetRepository.findAll();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0]!.boundTo).toBeUndefined();
      }
    });

    it("thumbnailUrl/fileSize 等可选字段缺失时为 undefined", async () => {
      mockSafeQuery.mockResolvedValueOnce([
        makeRow({
          thumbnail_url: null,
          file_size: null,
          mime_type: null,
          width: null,
          height: null,
          duration: null,
        }),
      ]);

      const result = await mediaAssetRepository.findAll();

      expect(result.ok).toBe(true);
      if (result.ok) {
        const asset = result.value[0]!;
        expect(asset.thumbnailUrl).toBeUndefined();
        expect(asset.fileSize).toBeUndefined();
        expect(asset.mimeType).toBeUndefined();
        expect(asset.width).toBeUndefined();
        expect(asset.height).toBeUndefined();
        expect(asset.duration).toBeUndefined();
      }
    });
  });
});
