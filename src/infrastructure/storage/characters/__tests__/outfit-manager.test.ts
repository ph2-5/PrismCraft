import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CharacterOutfit } from "@/domain/schemas";

const mockSafeQuery = vi.hoisted(() => vi.fn());
const mockSafeRun = vi.hoisted(() => vi.fn());
const mockSafeTransaction = vi.hoisted(() => vi.fn());
const mockErrorLogger = vi.hoisted(() => ({ log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() }));

vi.mock("@/infrastructure/storage/sqlite-core", () => ({
  safeQuery: mockSafeQuery,
  safeRun: mockSafeRun,
  safeTransaction: mockSafeTransaction,
}));

vi.mock(import("@/infrastructure/storage/core"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    parseRecord: vi.fn((row: Record<string, unknown>) => {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        if (key.startsWith("is_")) {
          result[key] = value === 1 || value === true;
        } else {
          result[key] = value;
        }
      }
      return result;
    }),
  };
});

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
}));

import {
  getOutfitsForCharacter,
  buildOutfitStatements,
  saveOutfitsForCharacter,
  updateOutfitImage,
} from "../outfit-manager";

describe("outfit-manager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getOutfitsForCharacter", () => {
    it("正常返回服装列表", async () => {
      const rows = [
        {
          id: "outfit-1",
          name: "休闲装",
          description: "日常休闲",
          clothing: "T恤+牛仔裤",
          accessories_json: "[]",
          image_url: "https://example.com/img.png",
          local_image_path: "/local/img.png",
          thumbnail_path: "/local/thumb.png",
          is_default: 1,
          created_at: 1700000000,
        },
      ];
      mockSafeQuery.mockResolvedValue(rows);

      const result = await getOutfitsForCharacter("char-1");

      expect(mockSafeQuery).toHaveBeenCalledWith(
        "SELECT * FROM character_outfits WHERE character_id = ? ORDER BY is_default DESC, created_at ASC",
        ["char-1"],
      );
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("outfit-1");
      expect(result[0].name).toBe("休闲装");
    });

    it("accessories_json 字符串被正确解析为数组", async () => {
      const rows = [
        {
          id: "outfit-1",
          name: "正装",
          description: "",
          clothing: "西装",
          accessories_json: '["领带","手表"]',
          image_url: null,
          local_image_path: null,
          thumbnail_path: null,
          is_default: 0,
          created_at: "2024-01-01T00:00:00.000Z",
        },
      ];
      mockSafeQuery.mockResolvedValue(rows);

      const result = await getOutfitsForCharacter("char-1");

      expect(result[0].accessories).toEqual(["领带", "手表"]);
    });

    it("accessories_json 解析失败时回退为空数组", async () => {
      const rows = [
        {
          id: "outfit-1",
          name: "运动装",
          description: "",
          clothing: "运动服",
          accessories_json: "invalid-json",
          image_url: null,
          local_image_path: null,
          thumbnail_path: null,
          is_default: 0,
          created_at: "2024-01-01T00:00:00.000Z",
        },
      ];
      mockSafeQuery.mockResolvedValue(rows);

      const result = await getOutfitsForCharacter("char-1");

      expect(result[0].accessories).toEqual([]);
    });

    it("accessories_json 已解析的 JSON 字符串直接使用", async () => {
      const rows = [
        {
          id: "outfit-1",
          name: "礼服",
          description: "",
          clothing: "晚礼服",
          accessories_json: '["项链","耳环"]',
          image_url: null,
          local_image_path: null,
          thumbnail_path: null,
          is_default: 0,
          created_at: "2024-01-01T00:00:00.000Z",
        },
      ];
      mockSafeQuery.mockResolvedValue(rows);

      const result = await getOutfitsForCharacter("char-1");

      expect(result[0].accessories).toEqual(["项链", "耳环"]);
    });

    it("image_url, local_image_path, thumbnail_path 正确映射", async () => {
      const rows = [
        {
          id: "outfit-1",
          name: "测试装",
          description: "",
          clothing: "测试",
          accessories_json: "[]",
          image_url: "https://example.com/img.png",
          local_image_path: "/local/img.png",
          thumbnail_path: "/local/thumb.png",
          is_default: 0,
          created_at: "2024-01-01T00:00:00.000Z",
        },
      ];
      mockSafeQuery.mockResolvedValue(rows);

      const result = await getOutfitsForCharacter("char-1");

      expect(result[0].imageUrl).toBe("https://example.com/img.png");
      expect(result[0].localImagePath).toBe("/local/img.png");
      expect(result[0].thumbnailPath).toBe("/local/thumb.png");
    });

    it("is_default 布尔值转换", async () => {
      const rows = [
        {
          id: "outfit-1",
          name: "默认装",
          description: "",
          clothing: "默认",
          accessories_json: "[]",
          image_url: null,
          local_image_path: null,
          thumbnail_path: null,
          is_default: 1,
          created_at: "2024-01-01T00:00:00.000Z",
        },
        {
          id: "outfit-2",
          name: "非默认装",
          description: "",
          clothing: "非默认",
          accessories_json: "[]",
          image_url: null,
          local_image_path: null,
          thumbnail_path: null,
          is_default: 0,
          created_at: "2024-01-01T00:00:00.000Z",
        },
      ];
      mockSafeQuery.mockResolvedValue(rows);

      const result = await getOutfitsForCharacter("char-1");

      expect(result[0].isDefault).toBe(true);
      expect(result[1].isDefault).toBe(false);
    });

    it("created_at 数字类型转 ISO 字符串", async () => {
      const timestamp = 1700000000;
      const rows = [
        {
          id: "outfit-1",
          name: "测试",
          description: "",
          clothing: "测试",
          accessories_json: "[]",
          image_url: null,
          local_image_path: null,
          thumbnail_path: null,
          is_default: 0,
          created_at: timestamp,
        },
      ];
      mockSafeQuery.mockResolvedValue(rows);

      const result = await getOutfitsForCharacter("char-1");

      expect(result[0].createdAt).toBe(
        new Date(timestamp * 1000).toISOString(),
      );
    });
  });

  describe("buildOutfitStatements", () => {
    const outfits: CharacterOutfit[] = [
      {
        id: "outfit-1",
        name: "休闲装",
        description: "日常休闲",
        clothing: "T恤+牛仔裤",
        accessories: ["帽子"],
        imageUrl: "https://example.com/img.png",
        isDefault: true,
        createdAt: "2024-01-01T00:00:00.000Z",
      },
      {
        id: "outfit-2",
        name: "正装",
        description: "正式场合",
        clothing: "西装",
        accessories: ["领带", "手表"],
        isDefault: false,
        createdAt: "2024-06-01T00:00:00.000Z",
      },
    ];

    it("第一条语句是 DELETE FROM character_outfits", () => {
      const statements = buildOutfitStatements("char-1", outfits);

      expect(statements[0].sql).toBe(
        "DELETE FROM character_outfits WHERE character_id = ?",
      );
      expect(statements[0].params).toEqual(["char-1"]);
    });

    it("后续语句是 INSERT OR REPLACE INTO character_outfits", () => {
      const statements = buildOutfitStatements("char-1", outfits);

      for (let i = 1; i < statements.length; i++) {
        expect(statements[i].sql).toContain(
          "INSERT OR REPLACE INTO character_outfits",
        );
      }
    });

    it("语句数量 = 1 + outfits.length", () => {
      const statements = buildOutfitStatements("char-1", outfits);

      expect(statements.length).toBe(1 + outfits.length);
    });

    it("空 outfits 只返回 DELETE 语句", () => {
      const statements = buildOutfitStatements("char-1", []);

      expect(statements).toHaveLength(1);
      expect(statements[0].sql).toBe(
        "DELETE FROM character_outfits WHERE character_id = ?",
      );
    });

    it("自动生成 id 当 outfit.id 为空时", () => {
      const outfitWithoutId: CharacterOutfit = {
        id: "",
        name: "无ID装",
        description: "",
        clothing: "测试",
        accessories: [],
        isDefault: false,
        createdAt: "2024-01-01T00:00:00.000Z",
      };

      const statements = buildOutfitStatements("char-1", [outfitWithoutId]);

      const insertParams = statements[1].params;
      const generatedId = insertParams[0] as string;
      expect(generatedId).toMatch(/^outfit_/);
    });

    it("isDefault 转为 1/0", () => {
      const statements = buildOutfitStatements("char-1", outfits);

      const firstInsertParams = statements[1].params;
      const secondInsertParams = statements[2].params;

      expect(firstInsertParams[9]).toBe(1);
      expect(secondInsertParams[9]).toBe(0);
    });

    it("accessories 被序列化为 JSON", () => {
      const statements = buildOutfitStatements("char-1", outfits);

      const firstInsertParams = statements[1].params;
      const secondInsertParams = statements[2].params;

      expect(firstInsertParams[5]).toBe(JSON.stringify(["帽子"]));
      expect(secondInsertParams[5]).toBe(
        JSON.stringify(["领带", "手表"]),
      );
    });
  });

  describe("saveOutfitsForCharacter", () => {
    it("调用 safeTransaction 并传入 buildOutfitStatements 的结果", async () => {
      const outfits: CharacterOutfit[] = [
        {
          id: "outfit-1",
          name: "休闲装",
          description: "",
          clothing: "T恤",
          accessories: [],
          isDefault: true,
          createdAt: "2024-01-01T00:00:00.000Z",
        },
      ];
      mockSafeTransaction.mockResolvedValue(undefined);

      await saveOutfitsForCharacter("char-1", outfits);

      expect(mockSafeTransaction).toHaveBeenCalledTimes(1);
      const passedStatements = mockSafeTransaction.mock.calls[0][0];
      expect(passedStatements.length).toBe(2);
      expect(passedStatements[0].sql).toBe("DELETE FROM character_outfits WHERE character_id = ?");
      expect(passedStatements[0].params).toEqual(["char-1"]);
      expect(passedStatements[1].sql).toContain("INSERT OR REPLACE INTO character_outfits");
      expect(passedStatements[1].params[0]).toBe("outfit-1");
      expect(passedStatements[1].params[1]).toBe("char-1");
      expect(passedStatements[1].params[2]).toBe("休闲装");
    });
  });

  describe("updateOutfitImage", () => {
    it("不含 localImagePath 时 SQL 不包含 local_image_path", async () => {
      mockSafeRun.mockResolvedValue(undefined);

      await updateOutfitImage("outfit-1", "https://example.com/new-img.png");

      expect(mockSafeRun).toHaveBeenCalledTimes(1);
      const [sql, params] = mockSafeRun.mock.calls[0];
      expect(sql).not.toContain("local_image_path");
      expect(params).not.toContain("/local/new-img.png");
    });

    it("含 localImagePath 时 SQL 包含 local_image_path", async () => {
      mockSafeRun.mockResolvedValue(undefined);

      await updateOutfitImage(
        "outfit-1",
        "https://example.com/new-img.png",
        "/local/new-img.png",
      );

      expect(mockSafeRun).toHaveBeenCalledTimes(1);
      const [sql, params] = mockSafeRun.mock.calls[0];
      expect(sql).toContain("local_image_path");
      expect(params).toContain("/local/new-img.png");
    });
  });
});
