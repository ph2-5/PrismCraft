import { describe, it, expect, vi, beforeEach } from "vitest";

interface SyncServerInfo {
  url: string;
  connected: boolean;
  lastConnectedAt: number | null;
  serverVersion: string | null;
  username?: string;
  token?: string;
}

interface SyncConfigResult {
  success: boolean;
  error?: string;
  config?: {
    enabled: boolean;
    autoSync: boolean;
    syncInterval: number;
    conflictStrategy: string;
    endpoint: string;
    deviceId: string;
    server: SyncServerInfo | null;
  };
}

const {
  mockLoadConfigAsync,
  mockSaveConfigAsync,
  mockKeyStorageSave,
  mockKeyStorageLoad,
  mockKeyStorageDelete,
  mockSsrfGuardAddWhitelist,
  mockSsrfGuardRemoveWhitelist,
} = vi.hoisted(() => ({
  mockLoadConfigAsync: vi.fn<() => Promise<unknown>>(),
  mockSaveConfigAsync: vi.fn<(config: unknown) => Promise<boolean>>(),
  mockKeyStorageSave: vi.fn<(key: string, value: string) => Promise<unknown>>(),
  mockKeyStorageLoad: vi.fn<(key: string) => Promise<unknown>>(),
  mockKeyStorageDelete: vi.fn<(key: string) => Promise<unknown>>(),
  mockSsrfGuardAddWhitelist: vi.fn<(url: string) => void>(),
  mockSsrfGuardRemoveWhitelist: vi.fn<(url: string) => void>(),
}));

vi.mock("../../../../electron/src/handlers/config", () => ({
  loadConfigAsync: mockLoadConfigAsync,
  saveConfigAsync: mockSaveConfigAsync,
}));

vi.mock("../../../../electron/src/security/key-storage/key-storage", () => ({
  keyStorage: {
    save: mockKeyStorageSave,
    load: mockKeyStorageLoad,
    delete: mockKeyStorageDelete,
  },
}));

vi.mock("../../../../electron/src/security/ssrf-guard/ssrf-guard", () => ({
  ssrfGuard: {
    addWhitelist: mockSsrfGuardAddWhitelist,
    removeWhitelist: mockSsrfGuardRemoveWhitelist,
  },
}));

vi.mock("../../../../electron/src/logging/logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("../../../../electron/src/sync-http-client", () => ({
  makeSyncRequest: vi.fn().mockResolvedValue({ statusCode: 200, data: {} }),
}));

import { handleSyncConfig } from "../../../../electron/src/handlers/sync";

const DEFAULT_APP_CONFIG = {
  version: 1,
  providers: [],
  mapping: {},
  fallback: { enabled: true, order: ["text", "image", "vision", "video"] },
};

