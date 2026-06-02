import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockSafeQuery,
  mockSafeRun,
  mockSafeTransaction,
  mockSanitizeIdentifier,
  mockSanitizeTable,
} = vi.hoisted(() => ({
  mockSafeQuery: vi.fn<(sql: string, params?: unknown[]) => Promise<unknown[]>>(),
  mockSafeRun: vi.fn<(sql: string, params?: unknown[]) => Promise<unknown>>(),
  mockSafeTransaction: vi.fn<(statements: { sql: string; params: unknown[] }[]) => Promise<unknown[]>>(),
  mockSanitizeIdentifier: vi.fn<(name: string) => string>((name) => `"${name}"`),
  mockSanitizeTable: vi.fn<(table: string) => string>((table) => `"${table}"`),
}));

vi.mock("@/shared/db-core", () => ({
  safeQuery: mockSafeQuery,
  safeRun: mockSafeRun,
  safeTransaction: mockSafeTransaction,
}));

vi.mock("@/shared/sql-safety", () => ({
  sanitizeIdentifier: mockSanitizeIdentifier,
  sanitizeTable: mockSanitizeTable,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
  extractErrorMessage: vi.fn((e: unknown) => e instanceof Error ? e.message : String(e)),
}));

vi.mock("@/shared/utils/safe-json", () => ({
  safeJsonParseArray: vi.fn((raw: unknown) => {
    if (!raw) return [];
    try { return JSON.parse(raw as string); }
    catch { return []; }
  }),
}));

import { deleteCharacterWithRefs } from "../transactional-delete";

describe("R30: Cascade delete operations must be atomic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSafeTransaction.mockResolvedValue([]);
    mockSafeQuery.mockResolvedValue([]);
    mockSafeRun.mockResolvedValue(undefined);
  });

  it("should execute all cascade deletes in a single transaction", async () => {
    mockSafeQuery.mockResolvedValueOnce([
      { ref_image_path: "/img.png", avatar_path: null, thumbnail_path: null, preview_path: null, generated_image: null },
    ]);
    mockSafeQuery.mockResolvedValueOnce([]);

    const result = await deleteCharacterWithRefs("char-1");

    expect(result.ok).toBe(true);
    expect(mockSafeTransaction).toHaveBeenCalledTimes(1);

    const statements = mockSafeTransaction.mock.calls[0][0];
    const sqls = statements.map((s: { sql: string }) => s.sql);

    expect(sqls).toContain("DELETE FROM story_characters WHERE character_id = ?");
    expect(sqls).toContain("UPDATE story_beats SET character = NULL WHERE character = ?");
    expect(sqls).toContain("DELETE FROM character_outfits WHERE character_id = ?");
    expect(sqls).toContain("DELETE FROM characters WHERE id = ?");

    const deleteCharIndex = sqls.indexOf("DELETE FROM characters WHERE id = ?");
    const deleteRefIndex = sqls.indexOf("DELETE FROM story_characters WHERE character_id = ?");
    expect(deleteCharIndex).toBeGreaterThan(deleteRefIndex);
  });

  it("should rollback all changes if any statement in the transaction fails", async () => {
    mockSafeQuery.mockResolvedValueOnce([]);
    mockSafeQuery.mockResolvedValueOnce([]);
    mockSafeTransaction.mockRejectedValueOnce(new Error("Transaction failed"));

    const result = await deleteCharacterWithRefs("char-1");

    expect(result.ok).toBe(false);
    expect(mockSafeTransaction).toHaveBeenCalledTimes(1);
  });
});
