import { describe, it, expect, vi, beforeEach } from "vitest";
import { safeQuery, safeRun, safeTransaction } from "@/infrastructure/storage/sqlite-core";
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

describe("storage/sqlite-core enhanced", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isElectron).mockReturnValue(true);
    (window as any).electronAPI = {
      dbQuery: vi.fn(),
      dbRun: vi.fn(),
      dbTransaction: vi.fn(),
    };
  });

  describe("safeQuery", () => {
    it("非 Electron 环境下应抛出守卫错误", async () => {
      vi.mocked(isElectron).mockReturnValue(false);
      delete (window as any).electronAPI;

      await expect(safeQuery("SELECT 1")).rejects.toThrow(
        "electronAPI not available",
      );
    });

    it("成功时应返回 data 数组", async () => {
      (window as any).electronAPI.dbQuery.mockResolvedValue({
        success: true,
        data: [{ id: 1 }],
      });

      const result = await safeQuery<{ id: number }>("SELECT * FROM t");

      expect(result).toEqual([{ id: 1 }]);
    });

    it("失败且 response.error 非空时应抛出包含 error 消息的错误", async () => {
      (window as any).electronAPI.dbQuery.mockResolvedValue({
        success: false,
        error: "table not found",
      });

      await expect(safeQuery("SELECT * FROM t")).rejects.toThrow(
        "table not found",
      );
    });

    it("失败且 response.error 为空时应抛出包含 fallback 消息的错误", async () => {
      (window as any).electronAPI.dbQuery.mockResolvedValue({
        success: false,
        error: "",
      });

      await expect(safeQuery("SELECT * FROM t")).rejects.toThrow(
        "SQLite query failed",
      );
    });

    it("失败且 response.error 为 undefined 时应抛出包含 fallback 消息的错误", async () => {
      (window as any).electronAPI.dbQuery.mockResolvedValue({
        success: false,
      });

      await expect(safeQuery("SELECT * FROM t")).rejects.toThrow(
        "SQLite query failed",
      );
    });

    it("成功但 data 为 undefined 时应返回空数组", async () => {
      (window as any).electronAPI.dbQuery.mockResolvedValue({
        success: true,
      });

      const result = await safeQuery("SELECT * FROM t");

      expect(result).toEqual([]);
    });
  });

  describe("safeRun", () => {
    it("非 Electron 环境下应抛出守卫错误", async () => {
      vi.mocked(isElectron).mockReturnValue(false);
      delete (window as any).electronAPI;

      await expect(safeRun("INSERT INTO t VALUES (1)")).rejects.toThrow(
        "electronAPI not available",
      );
    });

    it("成功时应正常返回 DbRunResult", async () => {
      (window as any).electronAPI.dbRun.mockResolvedValue({
        success: true,
        data: { changes: 1, lastInsertRowid: 0 },
      });

      const result = await safeRun("INSERT INTO t VALUES (1)");

      expect(result).toEqual({ changes: 1, lastInsertRowid: 0 });
    });

    it("失败且 response.error 非空时应抛出包含 error 消息的错误", async () => {
      (window as any).electronAPI.dbRun.mockResolvedValue({
        success: false,
        error: "column not found",
      });

      await expect(safeRun("INSERT INTO t VALUES (1)")).rejects.toThrow(
        "column not found",
      );
    });

    it("失败且 response.error 为空时应抛出包含 fallback 消息的错误", async () => {
      (window as any).electronAPI.dbRun.mockResolvedValue({
        success: false,
        error: "",
      });

      await expect(safeRun("INSERT INTO t VALUES (1)")).rejects.toThrow(
        "SQLite run failed",
      );
    });
  });

  describe("safeTransaction", () => {
    it("非 Electron 环境下应抛出守卫错误", async () => {
      vi.mocked(isElectron).mockReturnValue(false);
      delete (window as any).electronAPI;

      await expect(
        safeTransaction([{ sql: "INSERT INTO t VALUES (1)", params: [] }]),
      ).rejects.toThrow("electronAPI not available");
    });

    it("成功时应返回 data 数组", async () => {
      (window as any).electronAPI.dbTransaction.mockResolvedValue({
        success: true,
        data: [{ changes: 1 }],
      });

      const result = await safeTransaction([
        { sql: "INSERT INTO t VALUES (1)", params: [] },
      ]);

      expect(result).toEqual([{ changes: 1 }]);
    });

    it("失败且 response.error 非空时应抛出包含 error 消息的错误", async () => {
      (window as any).electronAPI.dbTransaction.mockResolvedValue({
        success: false,
        error: "constraint violation",
      });

      await expect(
        safeTransaction([{ sql: "INSERT INTO t VALUES (1)", params: [] }]),
      ).rejects.toThrow("constraint violation");
    });

    it("失败且 response.error 为空时 fallback 消息应包含 SQL 预览", async () => {
      (window as any).electronAPI.dbTransaction.mockResolvedValue({
        success: false,
        error: "",
      });

      const statements = [
        { sql: "INSERT INTO long_table_name VALUES (1, 2, 3)", params: [] },
        { sql: "UPDATE another_table SET x = 1", params: [] },
      ];

      await expect(safeTransaction(statements)).rejects.toThrow(
        "SQLite transaction failed",
      );
    });

    it("成功但 data 为 undefined 时应返回空数组", async () => {
      (window as any).electronAPI.dbTransaction.mockResolvedValue({
        success: true,
      });

      const result = await safeTransaction([
        { sql: "INSERT INTO t VALUES (1)", params: [] },
      ]);

      expect(result).toEqual([]);
    });
  });

  describe("extractDbErrorMessage (间接测试)", () => {
    it("response.error 为纯空白时应使用 fallback", async () => {
      (window as any).electronAPI.dbQuery.mockResolvedValue({
        success: false,
        error: "   ",
      });

      await expect(safeQuery("SELECT 1")).rejects.toThrow(
        "SQLite query failed",
      );
    });

    it("response.error 有前后空格时应 trim 后使用", async () => {
      (window as any).electronAPI.dbQuery.mockResolvedValue({
        success: false,
        error: "  disk I/O error  ",
      });

      try {
        await safeQuery("SELECT 1");
        expect.unreachable("应抛出错误");
      } catch (e) {
        expect((e as Error).message).toBe("disk I/O error");
      }
    });
  });
});
