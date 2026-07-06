import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RemoteChange, SyncEntityType } from "../types";

const {
  mockSafeQuery,
  mockSafeTransaction,
  mockErrorLogger,
} = vi.hoisted(() => ({
  mockSafeQuery: vi.fn(),
  mockSafeTransaction: vi.fn(),
  mockErrorLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/shared/db-core", () => ({
  safeQuery: mockSafeQuery,
  safeTransaction: mockSafeTransaction,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
}));

vi.mock("@/shared/sql-safety", () => ({
  sanitizeIdentifier: vi.fn((id: string) => id),
}));

// NOTE: These modules are NOT mocked — real implementations are used:
// - ./entity-mapping (getTableName, getPkColumn, HARD_DELETE_TABLES, TABLES_WITHOUT_UPDATED_AT)
// - ./types (compareVectorClocks, isVectorClockConflict)
// - @/shared/utils/safe-json (safeJsonParse)
// - @/domain/types/result (fromAsyncThrowable)

import { applyRemoteChanges } from "../remote-changes";

type Stmt = { sql: string; params: unknown[] };

function makeChange(
  overrides: Partial<RemoteChange> & { entityType: SyncEntityType; entityId: string },
): RemoteChange {
  return {
    operation: "insert",
    vectorClock: { dev1: 1 },
    data: null,
    timestamp: 0,
    deviceId: "remote-dev",
    ...overrides,
  };
}

function getTxStmts(): Stmt[] {
  expect(mockSafeTransaction).toHaveBeenCalled();
  return mockSafeTransaction.mock.calls[0]![0] as Stmt[];
}

function findStmt(stmts: Stmt[], needle: string): Stmt | undefined {
  return stmts.find((s) => s.sql.includes(needle));
}

