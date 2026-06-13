import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSafeRun, mockSafeQuery } = vi.hoisted(() => ({
  mockSafeRun: vi.fn<() => Promise<void>>(async () => {}),
  mockSafeQuery: vi.fn<() => Promise<Record<string, unknown>[]>>(async () => []),
}));

const { mockGetTableName, mockGetPkColumn } = vi.hoisted(() => ({
  mockGetTableName: vi.fn(),
  mockGetPkColumn: vi.fn(),
}));

vi.mock("@/shared/db-core", () => ({
  safeRun: mockSafeRun,
  safeQuery: mockSafeQuery,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/shared/sql-safety", () => ({
  sanitizeIdentifier: vi.fn((id: string) => id),
}));

vi.mock("../entity-mapping", () => ({
  getTableName: mockGetTableName,
  getPkColumn: mockGetPkColumn,
}));

import { resolveConflict, markConflict } from "../conflict-resolution";
import type { SyncConflict, SyncEntityType } from "../types";

function buildConflict(overrides: Partial<SyncConflict> = {}): SyncConflict {
  return {
    entityType: "character" as SyncEntityType,
    entityId: "entity-001",
    localVectorClock: { device1: 1 },
    remoteVectorClock: { device2: 1 },
    localData: null,
    remoteData: null,
    resolved: false,
    resolution: null,
    ...overrides,
  };
}

