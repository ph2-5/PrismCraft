import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockLoadConfigAsync,
  mockSaveConfigAsync,
  mockKeyStorageSave,
  mockKeyStorageLoad,
  mockKeyStorageDelete,
  mockSsrfGuardValidate,
  mockSsrfGuardAddWhitelist,
  mockSsrfGuardRemoveWhitelist,
  mockMakeSyncRequest,
} = vi.hoisted(() => ({
  mockLoadConfigAsync: vi.fn(),
  mockSaveConfigAsync: vi.fn(),
  mockKeyStorageSave: vi.fn(),
  mockKeyStorageLoad: vi.fn(),
  mockKeyStorageDelete: vi.fn(),
  mockSsrfGuardValidate: vi.fn(),
  mockSsrfGuardAddWhitelist: vi.fn(),
  mockSsrfGuardRemoveWhitelist: vi.fn(),
  mockMakeSyncRequest: vi.fn(),
}));

vi.mock("../../../electron/src/handlers/config", () => ({
  loadConfigAsync: mockLoadConfigAsync,
  saveConfigAsync: mockSaveConfigAsync,
}));

vi.mock("../../../electron/src/security/key-storage/key-storage", () => ({
  keyStorage: {
    save: mockKeyStorageSave,
    load: mockKeyStorageLoad,
    delete: mockKeyStorageDelete,
  },
}));

vi.mock("../../../electron/src/security/ssrf-guard/ssrf-guard", () => ({
  ssrfGuard: {
    validate: mockSsrfGuardValidate,
    addWhitelist: mockSsrfGuardAddWhitelist,
    removeWhitelist: mockSsrfGuardRemoveWhitelist,
  },
}));

vi.mock("../../../electron/src/logging/logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("../../../electron/src/sync-http-client", () => ({
  makeSyncRequest: mockMakeSyncRequest,
}));

import { handleSyncConfig, handleSyncTest } from "../../../electron/src/handlers/sync";

type SyncServerInfo = { url: string; connected: boolean; lastConnectedAt: number; serverVersion: string; username?: string; token?: string };
type SyncConfig = { enabled: boolean; autoSync: boolean; syncInterval: number; conflictStrategy: string; endpoint: string; deviceId: string; server: SyncServerInfo | null };

const DEFAULT_APP_CONFIG = {
  version: 1,
  providers: [],
  mapping: {},
  fallback: { enabled: true, order: ["text", "image", "vision", "video"] },
};

