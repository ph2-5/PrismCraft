import { describe, it, expect, vi, beforeEach } from "vitest";
import type { VideoTask } from "@/domain/schemas";

const {
  mockSafeQuery,
  mockSafeRun,
  mockSafeTransaction,
  mockTrackChange,
  mockBuildInsert,
  mockBuildUpdateSets,
} = vi.hoisted(() => ({
  mockSafeQuery: vi.fn<(sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>>(() => Promise.resolve([])),
  mockSafeRun: vi.fn<(sql: string, params?: unknown[]) => Promise<{ changes: number }>>(() => Promise.resolve({ changes: 1 })),
  mockSafeTransaction: vi.fn<(statements: { sql: string; params: unknown[] }[]) => Promise<unknown[]>>(() => Promise.resolve([])),
  mockTrackChange: vi.fn(() => Promise.resolve()),
  mockBuildInsert: vi.fn((table: string, _columns: string[], values: unknown[], _conflict?: string) => ({
    sql: `INSERT OR REPLACE INTO ${table}`,
    params: values,
  })),
  mockBuildUpdateSets: vi.fn(() => ({ sql: "status = ?", params: ["failed"] })),
}));

vi.mock("@/infrastructure/storage/sqlite-core", () => ({
  safeQuery: mockSafeQuery,
  safeRun: mockSafeRun,
  safeTransaction: mockSafeTransaction,
}));

vi.mock("@/infrastructure/storage/core", () => ({
  trackChange: mockTrackChange,
  buildInsert: mockBuildInsert,
}));

vi.mock("@/infrastructure/storage/video-tasks/parser", () => ({
  toStorageTimestamp: (v: unknown) => (v ? Math.floor(Date.now() / 1000) : null),
  toStorageStatus: (v: unknown) => v || "pending",
  buildConfigJson: () => null,
  buildProviderJson: () => null,
  buildMediaRefsJson: () => null,
  buildTrackingJson: () => null,
  buildUpdateSets: mockBuildUpdateSets,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/domain/schemas", () => ({}));

import { videoTaskStorage } from "@/infrastructure/storage/video-tasks";

describe("R39: 批量 DB 操作禁止退化为逐条 IPC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("batchUpdateVideoTasks", () => {
    it("必须使用单次 safeTransaction 批量更新，而非逐条 safeRun", async () => {
      const updates = [
        { taskId: "task-1", updates: { status: "failed" } },
        { taskId: "task-2", updates: { status: "failed" } },
        { taskId: "task-3", updates: { status: "failed" } },
      ];

      await videoTaskStorage.batchUpdateVideoTasks(updates as Array<{ taskId: string; updates: Partial<VideoTask> }>);

      const updateTransactionCalls = mockSafeTransaction.mock.calls.filter(
        (c) => c[0]?.some?.((s) => s.sql?.includes("UPDATE video_tasks SET")),
      );
      expect(updateTransactionCalls.length).toBe(1);
      expect(updateTransactionCalls[0]![0].length).toBe(3);
    });

    it("空数组不应触发任何 IPC 调用", async () => {
      await videoTaskStorage.batchUpdateVideoTasks([]);

      expect(mockSafeTransaction).not.toHaveBeenCalled();
      expect(mockSafeRun).not.toHaveBeenCalled();
      expect(mockSafeQuery).not.toHaveBeenCalled();
    });
  });

  describe("batchDeleteVideoTasks", () => {
    it("必须使用单次 safeTransaction 批量删除，而非逐条 deleteVideoTask", async () => {
      const ids = ["task-1", "task-2", "task-3"];

      await videoTaskStorage.batchDeleteVideoTasks(ids);

      expect(mockSafeTransaction).toHaveBeenCalledTimes(1);
      const callArgs = mockSafeTransaction.mock.calls[0]![0];
      expect(callArgs.length).toBe(2);
      expect(callArgs[0].sql).toContain("IN (?,?,?)");
      expect(callArgs[1].sql).toContain("IN (?,?,?)");
    });

    it("空数组不应触发任何 IPC 调用", async () => {
      await videoTaskStorage.batchDeleteVideoTasks([]);

      expect(mockSafeTransaction).not.toHaveBeenCalled();
      expect(mockSafeRun).not.toHaveBeenCalled();
    });
  });

  describe("bulkPutVideoTasks", () => {
    it("必须使用单次 SELECT WHERE IN 批量查询存在性，而非逐条 safeQuery", async () => {
      mockSafeQuery.mockResolvedValueOnce([{ id: "task-1" }]);

      const tasks = [
        { taskId: "task-1", status: "completed" },
        { taskId: "task-2", status: "pending" },
      ];

      const { bulkPutVideoTasks } = await import("@/infrastructure/storage/video-tasks/bulk-operations");
      await bulkPutVideoTasks(tasks as Partial<VideoTask>[]);

      const queryCalls = mockSafeQuery.mock.calls.filter(
        (c) => c[0]?.includes("SELECT id FROM video_tasks WHERE id IN"),
      );
      expect(queryCalls.length).toBe(1);
      expect(queryCalls[0]![0]).toContain("IN (?,?)");
    });
  });

  describe("deleteVideoTasksByBeatId", () => {
    it("删除多个任务时必须使用批量 safeTransaction，而非逐条删除", async () => {
      mockSafeQuery.mockResolvedValueOnce([
        { id: "task-1" },
        { id: "task-2" },
        { id: "task-3" },
      ]);

      await videoTaskStorage.deleteVideoTasksByBeatId("beat-1");

      const transactionCalls = mockSafeTransaction.mock.calls.filter(
        (c) => !c[0]?.some?.((s) => s.sql?.includes("sync_changelog")),
      );
      expect(transactionCalls.length).toBe(1);
      const stmts = transactionCalls[0]![0];
      expect(stmts.some((s) => s.sql.includes("IN (?,?,?)"))).toBe(true);
    });
  });

  describe("deleteVideoTasksByStatus", () => {
    it("删除多个状态的任务时必须使用批量 safeTransaction", async () => {
      mockSafeQuery.mockResolvedValueOnce([
        { id: "task-1" },
        { id: "task-2" },
      ]);

      await videoTaskStorage.deleteVideoTasksByStatus(["completed", "failed"]);

      const transactionCalls = mockSafeTransaction.mock.calls.filter(
        (c) => !c[0]?.some?.((s) => s.sql?.includes("sync_changelog")),
      );
      expect(transactionCalls.length).toBe(1);
    });
  });
});
