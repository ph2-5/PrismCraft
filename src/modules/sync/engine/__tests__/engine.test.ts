import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockRegisterChangeTracker, mockSafeQuery } = vi.hoisted(() => ({
  mockRegisterChangeTracker: vi.fn(() => {}),
  mockSafeQuery: vi.fn(),
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    syncStorage: { registerChangeTracker: mockRegisterChangeTracker },
    safeQuery: mockSafeQuery,
  },
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/config/constants", () => ({
  API_SERVER_PORT: 19700,
  ELECTRON_APP_HEADERS: { "X-Electron-App": "true" },
}));

vi.mock("./changelog", () => ({
  getPendingChanges: vi.fn(async () => []),
  markChangesSynced: vi.fn(async () => {}),
  updateLastSyncTime: vi.fn(async () => {}),
  ensureSyncSchema: vi.fn(async () => {}),
  getSyncStatus: vi.fn(async () => ({ lastSyncAt: 0, pendingCount: 0 })),
  cleanupSyncedChanges: vi.fn(async () => {}),
  getDeviceId: vi.fn(() => `dev_${crypto.randomUUID()}`),
  recordChange: vi.fn(async () => {}),
}));

import {
  updateSyncConfig,
  stopAutoSync,
  setConflictCallback,
  performSync,
  getSyncConfig,
} from "../engine";

describe("SyncEngine 同步引擎", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stopAutoSync();
    updateSyncConfig({
      enabled: false,
      autoSync: false,
      endpoint: "",
      deviceId: "test-device-001",
      syncInterval: 30000,
      conflictStrategy: "last-write-wins",
      server: undefined,
      deviceVectorClock: {},
    });
    setConflictCallback(null);
  });

  afterEach(() => {
    stopAutoSync();
  });

  describe("updateSyncConfig", () => {
    it("应更新配置", () => {
      updateSyncConfig({ syncInterval: 120000 });
      expect(getSyncConfig().syncInterval).toBe(120000);
    });

    it("应保留未更新的配置项", () => {
      updateSyncConfig({ syncInterval: 120000 });
      expect(getSyncConfig().conflictStrategy).toBe("last-write-wins");
    });

    it("启用自动同步时应反映在配置中", () => {
      updateSyncConfig({ enabled: true, autoSync: true });
      expect(getSyncConfig().autoSync).toBe(true);
    });

    it("禁用自动同步时应反映在配置中", () => {
      updateSyncConfig({ enabled: true, autoSync: true });
      updateSyncConfig({ autoSync: false });
      expect(getSyncConfig().autoSync).toBe(false);
    });

    it("应更新冲突策略", () => {
      updateSyncConfig({ conflictStrategy: "manual" });
      expect(getSyncConfig().conflictStrategy).toBe("manual");
    });
  });

  describe("setConflictCallback", () => {
    it("应接受回调函数", () => {
      const callback = vi.fn();
      setConflictCallback(callback);
      setConflictCallback(null);
    });

    it("应接受 null 清除回调", () => {
      const callback = vi.fn();
      setConflictCallback(callback);
      setConflictCallback(null);
    });
  });

  describe("performSync", () => {
    it("未启用同步时应返回零结果", async () => {
      updateSyncConfig({ enabled: false });
      const result = await performSync();
      expect(result.pushed).toBe(0);
      expect(result.pulled).toBe(0);
      expect(result.conflicts).toBe(0);
    });

    it("未配置端点时应返回零结果", async () => {
      updateSyncConfig({ enabled: true, endpoint: "" });
      const result = await performSync();
      expect(result.pushed).toBe(0);
      expect(result.pulled).toBe(0);
    });

    it("配置了端点但同步禁用时应返回零结果", async () => {
      updateSyncConfig({ enabled: false, endpoint: "http://localhost:3000" });
      const result = await performSync();
      expect(result.pushed).toBe(0);
    });
  });

  describe("startAutoSync / stopAutoSync", () => {
    it("启用自动同步后应能正常停止", () => {
      updateSyncConfig({ enabled: true, autoSync: true, syncInterval: 30000 });
      stopAutoSync();
    });

    it("重复调用 stopAutoSync 不应报错", () => {
      stopAutoSync();
      stopAutoSync();
    });

    it("未启动时调用 stopAutoSync 不应报错", () => {
      stopAutoSync();
    });
  });

  describe("getSyncConfig", () => {
    it("应返回当前配置", () => {
      const config = getSyncConfig();
      expect(config).toHaveProperty("enabled");
      expect(config).toHaveProperty("syncInterval");
      expect(config).toHaveProperty("conflictStrategy");
      expect(config).toHaveProperty("deviceId");
    });

    it("配置更新后应反映最新值", () => {
      updateSyncConfig({ syncInterval: 99999 });
      expect(getSyncConfig().syncInterval).toBe(99999);
    });
  });
});
