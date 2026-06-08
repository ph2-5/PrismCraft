import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/infrastructure/storage/sqlite-core", () => ({
  safeQuery: vi.fn(),
  safeRun: vi.fn(),
  safeTransaction: vi.fn(),
}));

import { safeQuery, safeRun } from "@/infrastructure/storage/sqlite-core";
import { autoSaveStorage } from "../auto-save";

const mockSafeQuery = vi.mocked(safeQuery);
const mockSafeRun = vi.mocked(safeRun);

describe("R42: Auto-Save Optimistic Locking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should use ON CONFLICT with timestamp guard instead of INSERT OR REPLACE", async () => {
    mockSafeRun.mockResolvedValue({ changes: 1, lastInsertRowid: 1 });

    await autoSaveStorage.createAutoSave({
      id: "test-id",
      type: "story",
      data: { title: "test" },
      timestamp: 1000,
    });

    const sql = mockSafeRun.mock.calls[0]![0]! as string;
    expect(sql).toContain("ON CONFLICT(id) DO UPDATE");
    expect(sql).toContain("WHERE timestamp < excluded.timestamp");
    expect(sql).not.toContain("INSERT OR REPLACE");
  });

  it("should not overwrite when existing timestamp is newer", async () => {
    mockSafeRun.mockResolvedValue({ changes: 0, lastInsertRowid: 0 });
    mockSafeQuery.mockResolvedValue([{ timestamp: 2000 }]);

    await autoSaveStorage.createAutoSave({
      id: "test-id",
      type: "story",
      data: { title: "old data" },
      timestamp: 1000,
    });

    expect(mockSafeQuery).toHaveBeenCalledWith(
      expect.stringContaining("SELECT timestamp FROM auto_saves WHERE id = ?"),
      ["test-id"],
    );
  });

  it("should allow overwrite when new timestamp is newer", async () => {
    mockSafeRun.mockResolvedValue({ changes: 1, lastInsertRowid: 1 });

    await autoSaveStorage.createAutoSave({
      id: "test-id",
      type: "story",
      data: { title: "new data" },
      timestamp: 2000,
    });

    expect(mockSafeRun).toHaveBeenCalled();
    const sql = mockSafeRun.mock.calls[0]![0]! as string;
    expect(sql).toContain("ON CONFLICT(id) DO UPDATE");
    expect(sql).toContain("WHERE timestamp < excluded.timestamp");
  });

  it("should not perform secondary query when safeRun reports changes > 0", async () => {
    mockSafeRun.mockResolvedValue({ changes: 1, lastInsertRowid: 1 });

    await autoSaveStorage.createAutoSave({
      id: "test-id",
      type: "story",
      data: { title: "test" },
      timestamp: 1000,
    });

    expect(mockSafeQuery).not.toHaveBeenCalled();
  });
});