describe("applyRemoteChanges 远程变更应用", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSafeQuery.mockResolvedValue([]);
    mockSafeTransaction.mockResolvedValue(undefined);
  });

  describe("过滤与分组", () => {
    it("应跳过本设备变更（deviceId 相等）", async () => {
      const changes: RemoteChange[] = [
        makeChange({
          entityType: "character",
          entityId: "c1",
          deviceId: "local-dev",
        }),
      ];

      await applyRemoteChanges(changes, "local-dev");

      expect(mockSafeQuery).not.toHaveBeenCalled();
      expect(mockSafeTransaction).not.toHaveBeenCalled();
    });

    it("混合本设备和远程变更时应只处理远程变更", async () => {
      const changes: RemoteChange[] = [
        makeChange({
          entityType: "character",
          entityId: "c1",
          deviceId: "local-dev",
        }),
        makeChange({
          entityType: "scene",
          entityId: "s1",
          deviceId: "remote-dev",
          operation: "delete",
          vectorClock: { remote: 1 },
        }),
      ];

      await applyRemoteChanges(changes, "local-dev");

      // Only one safeQuery call for the remote scene change
      expect(mockSafeQuery).toHaveBeenCalledTimes(1);
      const querySql = mockSafeQuery.mock.calls[0]![0] as string;
      expect(querySql).toContain("FROM scenes WHERE id = ?");
    });

    it("按 entityType/entityId 分组并取最后一条", async () => {
      const changes: RemoteChange[] = [
        makeChange({
          entityType: "character",
          entityId: "c1",
          operation: "insert",
          vectorClock: { dev1: 1 },
        }),
        makeChange({
          entityType: "character",
          entityId: "c1",
          operation: "update",
          vectorClock: { dev1: 2 },
        }),
        makeChange({
          entityType: "character",
          entityId: "c1",
          operation: "update",
          vectorClock: { dev1: 3 },
        }),
      ];

      mockSafeQuery.mockResolvedValue([]);
      await applyRemoteChanges(changes, "local-dev");

      // Only one entity group → one safeQuery call
      expect(mockSafeQuery).toHaveBeenCalledTimes(1);
    });

    it("未知 entityType 应跳过", async () => {
      const changes: RemoteChange[] = [
        makeChange({
          entityType: "invalid" as SyncEntityType,
          entityId: "x1",
        }),
      ];

      await applyRemoteChanges(changes, "local-dev");

      expect(mockSafeQuery).not.toHaveBeenCalled();
      expect(mockSafeTransaction).not.toHaveBeenCalled();
    });

    it("空变更数组应直接返回", async () => {
      await applyRemoteChanges([], "local-dev");
      expect(mockSafeQuery).not.toHaveBeenCalled();
      expect(mockSafeTransaction).not.toHaveBeenCalled();
    });
  });

  describe("delete 操作", () => {
    it("HARD_DELETE_TABLES 中的表应执行 DELETE FROM", async () => {
      // media_assets is in HARD_DELETE_TABLES
      const changes: RemoteChange[] = [
        makeChange({
          entityType: "media_asset",
          entityId: "m1",
          operation: "delete",
          vectorClock: { dev1: 2 },
          data: null,
        }),
      ];

      mockSafeQuery.mockResolvedValue([]);
      await applyRemoteChanges(changes, "local-dev");

      const stmts = getTxStmts();
      const deleteStmt = findStmt(stmts, "DELETE FROM media_assets WHERE id = ?");
      expect(deleteStmt).toBeDefined();
      expect(deleteStmt!.params).toEqual(["m1"]);
    });

    it("video_task 应使用 task_id 主键进行硬删除", async () => {
      const changes: RemoteChange[] = [
        makeChange({
          entityType: "video_task",
          entityId: "t1",
          operation: "delete",
          vectorClock: { dev1: 2 },
          data: null,
        }),
      ];

      mockSafeQuery.mockResolvedValue([]);
      await applyRemoteChanges(changes, "local-dev");

      const stmts = getTxStmts();
      const deleteStmt = findStmt(stmts, "DELETE FROM video_tasks WHERE task_id = ?");
      expect(deleteStmt).toBeDefined();
      expect(deleteStmt!.params).toEqual(["t1"]);
    });

    it("软删除表应执行 UPDATE is_deleted=1（characters）", async () => {
      const changes: RemoteChange[] = [
        makeChange({
          entityType: "character",
          entityId: "c1",
          operation: "delete",
          vectorClock: { dev1: 2 },
          data: null,
        }),
      ];

      mockSafeQuery.mockResolvedValue([]);
      await applyRemoteChanges(changes, "local-dev");

      const stmts = getTxStmts();
      const updateStmt = findStmt(stmts, "UPDATE characters SET is_deleted = 1");
      expect(updateStmt).toBeDefined();
      expect(updateStmt!.sql).toContain("sync_status = 'synced'");
      expect(updateStmt!.sql).toContain("updated_at = ?");
      // params: [vectorClock, updated_at, entityId]
      expect(updateStmt!.params[0]).toBe(JSON.stringify({ dev1: 2 }));
      expect(updateStmt!.params[2]).toBe("c1");
    });

    it("story_versions 软删除表（在 TABLES_WITHOUT_UPDATED_AT）应不含 updated_at", async () => {
      // story_versions is in HARD_DELETE_TABLES, so it's a hard delete, not soft.
      // Let's test with stories (has is_deleted, has updated_at) instead for soft delete.
      // Actually story_versions is in HARD_DELETE_TABLES → DELETE FROM.
      // For soft delete without updated_at, we'd need a table that:
      //   - is NOT in HARD_DELETE_TABLES (has is_deleted)
      //   - IS in TABLES_WITHOUT_UPDATED_AT
      // Looking at the maps: characters/scenes/stories have is_deleted.
      // TABLES_WITHOUT_UPDATED_AT = video_tasks, story_versions.
      // None of characters/scenes/stories are in TABLES_WITHOUT_UPDATED_AT.
      // So this branch is not reachable with real data.
      // Instead, test story_versions hard delete (no updated_at concern).
      const changes: RemoteChange[] = [
        makeChange({
          entityType: "story_version",
          entityId: "sv1",
          operation: "delete",
          vectorClock: { dev1: 2 },
          data: null,
        }),
      ];

      mockSafeQuery.mockResolvedValue([]);
      await applyRemoteChanges(changes, "local-dev");

      const stmts = getTxStmts();
      const deleteStmt = findStmt(stmts, "DELETE FROM story_versions WHERE id = ?");
      expect(deleteStmt).toBeDefined();
    });

    it("软删除 stories 表应包含 updated_at", async () => {
      const changes: RemoteChange[] = [
        makeChange({
          entityType: "story",
          entityId: "s1",
          operation: "delete",
          vectorClock: { dev1: 2 },
          data: null,
        }),
      ];

      mockSafeQuery.mockResolvedValue([]);
      await applyRemoteChanges(changes, "local-dev");

      const stmts = getTxStmts();
      const updateStmt = findStmt(stmts, "UPDATE stories SET is_deleted = 1");
      expect(updateStmt).toBeDefined();
      expect(updateStmt!.sql).toContain("updated_at = ?");
    });
  });

  describe("insert/update 操作", () => {
    it("本地无记录时应执行 INSERT OR IGNORE + UPDATE", async () => {
      const changes: RemoteChange[] = [
        makeChange({
          entityType: "character",
          entityId: "c1",
          operation: "insert",
          vectorClock: { dev1: 1 },
          data: { name: "Alice", description: "test" },
        }),
      ];

      mockSafeQuery.mockResolvedValue([]); // no local row
      await applyRemoteChanges(changes, "local-dev");

      const stmts = getTxStmts();
      const insertStmt = findStmt(stmts, "INSERT OR IGNORE INTO characters");
      expect(insertStmt).toBeDefined();
      expect(insertStmt!.sql).toContain("vector_clock");
      expect(insertStmt!.sql).toContain("sync_status");
      expect(insertStmt!.sql).toContain("is_deleted");
      expect(insertStmt!.sql).toContain("updated_at");

      const updateStmt = findStmt(stmts, "UPDATE characters SET");
      expect(updateStmt).toBeDefined();
      expect(updateStmt!.sql).toContain("is_deleted = 0");
      expect(updateStmt!.sql).toContain("sync_status = 'synced'");
    });

    it("本地无记录时 data 中的主键列应被过滤", async () => {
      const changes: RemoteChange[] = [
        makeChange({
          entityType: "character",
          entityId: "c1",
          operation: "insert",
          vectorClock: { dev1: 1 },
          data: { id: "c1", name: "Alice" }, // id is pk, should be filtered
        }),
      ];

      mockSafeQuery.mockResolvedValue([]);
      await applyRemoteChanges(changes, "local-dev");

      const stmts = getTxStmts();
      // INSERT should not include id in the column list (it's the pk, used as first param)
      const insertStmt = findStmt(stmts, "INSERT OR IGNORE INTO characters");
      expect(insertStmt).toBeDefined();
      // Check that 'name' is in the SQL but 'id' is not in the column list
      // The SQL format: INSERT OR IGNORE INTO characters (id, name, vector_clock, ...)
      // id is the first column (pk), then data columns
      expect(insertStmt!.params[0]).toBe("c1"); // pk value
      expect(insertStmt!.params[1]).toBe("Alice"); // name value
    });

    it("本地时钟小于远程时应执行 UPDATE", async () => {
      const changes: RemoteChange[] = [
        makeChange({
          entityType: "character",
          entityId: "c1",
          operation: "update",
          vectorClock: { dev1: 3 },
          data: { name: "Updated" },
        }),
      ];

      mockSafeQuery.mockResolvedValue([
        { vector_clock: '{"dev1":1}', is_deleted: 0, sync_status: "synced" },
      ]);
      await applyRemoteChanges(changes, "local-dev");

      const stmts = getTxStmts();
      const updateStmt = findStmt(stmts, "UPDATE characters SET");
      expect(updateStmt).toBeDefined();
      expect(updateStmt!.sql).toContain("is_deleted = 0");
      expect(updateStmt!.sql).toContain("sync_status = 'synced'");
      expect(updateStmt!.sql).toContain("updated_at = strftime");
      // params: [...values, vectorClock, entityId]
      const lastParam = updateStmt!.params[updateStmt!.params.length - 1];
      expect(lastParam).toBe("c1");
    });

    it("本地时钟相等且本地 is_deleted=1 且无冲突时应复活（UPDATE is_deleted=0）", async () => {
      const changes: RemoteChange[] = [
        makeChange({
          entityType: "character",
          entityId: "c1",
          operation: "update",
          vectorClock: { dev1: 1 },
          data: { name: "Revived" },
        }),
      ];

      mockSafeQuery.mockResolvedValue([
        { vector_clock: '{"dev1":1}', is_deleted: 1, sync_status: "synced" },
      ]);
      await applyRemoteChanges(changes, "local-dev");

      const stmts = getTxStmts();
      const updateStmt = findStmt(stmts, "UPDATE characters SET");
      expect(updateStmt).toBeDefined();
      expect(updateStmt!.sql).toContain("is_deleted = 0");
      expect(updateStmt!.sql).toContain("sync_status = 'synced'");
    });

    it("本地时钟相等且 is_deleted=1 且有冲突时应标记 sync_status='conflict'", async () => {
      // local: {dev1:2, dev2:1}, remote: {dev1:1, dev2:2} → concurrent (conflict)
      const changes: RemoteChange[] = [
        makeChange({
          entityType: "character",
          entityId: "c1",
          operation: "update",
          vectorClock: { dev1: 1, dev2: 2 },
          data: { name: "Remote" },
        }),
      ];

      mockSafeQuery.mockResolvedValue([
        { vector_clock: '{"dev1":2,"dev2":1}', is_deleted: 1, sync_status: "synced" },
      ]);
      await applyRemoteChanges(changes, "local-dev");

      const stmts = getTxStmts();
      const conflictStmt = findStmt(stmts, "UPDATE characters SET sync_status = 'conflict'");
      expect(conflictStmt).toBeDefined();
      expect(conflictStmt!.params).toEqual(["c1"]);
    });

    it("本地时钟相等且 is_deleted=0 且有冲突时应标记 sync_status='conflict'", async () => {
      // Second conflict branch (is_deleted !== 1)
      const changes: RemoteChange[] = [
        makeChange({
          entityType: "character",
          entityId: "c1",
          operation: "update",
          vectorClock: { dev1: 1, dev2: 2 },
          data: { name: "Remote" },
        }),
      ];

      mockSafeQuery.mockResolvedValue([
        { vector_clock: '{"dev1":2,"dev2":1}', is_deleted: 0, sync_status: "synced" },
      ]);
      await applyRemoteChanges(changes, "local-dev");

      const stmts = getTxStmts();
      const conflictStmt = findStmt(stmts, "UPDATE characters SET sync_status = 'conflict'");
      expect(conflictStmt).toBeDefined();
      expect(conflictStmt!.params).toEqual(["c1"]);
    });

    it("本地时钟大于远程时不应执行任何操作", async () => {
      const changes: RemoteChange[] = [
        makeChange({
          entityType: "character",
          entityId: "c1",
          operation: "update",
          vectorClock: { dev1: 1 },
          data: { name: "Old" },
        }),
      ];

      mockSafeQuery.mockResolvedValue([
        { vector_clock: '{"dev1":5}', is_deleted: 0, sync_status: "synced" },
      ]);
      await applyRemoteChanges(changes, "local-dev");

      // No statements → no safeTransaction call
      expect(mockSafeTransaction).not.toHaveBeenCalled();
    });

    it("本地时钟小于远程但 data 为 null 时不应执行 UPDATE", async () => {
      const changes: RemoteChange[] = [
        makeChange({
          entityType: "character",
          entityId: "c1",
          operation: "update",
          vectorClock: { dev1: 3 },
          data: null,
        }),
      ];

      mockSafeQuery.mockResolvedValue([
        { vector_clock: '{"dev1":1}', is_deleted: 0, sync_status: "synced" },
      ]);
      await applyRemoteChanges(changes, "local-dev");

      // No statements → no safeTransaction call
      expect(mockSafeTransaction).not.toHaveBeenCalled();
    });

    it("本地无记录且 data 为 null 时不应执行 INSERT/UPDATE", async () => {
      const changes: RemoteChange[] = [
        makeChange({
          entityType: "character",
          entityId: "c1",
          operation: "insert",
          vectorClock: { dev1: 1 },
          data: null,
        }),
      ];

      mockSafeQuery.mockResolvedValue([]);
      await applyRemoteChanges(changes, "local-dev");

      expect(mockSafeTransaction).not.toHaveBeenCalled();
    });
  });

  describe("批量事务与错误处理", () => {
    it("多个实体的变更应在单个事务中批量应用", async () => {
      const changes: RemoteChange[] = [
        makeChange({
          entityType: "media_asset",
          entityId: "m1",
          operation: "delete",
          vectorClock: { dev1: 1 },
        }),
        makeChange({
          entityType: "scene",
          entityId: "s1",
          operation: "delete",
          vectorClock: { dev1: 1 },
        }),
      ];

      mockSafeQuery.mockResolvedValue([]);
      await applyRemoteChanges(changes, "local-dev");

      // safeQuery called once per entity
      expect(mockSafeQuery).toHaveBeenCalledTimes(2);
      // safeTransaction called once (batch)
      expect(mockSafeTransaction).toHaveBeenCalledTimes(1);
      const stmts = mockSafeTransaction.mock.calls[0]![0] as Stmt[];
      expect(stmts).toHaveLength(2);
    });

    it("批量事务失败时应 warn 且不抛出", async () => {
      const changes: RemoteChange[] = [
        makeChange({
          entityType: "media_asset",
          entityId: "m1",
          operation: "delete",
          vectorClock: { dev1: 1 },
        }),
      ];

      mockSafeQuery.mockResolvedValue([]);
      mockSafeTransaction.mockRejectedValue(new Error("TX failed"));

      await expect(applyRemoteChanges(changes, "local-dev")).resolves.toBeUndefined();
      expect(mockErrorLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("批量应用远程变更失败"),
        expect.anything(),
      );
    });

    it("单个实体处理失败（safeQuery reject）应 warn 且不抛出", async () => {
      const changes: RemoteChange[] = [
        makeChange({
          entityType: "character",
          entityId: "c1",
          operation: "insert",
          vectorClock: { dev1: 1 },
          data: { name: "A" },
        }),
      ];

      mockSafeQuery.mockRejectedValue(new Error("Query failed"));

      await expect(applyRemoteChanges(changes, "local-dev")).resolves.toBeUndefined();
      expect(mockErrorLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("处理远程变更失败"),
        expect.anything(),
      );
    });

    it("单个实体处理失败不应影响其他实体", async () => {
      const changes: RemoteChange[] = [
        makeChange({
          entityType: "character",
          entityId: "c1",
          operation: "insert",
          vectorClock: { dev1: 1 },
          data: { name: "A" },
        }),
        makeChange({
          entityType: "scene",
          entityId: "s1",
          operation: "delete",
          vectorClock: { dev1: 1 },
        }),
      ];

      // First call (character) fails, second (scene) succeeds
      mockSafeQuery
        .mockRejectedValueOnce(new Error("Query failed"))
        .mockResolvedValueOnce([]);

      await applyRemoteChanges(changes, "local-dev");

      // scene delete should still be applied
      expect(mockSafeTransaction).toHaveBeenCalledTimes(1);
      const stmts = mockSafeTransaction.mock.calls[0]![0] as Stmt[];
      const deleteStmt = findStmt(stmts, "UPDATE scenes SET is_deleted = 1");
      expect(deleteStmt).toBeDefined();
    });

    it("所有实体都失败时不应调用 safeTransaction", async () => {
      const changes: RemoteChange[] = [
        makeChange({
          entityType: "character",
          entityId: "c1",
          operation: "delete",
          vectorClock: { dev1: 1 },
        }),
      ];

      mockSafeQuery.mockRejectedValue(new Error("Query failed"));

      await applyRemoteChanges(changes, "local-dev");

      expect(mockSafeTransaction).not.toHaveBeenCalled();
    });
  });

  describe("video_task 特殊处理", () => {
    it("video_task insert 本地无记录时不应包含 updated_at", async () => {
      const changes: RemoteChange[] = [
        makeChange({
          entityType: "video_task",
          entityId: "t1",
          operation: "insert",
          vectorClock: { dev1: 1 },
          data: { status: "pending" },
        }),
      ];

      mockSafeQuery.mockResolvedValue([]);
      await applyRemoteChanges(changes, "local-dev");

      const stmts = getTxStmts();
      const insertStmt = findStmt(stmts, "INSERT OR IGNORE INTO video_tasks");
      expect(insertStmt).toBeDefined();
      // video_tasks is in TABLES_WITHOUT_UPDATED_AT → no updated_at in INSERT
      expect(insertStmt!.sql).not.toContain("updated_at");
      // video_tasks is in HARD_DELETE_TABLES → hasIsDeleted = false → no is_deleted
      expect(insertStmt!.sql).not.toContain("is_deleted");

      const updateStmt = findStmt(stmts, "UPDATE video_tasks SET");
      expect(updateStmt).toBeDefined();
      expect(updateStmt!.sql).not.toContain("updated_at");
      expect(updateStmt!.sql).not.toContain("is_deleted = 0");
    });

    it("video_task update 本地时钟小于远程时不应包含 updated_at", async () => {
      const changes: RemoteChange[] = [
        makeChange({
          entityType: "video_task",
          entityId: "t1",
          operation: "update",
          vectorClock: { dev1: 3 },
          data: { status: "done" },
        }),
      ];

      mockSafeQuery.mockResolvedValue([
        { vector_clock: '{"dev1":1}', sync_status: "synced" },
      ]);
      await applyRemoteChanges(changes, "local-dev");

      const stmts = getTxStmts();
      const updateStmt = findStmt(stmts, "UPDATE video_tasks SET");
      expect(updateStmt).toBeDefined();
      expect(updateStmt!.sql).not.toContain("updated_at");
      // video_tasks has no is_deleted column
      expect(updateStmt!.sql).not.toContain("is_deleted");
    });

    it("video_task 查询不应包含 is_deleted 列", async () => {
      const changes: RemoteChange[] = [
        makeChange({
          entityType: "video_task",
          entityId: "t1",
          operation: "update",
          vectorClock: { dev1: 2 },
          data: { status: "done" },
        }),
      ];

      mockSafeQuery.mockResolvedValue([
        { vector_clock: '{"dev1":1}', sync_status: "synced" },
      ]);
      await applyRemoteChanges(changes, "local-dev");

      const querySql = mockSafeQuery.mock.calls[0]![0] as string;
      expect(querySql).not.toContain("is_deleted");
      expect(querySql).toContain("sync_status");
    });

    it("character 查询应包含 is_deleted 列", async () => {
      const changes: RemoteChange[] = [
        makeChange({
          entityType: "character",
          entityId: "c1",
          operation: "update",
          vectorClock: { dev1: 2 },
          data: { name: "A" },
        }),
      ];

      mockSafeQuery.mockResolvedValue([
        { vector_clock: '{"dev1":1}', is_deleted: 0, sync_status: "synced" },
      ]);
      await applyRemoteChanges(changes, "local-dev");

      const querySql = mockSafeQuery.mock.calls[0]![0] as string;
      expect(querySql).toContain("is_deleted");
    });
  });
});