describe("resolveConflict 冲突解决", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTableName.mockReturnValue("characters");
    mockGetPkColumn.mockReturnValue("id");
  });

  describe("local-wins 策略", () => {
    it("应将 sync_status 设为 pending", async () => {
      const conflict = buildConflict();

      await resolveConflict(conflict, "local-wins");

      expect(mockSafeRun).toHaveBeenCalledOnce();
      expect(mockSafeRun).toHaveBeenCalledWith(
        "UPDATE characters SET sync_status = 'pending' WHERE id = ?",
        ["entity-001"],
      );
    });

    it("应使用 sanitizeIdentifier 处理表名和列名", async () => {
      const { sanitizeIdentifier } = await import("@/shared/sql-safety");
      const conflict = buildConflict();

      await resolveConflict(conflict, "local-wins");

      expect(sanitizeIdentifier).toHaveBeenCalledWith("characters");
      expect(sanitizeIdentifier).toHaveBeenCalledWith("id");
    });
  });

  describe("remote-wins 策略", () => {
    it("应备份本地数据并用远程数据更新", async () => {
      mockSafeQuery.mockResolvedValue([{ id: "entity-001", name: "local-name" }]);
      const conflict = buildConflict({
        remoteData: { name: "remote-name", updated_at: 2000 },
        remoteVectorClock: { device2: 2 },
      });

      await resolveConflict(conflict, "remote-wins");

      // 备份查询
      expect(mockSafeQuery).toHaveBeenCalledWith(
        "SELECT * FROM characters WHERE id = ?",
        ["entity-001"],
      );
      // 备份插入
      expect(mockSafeRun).toHaveBeenCalledTimes(2);
      // 更新操作
      const updateCall = mockSafeRun.mock.calls[1] as string[];
      expect(updateCall?.[0]).toContain("UPDATE characters SET");
      expect(updateCall?.[0]).toContain("sync_status = 'synced'");
      expect(updateCall?.[0]).toContain("vector_clock = ?");
    });

    it("远程数据为空时不应执行更新", async () => {
      const conflict = buildConflict({ remoteData: null });

      await resolveConflict(conflict, "remote-wins");

      expect(mockSafeRun).not.toHaveBeenCalled();
      expect(mockSafeQuery).not.toHaveBeenCalled();
    });

    it("备份失败时应记录警告但仍继续更新", async () => {
      mockSafeQuery.mockRejectedValue(new Error("backup failed"));
      const conflict = buildConflict({
        remoteData: { name: "remote-name" },
        remoteVectorClock: { device2: 2 },
      });

      await resolveConflict(conflict, "remote-wins");

      const { errorLogger } = await import("@/shared/error-logger");
      expect(errorLogger.warn).toHaveBeenCalled();
      // 更新仍应执行
      const updateCall = mockSafeRun.mock.calls.find(
        (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("UPDATE characters SET"),
      );
      expect(updateCall).toBeDefined();
    });

    it("本地无数据时不应插入备份", async () => {
      mockSafeQuery.mockResolvedValue([]);
      const conflict = buildConflict({
        remoteData: { name: "remote-name" },
        remoteVectorClock: { device2: 2 },
      });

      await resolveConflict(conflict, "remote-wins");

      // 只有一次 safeRun 调用（更新），没有备份插入
      expect(mockSafeRun).toHaveBeenCalledOnce();
    });
  });

  describe("last-write-wins 策略", () => {
    it("远程更新时间较新时应更新为远程数据", async () => {
      mockSafeQuery.mockResolvedValue([{ id: "entity-001", name: "local-name" }]);
      const conflict = buildConflict({
        localData: { updated_at: 1000 },
        remoteData: { updated_at: 2000, name: "remote-name" },
        remoteVectorClock: { device2: 2 },
      });

      await resolveConflict(conflict, "last-write-wins");

      expect(mockSafeRun).toHaveBeenCalledTimes(2);
      const updateCall = mockSafeRun.mock.calls[1] as string[];
      expect(updateCall?.[0]).toContain("UPDATE characters SET");
      expect(updateCall?.[0]).toContain("sync_status = 'synced'");
    });

    it("本地更新时间较新时不应更新", async () => {
      const conflict = buildConflict({
        localData: { updated_at: 3000 },
        remoteData: { updated_at: 2000, name: "remote-name" },
        remoteVectorClock: { device2: 2 },
      });

      await resolveConflict(conflict, "last-write-wins");

      expect(mockSafeRun).not.toHaveBeenCalled();
      expect(mockSafeQuery).not.toHaveBeenCalled();
    });

    it("时间戳相等时应更新为远程数据", async () => {
      mockSafeQuery.mockResolvedValue([{ id: "entity-001" }]);
      const conflict = buildConflict({
        localData: { updated_at: 2000 },
        remoteData: { updated_at: 2000, name: "same-time" },
        remoteVectorClock: { device2: 2 },
      });

      await resolveConflict(conflict, "last-write-wins");

      expect(mockSafeRun).toHaveBeenCalled();
    });

    it("无时间戳时（默认0）远程有数据应更新", async () => {
      mockSafeQuery.mockResolvedValue([{ id: "entity-001" }]);
      const conflict = buildConflict({
        localData: {},
        remoteData: { name: "remote-name" },
        remoteVectorClock: { device2: 2 },
      });

      await resolveConflict(conflict, "last-write-wins");

      expect(mockSafeRun).toHaveBeenCalled();
    });
  });

  describe("manual 策略", () => {
    it("应将 sync_status 设为 conflict", async () => {
      const conflict = buildConflict();

      await resolveConflict(conflict, "manual");

      expect(mockSafeRun).toHaveBeenCalledWith(
        "UPDATE characters SET sync_status = 'conflict' WHERE id = ?",
        ["entity-001"],
      );
    });
  });

  describe("未知策略", () => {
    it("不应执行任何操作且不抛出错误", async () => {
      const conflict = buildConflict();

      await resolveConflict(conflict, "unknown-strategy");

      expect(mockSafeRun).not.toHaveBeenCalled();
      expect(mockSafeQuery).not.toHaveBeenCalled();
    });
  });

  describe("未知实体类型", () => {
    it("getTableName 返回 null 时不应执行任何操作", async () => {
      mockGetTableName.mockReturnValue(null);
      const conflict = buildConflict();

      await resolveConflict(conflict, "local-wins");

      expect(mockSafeRun).not.toHaveBeenCalled();
    });

    it("last-write-wins 时 getTableName 返回 null 应跳过", async () => {
      mockGetTableName.mockReturnValue(null);
      const conflict = buildConflict({
        localData: { updated_at: 1000 },
        remoteData: { updated_at: 2000 },
      });

      await resolveConflict(conflict, "last-write-wins");

      expect(mockSafeRun).not.toHaveBeenCalled();
    });
  });
});

describe("markConflict 标记冲突", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTableName.mockReturnValue("characters");
    mockGetPkColumn.mockReturnValue("id");
  });

  it("应将 sync_status 设为 conflict", async () => {
    await markConflict("character", "entity-001");

    expect(mockSafeRun).toHaveBeenCalledWith(
      "UPDATE characters SET sync_status = 'conflict' WHERE id = ?",
      ["entity-001"],
    );
  });

  it("getTableName 返回 null 时不应执行任何操作", async () => {
    mockGetTableName.mockReturnValue(null);

    await markConflict("character", "entity-001");

    expect(mockSafeRun).not.toHaveBeenCalled();
  });
});
