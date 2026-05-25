import { vi, beforeEach } from "vitest";

const {
  mockSafeQuery,
  mockSafeRun,
  mockSafeTransaction,
  mockSanitizeIdentifier,
  mockSanitizeTable,
} = vi.hoisted(() => ({
  mockSafeQuery: vi.fn(),
  mockSafeRun: vi.fn(),
  mockSafeTransaction: vi.fn(),
  mockSanitizeIdentifier: vi.fn((name: string) => `"${name}"`),
  mockSanitizeTable: vi.fn((table: string) => `"${table}"`),
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    safeQuery: mockSafeQuery,
    safeRun: mockSafeRun,
    safeTransaction: mockSafeTransaction,
    sanitizeIdentifier: mockSanitizeIdentifier,
    sanitizeTable: mockSanitizeTable,
  },
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
}));

import {
  deleteCharacterWithRefs,
  deleteSceneWithRefs,
} from "../transactional-delete";

describe("transactional-delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSafeTransaction.mockResolvedValue([]);
    mockSafeQuery.mockResolvedValue([]);
    mockSafeRun.mockResolvedValue(undefined);
  });

  describe("deleteCharacterWithRefs", () => {
    it("should execute transactional delete in correct cascade order", async () => {
      mockSafeQuery.mockResolvedValueOnce([
        {
          ref_image_path: "/img/ref.png",
          avatar_path: "/img/avatar.png",
          thumbnail_path: null,
          preview_path: undefined,
          generated_image: "/img/gen.png",
        },
      ]);
      mockSafeQuery.mockResolvedValueOnce([
        { image_url: "https://img.com/1.png", local_image_path: "/local/1.png" },
        { image_url: "https://img.com/2.png", local_image_path: "/local/2.png" },
      ]);
      mockSafeQuery.mockResolvedValue([]);
      mockSafeRun.mockResolvedValue(undefined);

      const result = await deleteCharacterWithRefs("char-1");

      expect(result.ok).toBe(true);
      expect(mockSafeTransaction).toHaveBeenCalledTimes(2);

      const firstTxStatements = mockSafeTransaction.mock.calls[0][0];
      expect(firstTxStatements).toEqual([
        { sql: "DELETE FROM story_characters WHERE character_id = ?", params: ["char-1"] },
        { sql: "UPDATE story_beats SET character = NULL WHERE character = ?", params: ["char-1"] },
      ]);

      const secondTxStatements = mockSafeTransaction.mock.calls[1][0];
      expect(secondTxStatements).toEqual([
        { sql: "DELETE FROM character_outfits WHERE character_id = ?", params: ["char-1"] },
        { sql: "DELETE FROM characters WHERE id = ?", params: ["char-1"] },
      ]);
    });

    it("should return error result when transaction fails", async () => {
      mockSafeQuery.mockResolvedValueOnce([]);
      mockSafeQuery.mockResolvedValueOnce([]);
      mockSafeTransaction.mockRejectedValueOnce(new Error("Transaction failed"));

      const result = await deleteCharacterWithRefs("char-1");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("Transaction failed");
      }
    });

    it("should handle character with no rows gracefully", async () => {
      mockSafeQuery.mockResolvedValueOnce([]);
      mockSafeQuery.mockResolvedValueOnce([]);
      mockSafeQuery.mockResolvedValue([]);

      const result = await deleteCharacterWithRefs("char-nonexistent");

      expect(result.ok).toBe(true);
      expect(mockSafeTransaction).toHaveBeenCalledTimes(2);
    });

    it("should handle empty outfit list", async () => {
      mockSafeQuery.mockResolvedValueOnce([
        { ref_image_path: null, avatar_path: null, thumbnail_path: null, preview_path: null, generated_image: null },
      ]);
      mockSafeQuery.mockResolvedValueOnce([]);
      mockSafeQuery.mockResolvedValue([]);

      const result = await deleteCharacterWithRefs("char-1");

      expect(result.ok).toBe(true);
    });

    it("should call removeIdFromJsonArray for story_beats and storyboard_assets", async () => {
      mockSafeQuery.mockResolvedValueOnce([]);
      mockSafeQuery.mockResolvedValueOnce([]);
      mockSafeQuery.mockResolvedValue([]);

      await deleteCharacterWithRefs("char-1");

      const queryCalls = mockSafeQuery.mock.calls;
      const jsonQueries = queryCalls.filter(
        (call: unknown[]) => typeof call[0] === "string" && call[0].includes("LIKE"),
      );
      expect(jsonQueries.length).toBeGreaterThanOrEqual(2);
    });

    it("should handle removeIdFromJsonArray updating rows", async () => {
      mockSafeQuery.mockResolvedValueOnce([]);
      mockSafeQuery.mockResolvedValueOnce([]);
      mockSafeQuery.mockResolvedValueOnce([
        { id: "beat-1", character_ids_json: JSON.stringify(["char-1", "char-2"]) },
      ]);
      mockSafeQuery.mockResolvedValueOnce([]);
      mockSafeRun.mockResolvedValue(undefined);

      await deleteCharacterWithRefs("char-1");

      const runCalls = mockSafeRun.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === "string" && call[0].includes("UPDATE"),
      );
      expect(runCalls.length).toBeGreaterThanOrEqual(1);
      const updateCall = runCalls[0];
      expect(updateCall[1][0]).toBe(JSON.stringify(["char-2"]));
    });
  });

  describe("deleteSceneWithRefs", () => {
    it("should execute transactional delete in correct cascade order", async () => {
      mockSafeQuery.mockResolvedValueOnce([
        {
          ref_image_path: "/scene/ref.png",
          generated_image: "/scene/gen.png",
        },
      ]);

      const result = await deleteSceneWithRefs("scene-1");

      expect(result.ok).toBe(true);
      expect(mockSafeTransaction).toHaveBeenCalledTimes(1);

      const statements = mockSafeTransaction.mock.calls[0][0];
      expect(statements).toEqual([
        { sql: "DELETE FROM story_scenes WHERE scene_id = ?", params: ["scene-1"] },
        { sql: "UPDATE story_beats SET scene = NULL WHERE scene = ?", params: ["scene-1"] },
        { sql: "UPDATE story_beats SET scene_id = NULL WHERE scene_id = ?", params: ["scene-1"] },
        { sql: "UPDATE storyboard_assets SET scene_id = NULL WHERE scene_id = ?", params: ["scene-1"] },
        { sql: "DELETE FROM scenes WHERE id = ?", params: ["scene-1"] },
      ]);
    });

    it("should return error result when transaction fails", async () => {
      mockSafeQuery.mockResolvedValueOnce([]);
      mockSafeTransaction.mockRejectedValueOnce(new Error("DB error"));

      const result = await deleteSceneWithRefs("scene-1");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("DB error");
      }
    });

    it("should handle scene with no rows gracefully", async () => {
      mockSafeQuery.mockResolvedValueOnce([]);

      const result = await deleteSceneWithRefs("scene-nonexistent");

      expect(result.ok).toBe(true);
      expect(mockSafeTransaction).toHaveBeenCalledTimes(1);
    });

    it("should handle scene with null image paths", async () => {
      mockSafeQuery.mockResolvedValueOnce([
        { ref_image_path: null, generated_image: undefined },
      ]);

      const result = await deleteSceneWithRefs("scene-1");

      expect(result.ok).toBe(true);
    });

    it("should delete scene-related records before deleting scene itself", async () => {
      mockSafeQuery.mockResolvedValueOnce([]);

      await deleteSceneWithRefs("scene-1");

      const statements = mockSafeTransaction.mock.calls[0][0];
      const deleteSceneIndex = statements.findIndex(
        (s: { sql: string }) => s.sql === "DELETE FROM scenes WHERE id = ?",
      );
      const updateStoryBeatsIndex = statements.findIndex(
        (s: { sql: string }) => s.sql.includes("UPDATE story_beats"),
      );
      expect(deleteSceneIndex).toBeGreaterThan(updateStoryBeatsIndex);
    });
  });
});
