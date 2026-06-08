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

describe("sync-config-migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadConfigAsync.mockResolvedValue({ ...DEFAULT_APP_CONFIG });
    mockSaveConfigAsync.mockResolvedValue(true);
    mockKeyStorageSave.mockResolvedValue({ ok: true });
    mockKeyStorageLoad.mockResolvedValue({ ok: false, error: "Not found" });
    mockKeyStorageDelete.mockResolvedValue({ ok: true });
  });

  describe("旧配置迁移（endpoint → server）", () => {
    it("旧配置（仅有 endpoint，无 server 字段）在 GET 时应自动迁移为 server 对象", async () => {
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
      expect(result.config!.server).not.toBeNull();
      expect(result.config!.server).toBeDefined();
    });

    it("迁移应将 endpoint 值保留为 server.url", async () => {
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
      expect(result.config!.server!.url).toBe("https://old-sync.example.com");
    });

    it("迁移应设置 connected=false, lastConnectedAt=null, serverVersion=null", async () => {
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
      expect(result.config!.server!.connected).toBe(false);
      expect(result.config!.server!.lastConnectedAt).toBeNull();
      expect(result.config!.server!.serverVersion).toBeNull();
    });

    it("迁移后保存配置应持久化 server 对象（而非仅 endpoint）", async () => {
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

      const getResult = await handleSyncConfig("GET", {}) as unknown as SyncConfigResult;

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

      const migratedServer = getResult.config!.server!;
      await handleSyncConfig("POST", {
        config: {
          ...getResult.config!,
          server: {
            ...migratedServer,
            username: "admin",
            token: "sk-secret",
          },
        },
      });

      expect(mockSaveConfigAsync).toHaveBeenCalled();
      const savedConfig = mockSaveConfigAsync.mock.calls[0]![0]! as Record<string, { server: { url: string } }>;
      expect(savedConfig.sync!.server).toBeDefined();
      expect(savedConfig.sync!.server).not.toBeNull();
      expect(savedConfig.sync!.server.url).toBe("https://old-sync.example.com");
    });

    it("endpoint 字段应在迁移后保留以保持向后兼容", async () => {
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
    });
  });
});
