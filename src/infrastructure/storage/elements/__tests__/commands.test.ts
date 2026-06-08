import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSafeQuery, mockSafeRun, mockSafeTransaction, mockToSqlValue, mockTrackChange, mockGetElement } = vi.hoisted(() => ({
  mockSafeQuery: vi.fn(),
  mockSafeRun: vi.fn(),
  mockSafeTransaction: vi.fn(),
  mockToSqlValue: vi.fn((v: unknown) => (v === undefined ? null : v)),
  mockTrackChange: vi.fn(),
  mockGetElement: vi.fn(),
}));

vi.mock("@/infrastructure/storage/sqlite-core", () => ({
  safeQuery: mockSafeQuery,
  safeRun: mockSafeRun,
  safeTransaction: mockSafeTransaction,
}));

vi.mock("@/infrastructure/storage/core", () => ({
  toSqlValue: mockToSqlValue,
  trackChange: mockTrackChange,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/infrastructure/storage/elements/queries", () => ({
  getElement: mockGetElement,
}));

import { createElement, updateElement, deleteElement } from "../commands";

describe("elements/commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSafeQuery.mockResolvedValue([]);
    mockSafeRun.mockResolvedValue({ changes: 1 });
    mockSafeTransaction.mockResolvedValue([]);
    mockGetElement.mockResolvedValue(undefined);
  });

  describe("createElement", () => {
    it("creates element with default description", async () => {
      const result = await createElement("character", "角色A");

      expect(result.type).toBe("character");
      expect(result.name).toBe("角色A");
      expect(result.description).toBe("");
      expect(result.id).toMatch(/^CHAR_/);
      expect(mockSafeRun).toHaveBeenCalledWith(
        expect.stringContaining("INSERT OR IGNORE INTO elements"),
        expect.arrayContaining(["character", "角色A", null, "[]", 1]),
      );
    });

    it("creates element with explicit description", async () => {
      const result = await createElement("prop", "道具A", "描述文本");

      expect(result.type).toBe("prop");
      expect(result.name).toBe("道具A");
      expect(result.description).toBe("描述文本");
      expect(result.id).toMatch(/^PROP_/);
    });

    it("creates effect element with correct prefix", async () => {
      const result = await createElement("effect", "特效A");

      expect(result.id).toMatch(/^EFFECT_/);
    });

    it("handles trackChange failure gracefully", async () => {
      mockTrackChange.mockRejectedValue(new Error("sync error"));

      const result = await createElement("character", "角色A");

      expect(result).toBeDefined();
      expect(result.name).toBe("角色A");
    });
  });

  describe("updateElement", () => {
    const existingElement = {
      id: "CHAR_001",
      type: "character" as const,
      name: "角色A",
      description: "描述",
      bindings: [],
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    };

    it("throws when element not found", async () => {
      mockGetElement.mockResolvedValue(undefined);

      await expect(updateElement("CHAR_999", { name: "新名称" })).rejects.toThrow(/not found/i);
    });

    it("updates element successfully", async () => {
      mockGetElement.mockResolvedValue(existingElement);
      mockSafeRun.mockResolvedValue({ changes: 1 });

      const result = await updateElement("CHAR_001", { name: "新名称" });

      expect(result.name).toBe("新名称");
      expect(result.id).toBe("CHAR_001");
    });

    it("updates element with empty description sets null", async () => {
      mockGetElement.mockResolvedValue({ ...existingElement, description: "旧描述" });
      mockSafeRun.mockResolvedValue({ changes: 1 });

      const result = await updateElement("CHAR_001", { description: "" });

      expect(result.description).toBe("");
      expect(mockSafeRun).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([null]),
      );
    });

    it("does not throw when changes=0 but element exists", async () => {
      mockGetElement.mockResolvedValue(existingElement);
      mockSafeRun.mockResolvedValue({ changes: 0 });
      mockSafeQuery.mockResolvedValue([{ id: "CHAR_001" }]);

      const result = await updateElement("CHAR_001", { name: "新名称" });

      expect(result).toBeDefined();
      expect(result.name).toBe("新名称");
    });

    it("throws when changes=0 and element no longer exists", async () => {
      mockGetElement.mockResolvedValue(existingElement);
      mockSafeRun.mockResolvedValue({ changes: 0 });
      mockSafeQuery.mockResolvedValue([]);

      await expect(updateElement("CHAR_001", { name: "新名称" })).rejects.toThrow(/not found/i);
    });

    it("handles trackChange failure gracefully", async () => {
      mockGetElement.mockResolvedValue(existingElement);
      mockSafeRun.mockResolvedValue({ changes: 1 });
      mockTrackChange.mockRejectedValue(new Error("sync error"));

      const result = await updateElement("CHAR_001", { name: "新名称" });

      expect(result).toBeDefined();
    });
  });

  describe("deleteElement", () => {
    it("deletes element with cascade", async () => {
      await deleteElement("CHAR_001");

      expect(mockSafeTransaction).toHaveBeenCalledTimes(1);
      const statements = mockSafeTransaction.mock.calls[0]![0]! as Array<{
        sql: string;
        params: unknown[];
      }>;
      expect(statements).toHaveLength(2);
      expect(statements[0]!.sql).toContain("story_elements");
      expect(statements[1]!.sql).toContain("elements");
    });

    it("handles trackChange failure gracefully", async () => {
      mockTrackChange.mockRejectedValue(new Error("sync error"));

      await expect(deleteElement("CHAR_001")).resolves.toBeUndefined();
    });
  });
});
