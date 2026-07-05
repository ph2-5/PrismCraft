import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isElectron } from "@/shared/utils/platform";

vi.mock("@/shared/utils/platform", () => ({
  isElectron: vi.fn(),
}));

vi.mock("@/infrastructure/monitoring", () => ({
  performanceMonitor: {
    measure: vi.fn((_label: string, _key: string, fn: () => unknown) => fn()),
  },
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  extractErrorMessage: vi.fn((e: unknown) =>
    e instanceof Error ? e.message : String(e),
  ),
}));

describe("R61: Mock IPC return format must match production contract", () => {
  const mockElectronAPI = {
    dbQuery: vi.fn(),
    dbRun: vi.fn(),
    dbTransaction: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock fetch 让 HTTP API 探测失败，使代码走 IPC fallback 路径
    // 必须在 beforeEach 内 stub，因为 setup.ts 的 afterEach 会调用 vi.unstubAllGlobals()
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("HTTP server not available in test")));
    vi.mocked(isElectron).mockReturnValue(true);
    (window as unknown as Record<string, unknown>).electronAPI = mockElectronAPI;
    // 重置模块缓存，确保 _httpAvailable 被重置为 null
    vi.resetModules();
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).electronAPI;
  });

  describe("dbQuery return format", () => {
    it("safeQuery rejects when dbQuery returns raw array (missing success field)", async () => {
      const { safeQuery } = await import("@/infrastructure/storage/sqlite-core");
      mockElectronAPI.dbQuery.mockResolvedValue([{ id: 1 }]);

      await expect(safeQuery("SELECT * FROM t")).rejects.toThrow();
    });

    it("safeQuery works when dbQuery returns { success: true, data: T[] }", async () => {
      const { safeQuery } = await import("@/infrastructure/storage/sqlite-core");
      mockElectronAPI.dbQuery.mockResolvedValue({
        success: true,
        data: [{ id: 1 }],
      });

      const result = await safeQuery<{ id: number }>("SELECT * FROM t");
      expect(result).toEqual([{ id: 1 }]);
    });

    it("safeQuery works when dbQuery returns { success: true, data: [] }", async () => {
      const { safeQuery } = await import("@/infrastructure/storage/sqlite-core");
      mockElectronAPI.dbQuery.mockResolvedValue({
        success: true,
        data: [],
      });

      const result = await safeQuery("SELECT * FROM t");
      expect(result).toEqual([]);
    });
  });

  describe("dbRun return format", () => {
    it("safeRun rejects when dbRun returns { success: true } without data field", async () => {
      const { safeRun } = await import("@/infrastructure/storage/sqlite-core");
      mockElectronAPI.dbRun.mockResolvedValue({ success: true });

      const result = await safeRun("INSERT INTO t VALUES (1)");
      expect(result.changes).toBeUndefined();
    });

    it("safeRun works when dbRun returns { success: true, data: { changes, lastInsertRowid } }", async () => {
      const { safeRun } = await import("@/infrastructure/storage/sqlite-core");
      mockElectronAPI.dbRun.mockResolvedValue({
        success: true,
        data: { changes: 1, lastInsertRowid: 42 },
      });

      const result = await safeRun("INSERT INTO t VALUES (1)");
      expect(result).toEqual({ changes: 1, lastInsertRowid: 42 });
    });
  });

  describe("dbTransaction return format", () => {
    it("safeTransaction works when dbTransaction returns { success: true, data: [] }", async () => {
      const { safeTransaction } = await import("@/infrastructure/storage/sqlite-core");
      mockElectronAPI.dbTransaction.mockResolvedValue({
        success: true,
        data: [],
      });

      const result = await safeTransaction([
        { sql: "INSERT INTO t VALUES (1)", params: [] },
      ]);
      expect(result).toEqual([]);
    });

    it("safeTransaction works when dbTransaction returns { success: true, data: [{ changes: 1 }] }", async () => {
      const { safeTransaction } = await import("@/infrastructure/storage/sqlite-core");
      mockElectronAPI.dbTransaction.mockResolvedValue({
        success: true,
        data: [{ changes: 1 }],
      });

      const result = await safeTransaction([
        { sql: "INSERT INTO t VALUES (1)", params: [] },
      ]);
      expect(result).toEqual([{ changes: 1 }]);
    });
  });
});
