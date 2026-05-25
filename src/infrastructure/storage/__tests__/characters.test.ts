import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Character } from "@/domain/schemas/character";

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
    parseRecord: vi.fn((r) => r),
    toSqlValue: vi.fn((v) => (v === undefined ? null : v)),
    trackChange: vi.fn(),
    buildInsert: vi.fn((table, columns, values) => ({
      sql: `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
      params: values,
    })),
    isElectron: vi.fn(() => true),
  };
});

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { warn: vi.fn(), error: vi.fn() },
  extractErrorMessage: vi.fn((e) => (e instanceof Error ? e.message : String(e))),
}));

function makeCharacterInput(overrides: Partial<Character> = {}): Partial<Character> {
  return {
    name: "Test",
    ...overrides,
  };
}

describe("storage/characters", () => {
  let characterStorage: typeof import("../characters").characterStorage;
  let updateOutfitImage: typeof import("../characters").updateOutfitImage;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSafeQuery.mockResolvedValue([]);
    mockSafeRun.mockResolvedValue(undefined);
    mockSafeTransaction.mockResolvedValue([]);
    const mod = await import("../characters");
    characterStorage = mod.characterStorage;
    updateOutfitImage = mod.updateOutfitImage;
  });

  describe("createCharacter with outfits", () => {
    it("should include outfit statements in transaction when outfits are non-empty", async () => {
      const outfits = [
        {
          id: "o1",
          name: "Casual",
          description: "",
          clothing: "T-shirt",
          accessories: [],
          isDefault: true,
          createdAt: 1000,
        },
        {
          id: "o2",
          name: "Formal",
          description: "",
          clothing: "Suit",
          accessories: [],
          isDefault: false,
          createdAt: 1001,
        },
      ];
      await characterStorage.createCharacter(makeCharacterInput({ outfits } as unknown as Partial<Character>));

      const statements = mockSafeTransaction.mock.calls[0][0];
      expect(statements.length).toBe(4);
      expect(statements[0].sql).toContain("INSERT");
      expect(statements[0].sql).toContain("characters");
      expect(statements[1].sql).toContain("DELETE FROM character_outfits");
      expect(statements[2].sql).toContain(
        "INSERT OR REPLACE INTO character_outfits",
      );
      expect(statements[3].sql).toContain(
        "INSERT OR REPLACE INTO character_outfits",
      );
    });

    it("should only include character INSERT when outfits are empty or undefined", async () => {
      await characterStorage.createCharacter(makeCharacterInput({ outfits: [] }));
      let statements = mockSafeTransaction.mock.calls[0][0];
      expect(statements.length).toBe(1);
      expect(statements[0].sql).toContain("INSERT");
      expect(statements[0].sql).toContain("characters");

      vi.clearAllMocks();
      mockSafeTransaction.mockResolvedValue([]);

      await characterStorage.createCharacter(makeCharacterInput());
      statements = mockSafeTransaction.mock.calls[0][0];
      expect(statements.length).toBe(1);
      expect(statements[0].sql).toContain("INSERT");
      expect(statements[0].sql).toContain("characters");
    });
  });

  describe("updateCharacter not found", () => {
    it("should throw error containing 'not found' when character does not exist", async () => {
      mockSafeTransaction.mockResolvedValueOnce([{ changes: 0 }]);
      mockSafeQuery.mockResolvedValueOnce([]);

      await expect(
        characterStorage.updateCharacter("nonexistent-id", makeCharacterInput({ name: "Test" })),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe("deleteCharacter cascade", () => {
    it("should include 6 cascade statements in transaction", async () => {
      await characterStorage.deleteCharacter("char-1");

      const statements = mockSafeTransaction.mock.calls[0][0];
      expect(statements.length).toBe(6);
      expect(statements[0].sql).toContain("collection_assets");
      expect(statements[1].sql).toContain("story_characters");
      expect(statements[2].sql).toContain("asset_tags");
      expect(statements[3].sql).toContain("character_outfits");
      expect(statements[4].sql).toContain("media_assets");
      expect(statements[5].sql).toContain("DELETE FROM characters");
    });
  });

  describe("getCharacterById outfits fallback", () => {
    it("should fall back to outfits_json when getOutfitsForCharacter fails", async () => {
      const outfitsFromJson = [{ id: "o1", name: "Legacy Outfit" }];
      mockSafeQuery
        .mockResolvedValueOnce([
          {
            id: "1",
            name: "Test",
            meta: JSON.stringify({ outfits: outfitsFromJson }),
          },
        ])
        .mockRejectedValueOnce(new Error("DB error"));

      const result = await characterStorage.getCharacterById("1");
      expect(result).not.toBeNull();
      expect(result!.outfits).toEqual(outfitsFromJson);
    });
  });

  describe("updateOutfitImage", () => {
    it("should include local_image_path in SQL when localImagePath is provided", async () => {
      await updateOutfitImage("outfit-1", "http://img.png", "/local/path.png");

      expect(mockSafeRun).toHaveBeenCalledTimes(1);
      const [sql] = mockSafeRun.mock.calls[0];
      expect(sql).toContain("local_image_path");
    });

    it("should not include local_image_path in SQL when localImagePath is undefined", async () => {
      await updateOutfitImage("outfit-1", "http://img.png");

      expect(mockSafeRun).toHaveBeenCalledTimes(1);
      const [sql] = mockSafeRun.mock.calls[0];
      expect(sql).not.toContain("local_image_path");
    });
  });
});
