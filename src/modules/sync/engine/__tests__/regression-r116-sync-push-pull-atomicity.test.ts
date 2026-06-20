/**
 * R116: sync push-pull 原子性测试
 *
 * 回归规则目的：
 *   markChangesSynced 必须在 push + pull + applyRemoteChanges 全部成功后才调用，
 *   不能在 push 阶段提前调用。否则 pull/apply 失败时本地变更被错误标记为已同步，
 *   导致数据丢失（下次同步不会重新 push 这些变更）。
 *
 * 被测代码：
 *   src/modules/sync/engine/sync-protocol.ts (pushChanges / pullChanges)
 *   src/modules/sync/engine/sync-engine-class.ts (SyncEngine.performSync)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockMarkChangesSynced,
  mockUpdateLastSyncTime,
  mockEnsureSyncSchema,
  mockCleanupSyncedChanges,
  mockGetPendingChanges,
  mockGetSyncStatus,
  mockGetDeviceId,
  mockRecordChange,
  mockApplyRemoteChanges,
  mockResolveConflict,
  mockRegisterChangeTracker,
  mockUnregisterChangeTracker,
  mockErrorLogger,
  mockSafeJsonParse,
} = vi.hoisted(() => ({
  mockMarkChangesSynced: vi.fn<(ids: string[]) => Promise<void>>().mockResolvedValue(undefined),
  mockUpdateLastSyncTime: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  mockEnsureSyncSchema: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  mockCleanupSyncedChanges: vi.fn<() => Promise<number>>().mockResolvedValue(0),
  mockGetPendingChanges: vi.fn<() => Promise<Array<{ id: string; entityType: string; entityId: string; operation: string; vectorClock: Record<string, number>; data: string | undefined; timestamp: number; deviceId: string }>>>().mockResolvedValue([]),
  mockGetSyncStatus: vi.fn<() => Promise<{ lastSyncAt: number | null; pendingCount: number; conflicts: number; isSyncing: boolean; deviceId: string }>>().mockResolvedValue({ lastSyncAt: 0, pendingCount: 0, conflicts: 0, isSyncing: false, deviceId: "test-device-001" }),
  mockGetDeviceId: vi.fn<() => Promise<string>>().mockResolvedValue("test-device-001"),
  mockRecordChange: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  mockApplyRemoteChanges: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  mockResolveConflict: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  mockRegisterChangeTracker: vi.fn<() => undefined>().mockReturnValue(undefined),
  mockUnregisterChangeTracker: vi.fn<() => undefined>().mockReturnValue(undefined),
  mockErrorLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
  mockSafeJsonParse: vi.fn(<T>(raw: unknown, fallback: T): T => {
    if (typeof raw !== "string") return fallback;
    try { return JSON.parse(raw) as T; } catch { return fallback; }
  }),
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    syncStorage: {
      registerChangeTracker: mockRegisterChangeTracker,
      unregisterChangeTracker: mockUnregisterChangeTracker,
    },
  },
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
}));

vi.mock("@/shared/utils/safe-json", () => ({
  safeJsonParse: mockSafeJsonParse,
}));

vi.mock("@/config/constants", () => ({
  API_SERVER_PORT: 19700,
  ELECTRON_APP_HEADERS: { "X-Electron-App": "true" },
}));

vi.mock("../changelog", () => ({
  getPendingChanges: mockGetPendingChanges,
  markChangesSynced: mockMarkChangesSynced,
  updateLastSyncTime: mockUpdateLastSyncTime,
  ensureSyncSchema: mockEnsureSyncSchema,
  getSyncStatus: mockGetSyncStatus,
  cleanupSyncedChanges: mockCleanupSyncedChanges,
  getDeviceId: mockGetDeviceId,
  recordChange: mockRecordChange,
}));

vi.mock("../remote-changes", () => ({
  applyRemoteChanges: mockApplyRemoteChanges,
}));

vi.mock("../conflict-resolution", () => ({
  resolveConflict: mockResolveConflict,
}));

import { SyncEngine } from "../sync-engine-class";
import { pushChanges } from "../sync-protocol";
import type { SyncPushResult } from "../types";

// 构造 fetch Response 的辅助函数
function makeFetchResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

// 构造 pending change
function makePendingChange(id: string, entityId = `entity-${id}`) {
  return {
    id,
    entityType: "character",
    entityId,
    operation: "update" as const,
    vectorClock: { "test-device-001": 1 },
    data: JSON.stringify({ name: `name-${id}` }),
    timestamp: Date.now(),
    deviceId: "test-device-001",
  };
}

describe("R116: sync push-pull 原子性", () => {
  let engine: SyncEngine;
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    // 重置所有 mock 的默认行为
    mockMarkChangesSynced.mockResolvedValue(undefined);
    mockUpdateLastSyncTime.mockResolvedValue(undefined);
    mockEnsureSyncSchema.mockResolvedValue(undefined);
    mockCleanupSyncedChanges.mockResolvedValue(0);
    mockGetPendingChanges.mockResolvedValue([]);
    mockGetSyncStatus.mockResolvedValue({ lastSyncAt: 0, pendingCount: 0, conflicts: 0, isSyncing: false, deviceId: "test-device-001" });
    mockGetDeviceId.mockResolvedValue("test-device-001");
    mockApplyRemoteChanges.mockResolvedValue(undefined);
    mockResolveConflict.mockResolvedValue(undefined);

    // 创建新的 SyncEngine 实例，配置为启用同步
    engine = new SyncEngine({
      enabled: true,
      autoSync: false,
      endpoint: "http://localhost:3000",
      deviceId: "test-device-001",
      syncInterval: 30000,
      conflictStrategy: "last-write-wins",
      server: null,
      deviceVectorClock: {},
    });
  });

  afterEach(() => {
    engine.destroy();
    global.fetch = originalFetch;
  });

  describe("SyncPushResult 应包含 syncedIds 字段", () => {
    it("pushChanges 返回值应包含 syncedIds 数组字段", async () => {
      // 准备 pending changes
      const pending = [makePendingChange("cl-1"), makePendingChange("cl-2")];
      mockGetPendingChanges.mockResolvedValue(pending);

      // mock fetch 返回 push 成功响应
      global.fetch = vi.fn().mockResolvedValue(
        makeFetchResponse({
          success: true,
          data: {
            accepted: 2,
            conflicts: [],
            serverVectorClock: { "test-device-001": 1 },
          },
        }),
      );

      const result: SyncPushResult = await pushChanges("test-device-001", "http://localhost:3000");

      // syncedIds 字段必须存在且为数组
      expect(result).toHaveProperty("syncedIds");
      expect(Array.isArray(result.syncedIds)).toBe(true);
      // 无冲突时，所有 pending change 的 id 都应在 syncedIds 中
      expect(result.syncedIds).toEqual(expect.arrayContaining(["cl-1", "cl-2"]));
      expect(result.syncedIds).toHaveLength(2);
    });

    it("pushChanges 在无 pending changes 时应返回空 syncedIds", async () => {
      mockGetPendingChanges.mockResolvedValue([]);

      const result = await pushChanges("test-device-001", "http://localhost:3000");

      expect(result.syncedIds).toEqual([]);
    });

    it("pushChanges 在无 server 配置时应返回空 syncedIds", async () => {
      mockGetPendingChanges.mockResolvedValue([makePendingChange("cl-1")]);

      const result = await pushChanges("test-device-001", undefined, undefined);

      expect(result.syncedIds).toEqual([]);
    });
  });

  describe("performSync: push + pull + apply 全部成功才调用 markChangesSynced", () => {
    it("push + pull + applyRemoteChanges 全部成功时，应调用 markChangesSynced", async () => {
      // 准备 pending changes
      const pending = [makePendingChange("cl-1"), makePendingChange("cl-2")];
      mockGetPendingChanges.mockResolvedValue(pending);

      // mock fetch：第一次 push，第二次 pull
      const pushResponse = makeFetchResponse({
        success: true,
        data: {
          accepted: 2,
          conflicts: [],
          serverVectorClock: { "test-device-001": 1 },
        },
      });
      const pullResponse = makeFetchResponse({
        success: true,
        data: {
          changes: [],
          latestVectorClock: { "test-device-001": 1 },
          hasMore: false,
        },
      });
      global.fetch = vi.fn()
        .mockResolvedValueOnce(pushResponse)
        .mockResolvedValueOnce(pullResponse);

      const result = await engine.performSync();

      // markChangesSynced 应被调用，且传入所有 syncedIds
      expect(mockMarkChangesSynced).toHaveBeenCalledTimes(1);
      expect(mockMarkChangesSynced).toHaveBeenCalledWith(
        expect.arrayContaining(["cl-1", "cl-2"]),
      );
      // 同步成功，无 failed 标志
      expect(result.failed).toBeFalsy();
      expect(result.pushed).toBe(2);
    });

    it("push 成功但 pull 失败时，不应调用 markChangesSynced", async () => {
      // 准备 pending changes
      const pending = [makePendingChange("cl-1"), makePendingChange("cl-2")];
      mockGetPendingChanges.mockResolvedValue(pending);

      // mock fetch：push 成功，pull 失败（HTTP 500）
      const pushResponse = makeFetchResponse({
        success: true,
        data: {
          accepted: 2,
          conflicts: [],
          serverVectorClock: { "test-device-001": 1 },
        },
      });
      const pullResponse = makeFetchResponse({ success: false, error: "pull failed" }, false, 500);
      global.fetch = vi.fn()
        .mockResolvedValueOnce(pushResponse)
        .mockResolvedValueOnce(pullResponse);

      const result = await engine.performSync();

      // markChangesSynced 不应被调用（pull 失败，不能提前标记）
      expect(mockMarkChangesSynced).not.toHaveBeenCalled();
      // 同步失败，应返回 failed 标志
      expect(result.failed).toBe(true);
    });

    it("push + pull 成功但 applyRemoteChanges 失败时，不应调用 markChangesSynced", async () => {
      // 准备 pending changes
      const pending = [makePendingChange("cl-1"), makePendingChange("cl-2")];
      mockGetPendingChanges.mockResolvedValue(pending);

      // mock fetch：push 和 pull 都成功
      const pushResponse = makeFetchResponse({
        success: true,
        data: {
          accepted: 2,
          conflicts: [],
          serverVectorClock: { "test-device-001": 1 },
        },
      });
      const pullResponse = makeFetchResponse({
        success: true,
        data: {
          changes: [
            {
              entityType: "character",
              entityId: "char-1",
              operation: "update",
              vectorClock: { "other-device": 2 },
              data: { name: "remote-name" },
              timestamp: Date.now(),
              deviceId: "other-device",
            },
          ],
          latestVectorClock: { "test-device-001": 1, "other-device": 2 },
          hasMore: false,
        },
      });
      global.fetch = vi.fn()
        .mockResolvedValueOnce(pushResponse)
        .mockResolvedValueOnce(pullResponse);

      // applyRemoteChanges 抛错
      mockApplyRemoteChanges.mockRejectedValue(new Error("apply remote changes failed"));

      const result = await engine.performSync();

      // markChangesSynced 不应被调用（apply 失败，不能提前标记）
      expect(mockMarkChangesSynced).not.toHaveBeenCalled();
      // applyRemoteChanges 应被调用
      expect(mockApplyRemoteChanges).toHaveBeenCalledTimes(1);
      // 同步失败
      expect(result.failed).toBe(true);
    });

    it("push 失败时，不应调用 markChangesSynced", async () => {
      // 准备 pending changes
      const pending = [makePendingChange("cl-1")];
      mockGetPendingChanges.mockResolvedValue(pending);

      // mock fetch：push 失败
      const pushResponse = makeFetchResponse({ success: false, error: "push failed" }, false, 500);
      global.fetch = vi.fn().mockResolvedValueOnce(pushResponse);

      const result = await engine.performSync();

      // markChangesSynced 不应被调用
      expect(mockMarkChangesSynced).not.toHaveBeenCalled();
      // 同步失败
      expect(result.failed).toBe(true);
    });

    it("syncedIds 为空时（无 pending changes）不应调用 markChangesSynced", async () => {
      // 无 pending changes
      mockGetPendingChanges.mockResolvedValue([]);

      // mock fetch：pull 成功
      const pullResponse = makeFetchResponse({
        success: true,
        data: {
          changes: [],
          latestVectorClock: {},
          hasMore: false,
        },
      });
      global.fetch = vi.fn().mockResolvedValueOnce(pullResponse);

      await engine.performSync();

      // syncedIds 为空时，sync-engine-class.ts 中的 if (pushResult.syncedIds.length > 0) 不会进入
      // markChangesSynced 不应被调用
      expect(mockMarkChangesSynced).not.toHaveBeenCalled();
    });
  });
});
