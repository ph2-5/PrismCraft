import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/infrastructure/storage/sqlite-core", () => ({
  safeQuery: vi.fn(),
  safeRun: vi.fn(),
  safeTransaction: vi.fn(),
}));

vi.mock(import("@/infrastructure/storage/core"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    parseRecord: vi.fn((r) => r),
    trackChange: vi.fn(),
  };
});

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { warn: vi.fn(), error: vi.fn() },
}));

import { safeQuery, safeRun, safeTransaction } from "@/infrastructure/storage/sqlite-core";
import { collectionStorage } from "@/infrastructure/storage/collections";

const mockSafeQuery = vi.mocked(safeQuery);
const mockSafeRun = vi.mocked(safeRun);
const mockSafeTransaction = vi.mocked(safeTransaction);

describe("collectionStorage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCollections", () => {
    it("应返回所有集合", async () => {
      mockSafeQuery.mockResolvedValue([
        { id: "col-1", name: "集合1", created_at: "1000", updated_at: "1000" },
        { id: "col-2", name: "集合2", created_at: "2000", updated_at: "2000" },
      ]);
      const result = await collectionStorage.getCollections();
      expect(result.length).toBe(2);
      expect(result[0]!.id).toBe("col-1");
      expect(result[0]!.name).toBe("集合1");
    });

    it("空数据库应返回空数组", async () => {
      mockSafeQuery.mockResolvedValue([]);
      const result = await collectionStorage.getCollections();
      expect(result).toEqual([]);
    });
  });

  describe("createCollection", () => {
    it("应创建集合并返回", async () => {
      mockSafeRun.mockResolvedValue({ changes: 1 });
      const result = await collectionStorage.createCollection("新集合", "col-custom");
      expect(result.id).toBe("col-custom");
      expect(result.name).toBe("新集合");
      expect(mockSafeRun).toHaveBeenCalledWith(
        expect.stringContaining("INSERT OR IGNORE INTO collections"),
        expect.arrayContaining(["col-custom", "新集合"]),
      );
    });

    it("未指定 id 时应自动生成", async () => {
      mockSafeRun.mockResolvedValue({ changes: 1 });
      const result = await collectionStorage.createCollection("自动ID集合");
      expect(result.id).toMatch(/^col_[0-9a-f]{8}-/);
    });
  });

  describe("deleteCollection", () => {
    it("应同时删除集合和关联资产", async () => {
      mockSafeTransaction.mockResolvedValue([] as unknown[]);
      await collectionStorage.deleteCollection("col-1");
      expect(mockSafeTransaction).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ sql: expect.stringContaining("DELETE FROM collection_assets") }),
          expect.objectContaining({ sql: expect.stringContaining("DELETE FROM collections") }),
        ]),
      );
    });
  });

  describe("addAssetToCollection", () => {
    it("应添加资产到集合", async () => {
      mockSafeRun.mockResolvedValue({ changes: 1 });
      await collectionStorage.addAssetToCollection("col-1", "character", "char-1");
      expect(mockSafeRun).toHaveBeenCalledWith(
        expect.stringContaining("INSERT OR IGNORE INTO collection_assets"),
        expect.arrayContaining(["col-1", "character", "char-1"]),
      );
    });
  });

  describe("removeAssetFromCollection", () => {
    it("应从集合中移除资产", async () => {
      mockSafeRun.mockResolvedValue({ changes: 1 });
      await collectionStorage.removeAssetFromCollection("col-1", "character", "char-1");
      expect(mockSafeRun).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM collection_assets"),
        expect.arrayContaining(["col-1", "character", "char-1"]),
      );
    });
  });

  describe("getAssetsInCollection", () => {
    it("应返回指定集合的资产", async () => {
      mockSafeQuery.mockResolvedValue([
        { id: "ca-1", collection_id: "col-1", asset_type: "character", asset_id: "char-1" },
      ]);
      const result = await collectionStorage.getAssetsInCollection("col-1");
      expect(result.length).toBe(1);
      expect(result[0]!.collectionId).toBe("col-1");
      expect(result[0]!.assetType).toBe("character");
    });
  });
});
