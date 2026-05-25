import { describe, it, expect, vi } from "vitest";

const { mockSafeQuery } = vi.hoisted(() => ({
  mockSafeQuery: vi.fn<() => Promise<any[]>>().mockResolvedValue([]),
}));

vi.mock("@/infrastructure/di", () => ({
  container: { safeQuery: mockSafeQuery },
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { ensureSyncSchema, getSyncStatus } from "../changelog";

describe("SyncChangelog 同步变更日志", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("ensureSyncSchema", () => {
    it("应验证所有核心表的同步列", async () => {
      mockSafeQuery.mockResolvedValue([
        { name: "vector_clock" },
        { name: "sync_status" },
        { name: "last_synced_at" },
      ]);
      await expect(ensureSyncSchema()).resolves.toBeUndefined();
    });

    it("表查询失败时不应抛出异常", async () => {
      mockSafeQuery.mockRejectedValue(new Error("DB error"));
      await expect(ensureSyncSchema()).resolves.toBeUndefined();
    });
  });

  describe("getSyncStatus", () => {
    it("应返回同步状态信息", async () => {
      mockSafeQuery
        .mockResolvedValueOnce([{ count: 5 }])
        .mockResolvedValueOnce([{ value: "1234567890" }])
        .mockResolvedValue([]);
      const status = await getSyncStatus();
      expect(status).toHaveProperty("lastSyncAt");
      expect(status).toHaveProperty("pendingChanges");
      expect(status).toHaveProperty("conflicts");
      expect(status).toHaveProperty("isSyncing");
      expect(status).toHaveProperty("deviceId");
    });

    it("查询失败时应返回默认值", async () => {
      mockSafeQuery.mockRejectedValue(new Error("DB error"));
      const status = await getSyncStatus();
      expect(status.lastSyncAt).toBeNull();
      expect(status.pendingChanges).toBe(0);
      expect(status.conflicts).toBe(0);
    });
  });
});