describe("E2E 工作流 - 同步服务器配置", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadConfigAsync.mockResolvedValue({ ...DEFAULT_APP_CONFIG });
    mockSaveConfigAsync.mockResolvedValue(true);
    mockKeyStorageSave.mockResolvedValue({ ok: true });
    mockKeyStorageLoad.mockResolvedValue({ ok: false, error: "Not found" });
    mockKeyStorageDelete.mockResolvedValue({ ok: true });
    mockSsrfGuardValidate.mockResolvedValue({ safe: true });
    mockSsrfGuardAddWhitelist.mockReturnValue(undefined);
    mockSsrfGuardRemoveWhitelist.mockReturnValue(undefined);
    mockMakeSyncRequest.mockResolvedValue({
      statusCode: 200,
      data: { version: "v1.0.0", token: "auth-token-123" },
    });
  });

  describe("完整工作流：加载配置 → 配置服务器 → 测试连接 → 保存 → 验证", () => {
    it("应完成从加载到保存的完整流程", async () => {
      mockLoadConfigAsync.mockResolvedValue({
        ...DEFAULT_APP_CONFIG,
        sync: {
          enabled: false,
          autoSync: true,
          syncInterval: 30000,
          conflictStrategy: "last-write-wins",
          endpoint: "",
          deviceId: "",
          server: null,
        },
      });

      const getConfigResult = await handleSyncConfig("GET", {});
      expect(getConfigResult.success).toBe(true);
      expect((getConfigResult.config as SyncConfig).enabled).toBe(false);
      expect((getConfigResult.config as SyncConfig).server).toBeNull();

      const testResult = await handleSyncTest("POST", {
        url: "https://sync.example.com",
        username: "admin",
        password: "pass123",
      });
      expect(testResult.success).toBe(true);
      expect(testResult.token).toBe("auth-token-123");
      expect(testResult.serverVersion).toBe("v1.0.0");

      mockLoadConfigAsync.mockResolvedValue({
        ...DEFAULT_APP_CONFIG,
        sync: {
          enabled: false,
          autoSync: true,
          syncInterval: 30000,
          conflictStrategy: "last-write-wins",
          endpoint: "",
          deviceId: "",
          server: null,
        },
      });

      const saveResult = await handleSyncConfig("POST", {
        config: {
          enabled: true,
          autoSync: true,
          syncInterval: 30000,
          conflictStrategy: "last-write-wins",
          endpoint: "",
          deviceId: "device-1",
          server: {
            url: "https://sync.example.com",
            connected: true,
            lastConnectedAt: Date.now(),
            serverVersion: "v1.0.0",
            username: "admin",
            token: "auth-token-123",
          },
        },
      });
      expect(saveResult.success).toBe(true);

      expect(mockKeyStorageSave).toHaveBeenCalledWith(
        "sync_credentials",
        expect.stringContaining("admin"),
      );
      expect(mockSsrfGuardAddWhitelist).toHaveBeenCalledWith("https://sync.example.com");

      const savedConfig = mockSaveConfigAsync.mock.calls[0]![0]!;
      expect(savedConfig.sync.server.url).toBe("https://sync.example.com");
      expect(savedConfig.sync.server.username).toBeUndefined();
      expect(savedConfig.sync.server.token).toBeUndefined();

      mockLoadConfigAsync.mockResolvedValue(savedConfig);
      mockKeyStorageLoad.mockResolvedValue({
        ok: true,
        value: JSON.stringify({ username: "admin", token: "auth-token-123" }),
      });

      const verifyResult = await handleSyncConfig("GET", {});
      expect(verifyResult.success).toBe(true);
      expect((verifyResult.config as SyncConfig).enabled).toBe(true);
      expect((verifyResult.config as SyncConfig).server!.url).toBe("https://sync.example.com");
      expect((verifyResult.config as SyncConfig).server!.username).toBe("admin");
      expect((verifyResult.config as SyncConfig).server!.token).toBe("***");
    });
  });

  describe("完整工作流：断开服务器 → 验证凭证已删除", () => {
    it("应完成断开连接并清理凭证的完整流程", async () => {
      mockLoadConfigAsync.mockResolvedValue({
        ...DEFAULT_APP_CONFIG,
        sync: {
          enabled: true,
          autoSync: true,
          syncInterval: 30000,
          conflictStrategy: "last-write-wins",
          endpoint: "",
          deviceId: "device-1",
          server: {
            url: "https://sync.example.com",
            connected: true,
            lastConnectedAt: 1716193800,
            serverVersion: "v1.0.0",
          },
        },
      });
      mockKeyStorageLoad.mockResolvedValue({
        ok: true,
        value: JSON.stringify({ username: "admin", token: "sk-sync-token" }),
      });

      const getConfigResult = await handleSyncConfig("GET", {});
      expect(getConfigResult.success).toBe(true);
      expect((getConfigResult.config as SyncConfig).server!.connected).toBe(true);

      mockLoadConfigAsync.mockResolvedValue({
        ...DEFAULT_APP_CONFIG,
        sync: {
          enabled: true,
          autoSync: true,
          syncInterval: 30000,
          conflictStrategy: "last-write-wins",
          endpoint: "",
          deviceId: "device-1",
          server: {
            url: "https://sync.example.com",
            connected: true,
            lastConnectedAt: 1716193800,
            serverVersion: "v1.0.0",
          },
        },
      });

      const disconnectResult = await handleSyncConfig("POST", {
        config: {
          enabled: false,
          autoSync: true,
          syncInterval: 30000,
          conflictStrategy: "last-write-wins",
          endpoint: "",
          deviceId: "device-1",
          server: null,
        },
      });
      expect(disconnectResult.success).toBe(true);

      expect(mockKeyStorageDelete).toHaveBeenCalledWith("sync_credentials");
      expect(mockSsrfGuardRemoveWhitelist).toHaveBeenCalledWith("https://sync.example.com");

      const savedConfig = mockSaveConfigAsync.mock.calls[0]![0]!;
      expect(savedConfig.sync.server).toBeNull();

      mockLoadConfigAsync.mockResolvedValue(savedConfig);
      mockKeyStorageLoad.mockResolvedValue({ ok: false, error: "Not found" });

      const verifyResult = await handleSyncConfig("GET", {});
      expect(verifyResult.success).toBe(true);
      expect((verifyResult.config as SyncConfig).server).toBeNull();
    });
  });

  describe("完整工作流：更改服务器 URL → 验证 SSRF 白名单已更新", () => {
    it("应完成 URL 变更并更新 SSRF 白名单的完整流程", async () => {
      mockLoadConfigAsync.mockResolvedValue({
        ...DEFAULT_APP_CONFIG,
        sync: {
          enabled: true,
          autoSync: true,
          syncInterval: 30000,
          conflictStrategy: "last-write-wins",
          endpoint: "",
          deviceId: "device-1",
          server: {
            url: "https://old-sync.example.com",
            connected: true,
            lastConnectedAt: 1716193800,
            serverVersion: "v1.0.0",
          },
        },
      });
      mockKeyStorageLoad.mockResolvedValue({
        ok: true,
        value: JSON.stringify({ username: "admin", token: "sk-old-token" }),
      });

      const getConfigResult = await handleSyncConfig("GET", {});
      expect(getConfigResult.success).toBe(true);
      expect((getConfigResult.config as SyncConfig).server!.url).toBe("https://old-sync.example.com");

      const testResult = await handleSyncTest("POST", {
        url: "https://new-sync.example.com",
        username: "admin",
        password: "newpass123",
      });
      expect(testResult.success).toBe(true);
      expect(mockSsrfGuardValidate).toHaveBeenCalledWith("https://new-sync.example.com");

      mockLoadConfigAsync.mockResolvedValue({
        ...DEFAULT_APP_CONFIG,
        sync: {
          enabled: true,
          autoSync: true,
          syncInterval: 30000,
          conflictStrategy: "last-write-wins",
          endpoint: "",
          deviceId: "device-1",
          server: {
            url: "https://old-sync.example.com",
            connected: true,
            lastConnectedAt: 1716193800,
            serverVersion: "v1.0.0",
          },
        },
      });

      const saveResult = await handleSyncConfig("POST", {
        config: {
          enabled: true,
          autoSync: true,
          syncInterval: 30000,
          conflictStrategy: "last-write-wins",
          endpoint: "",
          deviceId: "device-1",
          server: {
            url: "https://new-sync.example.com",
            connected: true,
            lastConnectedAt: Date.now(),
            serverVersion: "v1.0.0",
            username: "admin",
            token: "new-auth-token",
          },
        },
      });
      expect(saveResult.success).toBe(true);

      expect(mockSsrfGuardRemoveWhitelist).toHaveBeenCalledWith("https://old-sync.example.com");
      expect(mockSsrfGuardAddWhitelist).toHaveBeenCalledWith("https://new-sync.example.com");

      const savedConfig = mockSaveConfigAsync.mock.calls[0]![0]!;
      expect(savedConfig.sync.server.url).toBe("https://new-sync.example.com");

      mockLoadConfigAsync.mockResolvedValue(savedConfig);
      mockKeyStorageLoad.mockResolvedValue({
        ok: true,
        value: JSON.stringify({ username: "admin", token: "new-auth-token" }),
      });

      const verifyResult = await handleSyncConfig("GET", {});
      expect(verifyResult.success).toBe(true);
      expect((verifyResult.config as SyncConfig).server!.url).toBe("https://new-sync.example.com");
    });
  });
});