describe("sync-config-storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadConfigAsync.mockResolvedValue({ ...DEFAULT_APP_CONFIG });
    mockSaveConfigAsync.mockResolvedValue(true);
    mockKeyStorageSave.mockResolvedValue({ ok: true });
    mockKeyStorageLoad.mockResolvedValue({ ok: false, error: "Not found" });
    mockKeyStorageDelete.mockResolvedValue({ ok: true });
  });

  describe("GET - 读取同步配置", () => {
    it("应合并普通配置和加密凭证", async () => {
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
        value: JSON.stringify({ username: "admin", token: "sk-secret-token" }),
      });

      const result = await handleSyncConfig("GET", {}) as unknown as SyncConfigResult;

      expect(result.success).toBe(true);
      expect(result.config!.enabled).toBe(true);
      expect(result.config!.autoSync).toBe(true);
      expect(result.config!.syncInterval).toBe(30000);
      expect(result.config!.conflictStrategy).toBe("last-write-wins");
      expect(result.config!.server!.url).toBe("https://sync.example.com");
      expect(result.config!.server!.connected).toBe(true);
      expect(result.config!.server!.username).toBe("admin");
      expect(result.config!.server!.token).toBe("***");
    });

    it("应将 token 脱敏为 *** 而非返回明文", async () => {
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
            lastConnectedAt: null,
            serverVersion: null,
          },
        },
      });
      mockKeyStorageLoad.mockResolvedValue({
        ok: true,
        value: JSON.stringify({ username: "user1", token: "sk-very-long-secret-token" }),
      });

      const result = await handleSyncConfig("GET", {}) as unknown as SyncConfigResult;

      expect(result.success).toBe(true);
      expect(result.config!.server!.token).toBe("***");
      expect(result.config!.server!.token).not.toContain("sk-very-long-secret-token");
    });

    it("无加密凭证时应返回空 username 和空 token 标记", async () => {
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
            connected: false,
            lastConnectedAt: null,
            serverVersion: null,
          },
        },
      });
      mockKeyStorageLoad.mockResolvedValue({ ok: false, error: "Not found" });

      const result = await handleSyncConfig("GET", {}) as unknown as SyncConfigResult;

      expect(result.success).toBe(true);
      expect(result.config!.server!.username).toBe("");
      expect(result.config!.server!.token).toBe("");
    });

    it("无普通配置时应返回默认同步配置", async () => {
      mockLoadConfigAsync.mockResolvedValue({ ...DEFAULT_APP_CONFIG });

      const result = await handleSyncConfig("GET", {}) as unknown as SyncConfigResult;

      expect(result.success).toBe(true);
      expect(result.config!.enabled).toBe(false);
      expect(result.config!.autoSync).toBe(true);
      expect(result.config!.syncInterval).toBe(30000);
      expect(result.config!.conflictStrategy).toBe("last-write-wins");
      expect(result.config!.server).toBeNull();
    });

    it("server 为 null 且有旧 endpoint 时应自动迁移为 server 对象", async () => {
      mockLoadConfigAsync.mockResolvedValue({
        ...DEFAULT_APP_CONFIG,
        sync: {
          enabled: true,
          autoSync: true,
          syncInterval: 30000,
          conflictStrategy: "last-write-wins",
          endpoint: "https://old-sync.example.com",
          deviceId: "device-1",
          server: null,
        },
      });

      const result = await handleSyncConfig("GET", {}) as unknown as SyncConfigResult;

      expect(result.success).toBe(true);
      expect(result.config!.endpoint).toBe("https://old-sync.example.com");
      expect(result.config!.server).not.toBeNull();
      expect(result.config!.server!.url).toBe("https://old-sync.example.com");
      expect(result.config!.server!.connected).toBe(false);
      expect(result.config!.server!.username).toBe("");
      expect(result.config!.server!.token).toBe("");
    });

    it("keyStorage 返回空值时应视为无凭证", async () => {
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
            connected: false,
            lastConnectedAt: null,
            serverVersion: null,
          },
        },
      });
      mockKeyStorageLoad.mockResolvedValue({ ok: true, value: null });

      const result = await handleSyncConfig("GET", {}) as unknown as SyncConfigResult;

      expect(result.success).toBe(true);
      expect(result.config!.server!.username).toBe("");
      expect(result.config!.server!.token).toBe("");
    });
  });

  describe("POST - 保存同步配置", () => {
    it("应将普通字段保存到 configManager", async () => {
      mockLoadConfigAsync.mockResolvedValue({ ...DEFAULT_APP_CONFIG });

      const newConfig = {
        enabled: true,
        autoSync: true,
        syncInterval: 60000,
        conflictStrategy: "local-wins",
        endpoint: "",
        deviceId: "device-1",
        server: {
          url: "https://sync.example.com",
          connected: false,
          lastConnectedAt: null,
          serverVersion: null,
          username: "admin",
          token: "sk-secret",
        },
      };

      const result = await handleSyncConfig("POST", { config: newConfig }) as unknown as SyncConfigResult;

      expect(result.success).toBe(true);
      expect(mockSaveConfigAsync).toHaveBeenCalled();

      const savedConfig = mockSaveConfigAsync.mock.calls[0][0] as Record<string, Record<string, unknown>>;
      expect(savedConfig.sync.enabled).toBe(true);
      expect(savedConfig.sync.autoSync).toBe(true);
      expect(savedConfig.sync.syncInterval).toBe(60000);
      expect(savedConfig.sync.conflictStrategy).toBe("local-wins");
      expect((savedConfig.sync.server as Record<string, unknown>).url).toBe("https://sync.example.com");
    });

    it("应将敏感字段（username/token）保存到 keyStorage", async () => {
      mockLoadConfigAsync.mockResolvedValue({ ...DEFAULT_APP_CONFIG });

      await handleSyncConfig("POST", {
        config: {
          enabled: true,
          autoSync: true,
          syncInterval: 30000,
          conflictStrategy: "last-write-wins",
          endpoint: "",
          deviceId: "device-1",
          server: {
            url: "https://sync.example.com",
            connected: false,
            lastConnectedAt: null,
            serverVersion: null,
            username: "admin",
            token: "sk-secret-token",
          },
        },
      });

      expect(mockKeyStorageSave).toHaveBeenCalledWith(
        "sync_credentials",
        JSON.stringify({ username: "admin", token: "sk-secret-token" }),
      );
    });

    it("保存时不应将 username/token 写入 configManager", async () => {
      mockLoadConfigAsync.mockResolvedValue({ ...DEFAULT_APP_CONFIG });

      await handleSyncConfig("POST", {
        config: {
          enabled: true,
          autoSync: true,
          syncInterval: 30000,
          conflictStrategy: "last-write-wins",
          endpoint: "",
          deviceId: "device-1",
          server: {
            url: "https://sync.example.com",
            connected: false,
            lastConnectedAt: null,
            serverVersion: null,
            username: "admin",
            token: "sk-secret-token",
          },
        },
      });

      expect(mockSaveConfigAsync).toHaveBeenCalled();
      const savedConfig = mockSaveConfigAsync.mock.calls[0][0] as Record<string, Record<string, unknown>>;
      expect((savedConfig.sync.server as Record<string, unknown>).username).toBeUndefined();
      expect((savedConfig.sync.server as Record<string, unknown>).token).toBeUndefined();
    });

    it("服务器 URL 变更时应更新 SSRF 白名单（移除旧 URL，添加新 URL）", async () => {
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

      await handleSyncConfig("POST", {
        config: {
          enabled: true,
          autoSync: true,
          syncInterval: 30000,
          conflictStrategy: "last-write-wins",
          endpoint: "",
          deviceId: "device-1",
          server: {
            url: "https://new-sync.example.com",
            connected: false,
            lastConnectedAt: null,
            serverVersion: null,
            username: "admin",
            token: "sk-secret",
          },
        },
      });

      expect(mockSsrfGuardRemoveWhitelist).toHaveBeenCalledWith("https://old-sync.example.com");
      expect(mockSsrfGuardAddWhitelist).toHaveBeenCalledWith("https://new-sync.example.com");
    });

    it("首次配置服务器时应只添加 SSRF 白名单（无旧 URL 需移除）", async () => {
      mockLoadConfigAsync.mockResolvedValue({
        ...DEFAULT_APP_CONFIG,
        sync: {
          enabled: false,
          autoSync: true,
          syncInterval: 30000,
          conflictStrategy: "last-write-wins",
          endpoint: "",
          deviceId: "device-1",
          server: null,
        },
      });

      await handleSyncConfig("POST", {
        config: {
          enabled: true,
          autoSync: true,
          syncInterval: 30000,
          conflictStrategy: "last-write-wins",
          endpoint: "",
          deviceId: "device-1",
          server: {
            url: "https://sync.example.com",
            connected: false,
            lastConnectedAt: null,
            serverVersion: null,
            username: "admin",
            token: "sk-secret",
          },
        },
      });

      expect(mockSsrfGuardRemoveWhitelist).not.toHaveBeenCalled();
      expect(mockSsrfGuardAddWhitelist).toHaveBeenCalledWith("https://sync.example.com");
    });

    it("server 为 null 时应删除加密凭证", async () => {
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

      await handleSyncConfig("POST", {
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

      expect(mockKeyStorageDelete).toHaveBeenCalledWith("sync_credentials");
    });

    it("server 为 null 时应从 SSRF 白名单移除旧 URL", async () => {
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

      await handleSyncConfig("POST", {
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

      expect(mockSsrfGuardRemoveWhitelist).toHaveBeenCalledWith("https://sync.example.com");
      expect(mockSsrfGuardAddWhitelist).not.toHaveBeenCalled();
    });

    it("URL 未变更时不应重复操作 SSRF 白名单", async () => {
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

      await handleSyncConfig("POST", {
        config: {
          enabled: true,
          autoSync: true,
          syncInterval: 60000,
          conflictStrategy: "last-write-wins",
          endpoint: "",
          deviceId: "device-1",
          server: {
            url: "https://sync.example.com",
            connected: true,
            lastConnectedAt: 1716193800,
            serverVersion: "v1.0.0",
            username: "admin",
            token: "sk-secret",
          },
        },
      });

      expect(mockSsrfGuardRemoveWhitelist).not.toHaveBeenCalled();
      expect(mockSsrfGuardAddWhitelist).not.toHaveBeenCalled();
    });

    it("保存失败时应返回错误信息", async () => {
      mockLoadConfigAsync.mockResolvedValue({ ...DEFAULT_APP_CONFIG });
      mockSaveConfigAsync.mockResolvedValue(false);

      const result = await handleSyncConfig("POST", {
        config: {
          enabled: true,
          autoSync: true,
          syncInterval: 30000,
          conflictStrategy: "last-write-wins",
          endpoint: "",
          deviceId: "device-1",
          server: null,
        },
      }) as unknown as SyncConfigResult;

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
