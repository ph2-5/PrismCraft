import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockSafeQuery,
  mockSafeRun,
  mockSafeTransaction,
  mockParseRecord,
  mockToSqlValue,
  mockTrackChange,
  mockBuildInsert,
  mockIsElectron,
  mockWarn,
  mockError,
  mockExtractErrorMessage,
} = vi.hoisted(() => ({
  mockSafeQuery: vi.fn(),
  mockSafeRun: vi.fn(),
  mockSafeTransaction: vi.fn(),
  mockParseRecord: vi.fn((r: unknown) => r),
  mockToSqlValue: vi.fn((v: unknown) => (v === undefined ? null : v)),
  mockTrackChange: vi.fn(),
  mockBuildInsert: vi.fn(
    (table: string, _columns: string[], values: unknown[], conflict?: string) => {
      const conflictClause = conflict === "REPLACE" ? " OR REPLACE" : conflict === "IGNORE" ? " OR IGNORE" : "";
      return {
        sql: `INSERT${conflictClause} INTO ${table}`,
        params: values,
      };
    },
  ),
  mockIsElectron: vi.fn(() => true),
  mockWarn: vi.fn(),
  mockError: vi.fn(),
  mockExtractErrorMessage: vi.fn((e: unknown) =>
    e instanceof Error ? e.message : String(e),
  ),
}));

vi.mock("@/infrastructure/storage/sqlite-core", () => ({
  safeQuery: mockSafeQuery,
  safeRun: mockSafeRun,
  safeTransaction: mockSafeTransaction,
}));

vi.mock("@/infrastructure/storage/core", () => ({
  parseRecord: mockParseRecord,
  toSqlValue: mockToSqlValue,
  trackChange: mockTrackChange,
  buildInsert: mockBuildInsert,
  isElectron: mockIsElectron,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { warn: mockWarn, error: mockError },
  extractErrorMessage: mockExtractErrorMessage,
}));

let videoTaskStorage: typeof import("../video-tasks").videoTaskStorage;

beforeEach(async () => {
  vi.clearAllMocks();
  mockSafeQuery.mockResolvedValue([]);
  mockSafeRun.mockResolvedValue(undefined as any);
  mockSafeTransaction.mockResolvedValue([]);
  const mod = await import("../video-tasks");
  videoTaskStorage = mod.videoTaskStorage;
});

describe("videoTaskStorage - 存储操作业务规则", () => {
  describe("createVideoTask", () => {
    it("UNIQUE 冲突时使用 IGNORE 策略跳过已存在任务", async () => {
      mockSafeRun.mockResolvedValue(undefined as any);

      await videoTaskStorage.createVideoTask({
        taskId: "task1",
        status: "pending",
      });

      expect(mockSafeRun).toHaveBeenCalledTimes(1);
      const callSql = mockSafeRun.mock.calls[0][0] as string;
      expect(callSql).toContain("IGNORE");
    });

    it("非 UNIQUE 错误应直接抛出", async () => {
      mockSafeRun.mockRejectedValue(new Error("database is locked"));

      await expect(
        videoTaskStorage.createVideoTask({ taskId: "task1", status: "pending" }),
      ).rejects.toThrow("database is locked");
    });
  });

  describe("updateVideoTask", () => {
    it("毫秒时间戳自动转换为秒", async () => {
      mockSafeRun.mockResolvedValue({ changes: 1 });

      await videoTaskStorage.updateVideoTask("task1", {
        expiresAt: 1700000000000 as any,
      });

      const params = mockSafeRun.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe(Math.floor(1700000000000 / 1000));
    });

    it("秒时间戳不转换", async () => {
      mockSafeRun.mockResolvedValue({ changes: 1 });

      await videoTaskStorage.updateVideoTask("task1", {
        expiresAt: 1700000000 as any,
      });

      const params = mockSafeRun.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe(1700000000);
    });

    it("更新不存在的任务应抛错", async () => {
      mockSafeRun.mockResolvedValue(undefined);
      mockSafeQuery.mockResolvedValue([]);

      await expect(
        videoTaskStorage.updateVideoTask("nonexistent", { status: "completed" }),
      ).rejects.toThrow("not found");
    });
  });

  describe("bulkPutVideoTasks", () => {
    it("非 Electron 路径使用 Promise.allSettled", async () => {
      mockIsElectron.mockReturnValue(false);
      mockSafeQuery.mockResolvedValue([]);
      mockSafeRun.mockResolvedValue(undefined as any);

      await videoTaskStorage.bulkPutVideoTasks([
        { taskId: "t1", status: "pending" },
      ]);

      expect(mockBuildInsert).toHaveBeenCalled();
    });

    it("Electron 路径使用批量 SQL", async () => {
      mockIsElectron.mockReturnValue(true);
      mockSafeQuery.mockResolvedValue([]);

      await videoTaskStorage.bulkPutVideoTasks([
        { taskId: "t1", status: "pending" },
      ]);

      expect(mockSafeTransaction).toHaveBeenCalled();
      const callArgs = mockSafeTransaction.mock.calls[0][0] as {
        sql: string;
        params: unknown[];
      }[];
      expect(callArgs.some((s) => s.sql.includes("INSERT"))).toBe(true);
    });
  });

  describe("deleteVideoTasksByStatus", () => {
    it("先查再删，含 video_cache 级联", async () => {
      mockSafeQuery.mockResolvedValue([
        { id: "t1" },
        { id: "t2" },
      ]);

      await videoTaskStorage.deleteVideoTasksByStatus(["completed"]);

      expect(mockSafeTransaction).toHaveBeenCalled();
      const statements = mockSafeTransaction.mock.calls[0][0] as {
        sql: string;
        params: unknown[];
      }[];
      expect(statements.length).toBe(2);
      expect(statements[0].sql).toContain("DELETE FROM video_cache");
      expect(statements[1].sql).toContain("DELETE FROM video_tasks");
    });

    it("无匹配时直接返回", async () => {
      mockSafeQuery.mockResolvedValue([]);

      await videoTaskStorage.deleteVideoTasksByStatus(["completed"]);

      expect(mockSafeTransaction).not.toHaveBeenCalled();
    });
  });

  describe("deleteExpiredVideoTasks", () => {
    it("返回删除数量", async () => {
      mockSafeQuery.mockResolvedValue([
        { id: "t1" },
        { id: "t2" },
        { id: "t3" },
      ]);

      const result = await videoTaskStorage.deleteExpiredVideoTasks();

      expect(result).toBe(3);
      expect(mockSafeTransaction).toHaveBeenCalled();
    });
  });

  describe("deleteVideoTask", () => {
    it("删除任务+级联删除 video_cache", async () => {
      await videoTaskStorage.deleteVideoTask("task1");

      expect(mockSafeTransaction).toHaveBeenCalled();
      const statements = mockSafeTransaction.mock.calls[0][0] as {
        sql: string;
        params: unknown[];
      }[];
      expect(statements.length).toBe(2);
      expect(statements[0].sql).toContain("DELETE FROM video_tasks");
      expect(statements[1].sql).toContain("DELETE FROM video_cache");
    });
  });
});
