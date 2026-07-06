import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockSafeQuery,
  mockSafeRun,
  mockSafeTransaction,
  mockIsElectron,
  mockFileGetConfig,
  mockFileSetConfig,
  mockErrorLogger,
} = vi.hoisted(() => ({
  mockSafeQuery: vi.fn(),
  mockSafeRun: vi.fn(),
  mockSafeTransaction: vi.fn(),
  mockIsElectron: vi.fn(),
  mockFileGetConfig: vi.fn(),
  mockFileSetConfig: vi.fn(),
  mockErrorLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/shared/db-core", () => ({
  safeQuery: mockSafeQuery,
  safeRun: mockSafeRun,
  safeTransaction: mockSafeTransaction,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
}));

vi.mock("@/shared/utils/platform", () => ({
  isElectron: mockIsElectron,
}));

vi.mock("@/shared/file-http", () => ({
  getConfig: mockFileGetConfig,
  setConfig: mockFileSetConfig,
}));

vi.mock("@/shared/sql-safety", () => ({
  sanitizeIdentifier: vi.fn((id: string) => id),
}));

// NOTE: @/shared/utils/safe-json is NOT mocked — uses real implementation.

import {
  ensureSyncSchema,
  getSyncStatus,
  recordChange,
  getPendingChanges,
  markChangesSynced,
  softDelete,
  updateLastSyncTime,
  cleanupSyncedChanges,
} from "../changelog";

type Stmt = { sql: string; params: unknown[] };

function findStmt(stmts: Stmt[], needle: string): Stmt | undefined {
  return stmts.find((s) => s.sql.includes(needle));
}

/**
 * Capture deep-copied snapshots of safeTransaction calls.
 * Needed because recordChange reuses the same statements array (mutates in place),
 * so mock.calls[n][0] all reference the same final-state array.
 */
function captureTxCalls(returnValues: unknown[][]) {
  const snapshots: Stmt[][] = [];
  let callIndex = 0;
  mockSafeTransaction.mockImplementation(async (stmts: Stmt[]) => {
    snapshots.push(stmts.map((s) => ({ sql: s.sql, params: [...s.params] })));
    return returnValues[callIndex++] ?? [];
  });
  return snapshots;
}

describe("SyncChangelog 同步变更日志", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockIsElectron.mockReturnValue(true);
    mockFileGetConfig.mockResolvedValue("test-device-001");
    mockFileSetConfig.mockResolvedValue(true);
    mockSafeQuery.mockResolvedValue([]);
    mockSafeRun.mockResolvedValue(undefined);
    mockSafeTransaction.mockResolvedValue([]);
  });

  describe("ensureSyncSchema", () => {
    it("非 electron 环境应直接返回不查询数据库", async () => {
      mockIsElectron.mockReturnValue(false);
      await ensureSyncSchema();
      expect(mockSafeQuery).not.toHaveBeenCalled();
    });

    it("应验证所有核心表的同步列", async () => {
      mockSafeQuery.mockResolvedValue([
        { name: "vector_clock" },
        { name: "is_deleted" },
        { name: "sync_status" },
        { name: "last_synced_at" },
      ]);
      await expect(ensureSyncSchema()).resolves.toBeUndefined();
      // 9 core tables: characters, scenes, stories, media_assets,
      // storyboard_assets, video_tasks, collections, story_versions, video_cache
      expect(mockSafeQuery).toHaveBeenCalledTimes(9);
    });

    it("表查询失败时不应抛出异常", async () => {
      mockSafeQuery.mockRejectedValue(new Error("DB error"));
      await expect(ensureSyncSchema()).resolves.toBeUndefined();
      expect(mockErrorLogger.warn).toHaveBeenCalled();
    });

    it("检测到缺失列时应记录警告", async () => {
      mockSafeQuery.mockResolvedValue([{ name: "vector_clock" }]);
      await ensureSyncSchema();
      expect(mockErrorLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("missing columns"),
      );
    });

    it("表不存在（columns.length === 0）时应跳过", async () => {
      mockSafeQuery.mockResolvedValue([]);
      await ensureSyncSchema();
      // 没有警告关于 missing columns（但可能有其他警告）
      const missingColCalls = mockErrorLogger.warn.mock.calls.filter(
        (c) => typeof c[0] === "string" && c[0].includes("missing columns"),
      );
      expect(missingColCalls).toHaveLength(0);
    });
  });

  describe("getSyncStatus", () => {
    it("应返回同步状态信息", async () => {
      mockSafeQuery
        .mockResolvedValueOnce([{ count: 5 }]) // pending
        .mockResolvedValueOnce([{ value: "1234567890" }]) // meta
        .mockResolvedValue([]); // conflict tables
      const status = await getSyncStatus();
      expect(status.lastSyncAt).toBe(1234567890);
      expect(status.pendingChanges).toBe(5);
      expect(status.conflicts).toBe(0);
      expect(status.isSyncing).toBe(false);
      expect(status.deviceId).toBe("test-device-001");
    });

    it("查询失败时应返回默认值", async () => {
      mockSafeQuery.mockRejectedValue(new Error("DB error"));
      const status = await getSyncStatus();
      expect(status.lastSyncAt).toBeNull();
      expect(status.pendingChanges).toBe(0);
      expect(status.conflicts).toBe(0);
      expect(status.isSyncing).toBe(false);
    });

    it("应聚合多个表的冲突数", async () => {
      mockSafeQuery
        .mockResolvedValueOnce([{ count: 3 }]) // pending
        .mockResolvedValueOnce([{ value: "100" }]) // meta
        .mockResolvedValue([{ count: 2 }]); // 8 conflict tables
      const status = await getSyncStatus();
      expect(status.conflicts).toBe(16); // 8 tables * 2
      expect(status.pendingChanges).toBe(3);
      expect(status.lastSyncAt).toBe(100);
    });

    it("last_sync_at 非数字时应返回 null", async () => {
      mockSafeQuery
        .mockResolvedValueOnce([{ count: 0 }]) // pending
        .mockResolvedValueOnce([{ value: "not-a-number" }]) // meta
        .mockResolvedValue([]);
      const status = await getSyncStatus();
      expect(status.lastSyncAt).toBeNull();
    });

    it("sync_meta 无记录时应返回 null", async () => {
      mockSafeQuery
        .mockResolvedValueOnce([{ count: 0 }]) // pending
        .mockResolvedValueOnce([]) // meta empty
        .mockResolvedValue([]);
      const status = await getSyncStatus();
      expect(status.lastSyncAt).toBeNull();
    });

    it("单个冲突表查询失败应不影响总计", async () => {
      mockSafeQuery
        .mockResolvedValueOnce([{ count: 1 }]) // pending
        .mockResolvedValueOnce([{ value: "100" }]) // meta
        .mockResolvedValueOnce([{ count: 5 }]) // first conflict table
        .mockRejectedValueOnce(new Error("table missing")) // second fails
        .mockResolvedValue([{ count: 0 }]); // rest
      const status = await getSyncStatus();
      expect(status.conflicts).toBe(5);
    });
  });

  describe("recordChange", () => {
    it("insert 操作应更新实体表并插入变更日志", async () => {
      const txSnaps = captureTxCalls([
        [[{ vector_clock: '{"dev1":1}' }]], // read
        [], // write
      ]);

      await recordChange("character", "char-1", "insert", { name: "Alice" });

      expect(mockSafeTransaction).toHaveBeenCalledTimes(2);

      // First call: reads
      const readStmts = txSnaps[0]!;
      expect(readStmts[0]!.sql).toContain("SELECT vector_clock FROM characters WHERE id = ?");

      // Second call: writes
      const writeStmts = txSnaps[1]!;
      const updateStmt = findStmt(writeStmts, "UPDATE characters SET");
      expect(updateStmt).toBeDefined();
      expect(updateStmt!.sql).toContain("sync_status = 'pending'");
      expect(updateStmt!.sql).toContain("updated_at = strftime");

      const insertStmt = findStmt(writeStmts, "INSERT INTO sync_changelog");
      expect(insertStmt).toBeDefined();
      expect(insertStmt!.params[1]).toBe("character");
      expect(insertStmt!.params[2]).toBe("char-1");
      expect(insertStmt!.params[3]).toBe("insert");
    });

    it("update 操作应更新实体表并插入变更日志", async () => {
      mockSafeTransaction
        .mockResolvedValueOnce([[{ vector_clock: '{"dev1":2}' }]])
        .mockResolvedValueOnce([]);

      await recordChange("character", "char-1", "update", { name: "Bob" });

      const writeStmts = mockSafeTransaction.mock.calls[1]![0] as Stmt[];
      const updateStmt = findStmt(writeStmts, "UPDATE characters SET");
      expect(updateStmt).toBeDefined();
      const insertStmt = findStmt(writeStmts, "INSERT INTO sync_changelog");
      expect(insertStmt).toBeDefined();
      expect(insertStmt!.params[3]).toBe("update");
    });

    it("delete 操作应只插入变更日志（不更新实体表）", async () => {
      mockSafeTransaction
        .mockResolvedValueOnce([
          [{ vector_clock: '{"dev1":1}' }], // entity exists
          [{ vector_clock: '{"dev2":2}' }], // history
        ])
        .mockResolvedValueOnce([]);

      await recordChange("character", "char-1", "delete");

      const writeStmts = mockSafeTransaction.mock.calls[1]![0] as Stmt[];
      // No UPDATE for delete
      expect(findStmt(writeStmts, "UPDATE characters SET")).toBeUndefined();
      const insertStmt = findStmt(writeStmts, "INSERT INTO sync_changelog");
      expect(insertStmt).toBeDefined();
      expect(insertStmt!.params[3]).toBe("delete");
    });

    it("delete 操作且实体不存在时应回退到历史时钟", async () => {
      mockSafeTransaction
        .mockResolvedValueOnce([
          [], // entity not found
          [{ vector_clock: '{"dev2":2}' }], // history
        ])
        .mockResolvedValueOnce([]);

      await recordChange("character", "char-1", "delete");

      const writeStmts = mockSafeTransaction.mock.calls[1]![0] as Stmt[];
      const insertStmt = findStmt(writeStmts, "INSERT INTO sync_changelog");
      expect(insertStmt).toBeDefined();
      const clockParam = insertStmt!.params[4] as string;
      const parsed = JSON.parse(clockParam);
      expect(parsed.dev2).toBe(2);
      expect(parsed["test-device-001"]).toBe(1);
    });

    it("delete 操作且实体和历史的时钟都为空时应使用空时钟递增", async () => {
      mockSafeTransaction
        .mockResolvedValueOnce([[], []])
        .mockResolvedValueOnce([]);

      await recordChange("character", "char-1", "delete");

      const writeStmts = mockSafeTransaction.mock.calls[1]![0] as Stmt[];
      const insertStmt = findStmt(writeStmts, "INSERT INTO sync_changelog");
      const clockParam = insertStmt!.params[4] as string;
      const parsed = JSON.parse(clockParam);
      expect(parsed["test-device-001"]).toBe(1);
    });

    it("insert 操作且实体时钟为空时应从空时钟递增", async () => {
      mockSafeTransaction
        .mockResolvedValueOnce([[]]) // entity not found
        .mockResolvedValueOnce([]);

      await recordChange("character", "char-1", "insert");

      const writeStmts = mockSafeTransaction.mock.calls[1]![0] as Stmt[];
      const updateStmt = findStmt(writeStmts, "UPDATE characters SET");
      expect(updateStmt).toBeDefined();
      const clockParam = updateStmt!.params[0] as string;
      const parsed = JSON.parse(clockParam);
      expect(parsed["test-device-001"]).toBe(1);
    });

    it("向量时钟应正确递增（保留已有计数器并递增本设备）", async () => {
      mockSafeTransaction
        .mockResolvedValueOnce([[{ vector_clock: '{"dev1":5,"dev2":3}' }]])
        .mockResolvedValueOnce([]);

      await recordChange("character", "char-1", "insert");

      const writeStmts = mockSafeTransaction.mock.calls[1]![0] as Stmt[];
      const updateStmt = findStmt(writeStmts, "UPDATE characters SET");
      const clockParam = updateStmt!.params[0] as string;
      const parsed = JSON.parse(clockParam);
      expect(parsed.dev1).toBe(5);
      expect(parsed.dev2).toBe(3);
      expect(parsed["test-device-001"]).toBe(1);
    });

    it("video_task 表不应包含 updated_at 子句", async () => {
      mockSafeTransaction
        .mockResolvedValueOnce([[{ vector_clock: '{"dev1":1}' }]])
        .mockResolvedValueOnce([]);

      await recordChange("video_task", "task-1", "insert");

      const writeStmts = mockSafeTransaction.mock.calls[1]![0] as Stmt[];
      const updateStmt = findStmt(writeStmts, "UPDATE video_tasks SET");
      expect(updateStmt).toBeDefined();
      expect(updateStmt!.sql).not.toContain("updated_at");
    });

    it("video_task 表应使用 task_id 作为主键", async () => {
      const txSnaps = captureTxCalls([
        [[{ vector_clock: '{"dev1":1}' }]], // read
        [], // write
      ]);

      await recordChange("video_task", "task-1", "insert");

      const readStmts = txSnaps[0]!;
      expect(readStmts[0]!.sql).toContain("WHERE task_id = ?");
      expect(readStmts[0]!.params).toEqual(["task-1"]);
    });

    it("safeTransaction 失败时应记录警告且不抛出", async () => {
      mockSafeTransaction.mockRejectedValue(new Error("DB error"));

      await expect(
        recordChange("character", "char-1", "insert"),
      ).resolves.toBeUndefined();
      expect(mockErrorLogger.warn).toHaveBeenCalledWith(
        "[SyncChangelog] 记录变更失败",
        expect.any(Error),
      );
    });

    it("data 为空时变更日志的 data 字段应为 null", async () => {
      mockSafeTransaction
        .mockResolvedValueOnce([[{ vector_clock: '{"dev1":1}' }]])
        .mockResolvedValueOnce([]);

      await recordChange("character", "char-1", "insert");

      const writeStmts = mockSafeTransaction.mock.calls[1]![0] as Stmt[];
      const insertStmt = findStmt(writeStmts, "INSERT INTO sync_changelog");
      expect(insertStmt!.params[5]).toBeNull();
    });

    it("data 非空时变更日志的 data 字段应为 JSON 字符串", async () => {
      mockSafeTransaction
        .mockResolvedValueOnce([[{ vector_clock: '{"dev1":1}' }]])
        .mockResolvedValueOnce([]);

      await recordChange("character", "char-1", "insert", { name: "Alice" });

      const writeStmts = mockSafeTransaction.mock.calls[1]![0] as Stmt[];
      const insertStmt = findStmt(writeStmts, "INSERT INTO sync_changelog");
      expect(insertStmt!.params[5]).toBe(JSON.stringify({ name: "Alice" }));
    });

    it("实体向量时钟解析失败时应使用空时钟", async () => {
      mockSafeTransaction
        .mockResolvedValueOnce([[{ vector_clock: "not-valid-json" }]])
        .mockResolvedValueOnce([]);

      await recordChange("character", "char-1", "insert");

      const writeStmts = mockSafeTransaction.mock.calls[1]![0] as Stmt[];
      const updateStmt = findStmt(writeStmts, "UPDATE characters SET");
      const parsed = JSON.parse(updateStmt!.params[0] as string);
      // 从空时钟递增
      expect(parsed["test-device-001"]).toBe(1);
    });
  });

  describe("getPendingChanges", () => {
    it("应返回未同步的变更列表", async () => {
      mockSafeQuery.mockResolvedValue([
        {
          id: "cl_1",
          entity_type: "character",
          entity_id: "c1",
          operation: "insert",
          vector_clock: '{"dev1":1}',
          data: '{"name":"A"}',
          timestamp: 1000,
          synced: 0,
          device_id: "dev1",
        },
      ]);

      const changes = await getPendingChanges(50);
      expect(changes).toHaveLength(1);
      expect(changes[0]!.id).toBe("cl_1");
      expect(changes[0]!.entityType).toBe("character");
      expect(changes[0]!.entityId).toBe("c1");
      expect(changes[0]!.operation).toBe("insert");
      expect(changes[0]!.vectorClock).toEqual({ dev1: 1 });
      expect(changes[0]!.data).toBe('{"name":"A"}');
      expect(changes[0]!.timestamp).toBe(1000);
      expect(changes[0]!.synced).toBe(0);
      expect(changes[0]!.deviceId).toBe("dev1");
    });

    it("vector_clock 为空时应返回空对象", async () => {
      mockSafeQuery.mockResolvedValue([
        {
          id: "cl_2",
          entity_type: "scene",
          entity_id: "s1",
          operation: "delete",
          vector_clock: null,
          data: null,
          timestamp: 2000,
          synced: 0,
          device_id: "dev2",
        },
      ]);

      const changes = await getPendingChanges();
      expect(changes[0]!.vectorClock).toEqual({});
    });

    it("查询失败时应返回空数组", async () => {
      mockSafeQuery.mockRejectedValue(new Error("DB error"));
      const changes = await getPendingChanges();
      expect(changes).toEqual([]);
      expect(mockErrorLogger.warn).toHaveBeenCalledWith(
        "[SyncChangelog] 查询变更日志失败",
        expect.any(Error),
      );
    });

    it("应使用默认 limit 100", async () => {
      mockSafeQuery.mockResolvedValue([]);
      await getPendingChanges();
      expect(mockSafeQuery).toHaveBeenCalledWith(
        expect.stringContaining("LIMIT ?"),
        [100],
      );
    });

    it("应使用自定义 limit", async () => {
      mockSafeQuery.mockResolvedValue([]);
      await getPendingChanges(25);
      expect(mockSafeQuery).toHaveBeenCalledWith(
        expect.stringContaining("LIMIT ?"),
        [25],
      );
    });
  });

  describe("markChangesSynced", () => {
    it("空数组时应直接返回不调用数据库", async () => {
      await markChangesSynced([]);
      expect(mockSafeQuery).not.toHaveBeenCalled();
      expect(mockSafeTransaction).not.toHaveBeenCalled();
    });

    it("应标记变更为已同步并更新实体表 sync_status", async () => {
      mockSafeQuery.mockResolvedValue([
        { entity_type: "character", entity_id: "c1" },
      ]);

      await markChangesSynced(["cl_1", "cl_2"]);

      // safeQuery called to get distinct entities
      expect(mockSafeQuery).toHaveBeenCalledWith(
        expect.stringContaining("SELECT DISTINCT entity_type, entity_id"),
        ["cl_1", "cl_2"],
      );

      // safeTransaction called with UPDATE sync_changelog + UPDATE characters
      expect(mockSafeTransaction).toHaveBeenCalledTimes(1);
      const stmts = mockSafeTransaction.mock.calls[0]![0] as Stmt[];
      expect(stmts).toHaveLength(2);
      expect(stmts[0]!.sql).toContain("UPDATE sync_changelog SET synced = 1");
      expect(stmts[0]!.sql).toContain("id IN (?,?)");
      expect(stmts[1]!.sql).toContain("UPDATE characters SET sync_status = 'synced'");
      expect(stmts[1]!.sql).toContain("last_synced_at = strftime");
    });

    it("多个不同实体应生成多条 UPDATE 语句", async () => {
      mockSafeQuery.mockResolvedValue([
        { entity_type: "character", entity_id: "c1" },
        { entity_type: "scene", entity_id: "s1" },
        { entity_type: "video_task", entity_id: "t1" },
      ]);

      await markChangesSynced(["cl_1"]);

      const stmts = mockSafeTransaction.mock.calls[0]![0] as Stmt[];
      // 1 sync_changelog UPDATE + 3 entity UPDATEs
      expect(stmts).toHaveLength(4);
      expect(stmts[1]!.sql).toContain("UPDATE characters SET");
      expect(stmts[2]!.sql).toContain("UPDATE scenes SET");
      expect(stmts[3]!.sql).toContain("UPDATE video_tasks SET");
    });

    it("video_task 应使用 task_id 主键", async () => {
      mockSafeQuery.mockResolvedValue([
        { entity_type: "video_task", entity_id: "t1" },
      ]);

      await markChangesSynced(["cl_1"]);

      const stmts = mockSafeTransaction.mock.calls[0]![0] as Stmt[];
      expect(stmts[1]!.sql).toContain("WHERE task_id = ?");
    });

    it("失败时应记录警告且不抛出", async () => {
      mockSafeQuery.mockResolvedValue([]);
      mockSafeTransaction.mockRejectedValue(new Error("DB error"));

      await expect(markChangesSynced(["cl_1"])).resolves.toBeUndefined();
      expect(mockErrorLogger.warn).toHaveBeenCalledWith(
        "[SyncChangelog] 标记同步完成失败",
        expect.any(Error),
      );
    });
  });

  describe("softDelete", () => {
    it("含 is_deleted 列的表应执行软删除 (UPDATE is_deleted=1)", async () => {
      mockSafeTransaction.mockResolvedValue([]);

      await softDelete("character", "char-1");

      expect(mockSafeRun).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE characters SET is_deleted = 1"),
        ["char-1"],
      );
      expect(mockSafeRun).toHaveBeenCalledWith(
        expect.stringContaining("sync_status = 'pending'"),
        ["char-1"],
      );
    });

    it("stories 表软删除应包含 updated_at", async () => {
      mockSafeTransaction.mockResolvedValue([]);

      await softDelete("story", "story-1");

      const call = mockSafeRun.mock.calls.find(
        (c) => typeof c[0] === "string" && c[0].includes("UPDATE stories SET is_deleted = 1"),
      );
      expect(call).toBeDefined();
      expect(call![0]).toContain("updated_at = strftime");
    });

    it("scenes 表软删除应包含 updated_at", async () => {
      mockSafeTransaction.mockResolvedValue([]);

      await softDelete("scene", "scene-1");

      const call = mockSafeRun.mock.calls.find(
        (c) => typeof c[0] === "string" && c[0].includes("UPDATE scenes SET is_deleted = 1"),
      );
      expect(call).toBeDefined();
      expect(call![0]).toContain("updated_at = strftime");
    });

    it("不含 is_deleted 列的表应执行硬删除 (DELETE FROM)", async () => {
      mockSafeTransaction.mockResolvedValue([]);

      await softDelete("media_asset", "asset-1");

      expect(mockSafeRun).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM media_assets WHERE id = ?"),
        ["asset-1"],
      );
    });

    it("video_task 应使用 task_id 主键执行硬删除", async () => {
      mockSafeTransaction.mockResolvedValue([]);

      await softDelete("video_task", "task-1");

      expect(mockSafeRun).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM video_tasks WHERE task_id = ?"),
        ["task-1"],
      );
    });

    it("应调用 recordChange 记录删除变更", async () => {
      mockSafeTransaction
        .mockResolvedValueOnce([[], []]) // recordChange reads
        .mockResolvedValueOnce([]); // recordChange writes

      await softDelete("character", "char-1");

      // safeRun called for soft delete
      expect(mockSafeRun).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE characters SET is_deleted = 1"),
        ["char-1"],
      );
      // safeTransaction called for recordChange (reads + writes)
      expect(mockSafeTransaction).toHaveBeenCalledTimes(2);
      // Verify INSERT INTO sync_changelog was in the write statements
      const writeCallStmts = mockSafeTransaction.mock.calls[1]![0] as Stmt[];
      const insertStmt = findStmt(writeCallStmts, "INSERT INTO sync_changelog");
      expect(insertStmt).toBeDefined();
      expect(insertStmt!.params[3]).toBe("delete");
    });

    it("硬删除后也应调用 recordChange", async () => {
      mockSafeTransaction
        .mockResolvedValueOnce([[], []])
        .mockResolvedValueOnce([]);

      await softDelete("media_asset", "asset-1");

      expect(mockSafeRun).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM media_assets"),
        ["asset-1"],
      );
      // recordChange called safeTransaction
      expect(mockSafeTransaction).toHaveBeenCalled();
    });
  });

  describe("updateLastSyncTime", () => {
    it("应写入 sync_meta 表", async () => {
      await updateLastSyncTime();
      expect(mockSafeRun).toHaveBeenCalledWith(
        expect.stringContaining("INSERT OR REPLACE INTO sync_meta"),
        expect.arrayContaining([expect.any(String)]),
      );
    });

    it("写入的值应为 Unix 时间戳字符串", async () => {
      await updateLastSyncTime();
      const call = mockSafeRun.mock.calls[0]!;
      const value = call[1][0] as string;
      expect(Number.isNaN(parseInt(value, 10))).toBe(false);
      // 约等于当前秒级时间戳
      expect(Math.abs(parseInt(value, 10) - Math.floor(Date.now() / 1000))).toBeLessThan(5);
    });

    it("失败时应记录警告且不抛出", async () => {
      mockSafeRun.mockRejectedValue(new Error("DB error"));
      await expect(updateLastSyncTime()).resolves.toBeUndefined();
      expect(mockErrorLogger.warn).toHaveBeenCalledWith(
        "[SyncChangelog] 更新最后同步时间失败",
        expect.any(String),
      );
    });
  });

  describe("cleanupSyncedChanges", () => {
    it("应返回清理数量并删除已同步变更", async () => {
      mockSafeQuery.mockResolvedValue([{ count: 5 }]);
      const count = await cleanupSyncedChanges(24);
      expect(count).toBe(5);
      expect(mockSafeRun).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM sync_changelog WHERE synced = 1"),
        expect.any(Array),
      );
    });

    it("应使用传入的 olderThanHours 计算截止时间", async () => {
      mockSafeQuery.mockResolvedValue([{ count: 0 }]);
      await cleanupSyncedChanges(48);
      const queryCall = mockSafeQuery.mock.calls[0]!;
      const cutoff = queryCall[1][0] as number;
      const expectedCutoff = Math.floor(Date.now() / 1000) - 48 * 3600;
      expect(Math.abs(cutoff - expectedCutoff)).toBeLessThan(5);
    });

    it("应使用默认 72 小时", async () => {
      mockSafeQuery.mockResolvedValue([{ count: 0 }]);
      await cleanupSyncedChanges();
      const queryCall = mockSafeQuery.mock.calls[0]!;
      const cutoff = queryCall[1][0] as number;
      const expectedCutoff = Math.floor(Date.now() / 1000) - 72 * 3600;
      expect(Math.abs(cutoff - expectedCutoff)).toBeLessThan(5);
    });

    it("数量为 0 时不应调用删除", async () => {
      mockSafeQuery.mockResolvedValue([{ count: 0 }]);
      const count = await cleanupSyncedChanges();
      expect(count).toBe(0);
      expect(mockSafeRun).not.toHaveBeenCalled();
    });

    it("查询失败时应返回 0", async () => {
      mockSafeQuery.mockRejectedValue(new Error("DB error"));
      const count = await cleanupSyncedChanges();
      expect(count).toBe(0);
      expect(mockSafeRun).not.toHaveBeenCalled();
      expect(mockErrorLogger.warn).toHaveBeenCalledWith(
        "[SyncChangelog] 清理已同步变更失败",
        expect.any(String),
      );
    });

    it("删除失败时应返回 0", async () => {
      mockSafeQuery.mockResolvedValue([{ count: 3 }]);
      mockSafeRun.mockRejectedValue(new Error("DB error"));
      const count = await cleanupSyncedChanges();
      expect(count).toBe(0);
      expect(mockErrorLogger.warn).toHaveBeenCalled();
    });
  });
});
