import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockLoadConfigAsync,
  mockSaveConfigAsync,
  mockKeyStorageSave,
  mockKeyStorageLoad,
  mockKeyStorageDelete,
  mockMakeSyncRequest,
} = vi.hoisted(() => ({
  mockLoadConfigAsync: vi.fn(),
  mockSaveConfigAsync: vi.fn(),
  mockKeyStorageSave: vi.fn(),
  mockKeyStorageLoad: vi.fn(),
  mockKeyStorageDelete: vi.fn(),
  mockMakeSyncRequest: vi.fn(),
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

vi.mock("../../../../electron/src/logging/logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("../../../../electron/src/sync-http-client", () => ({
  makeSyncRequest: mockMakeSyncRequest,
}));

import { handleSyncTest, handleSyncProxy } from "../../../../electron/src/handlers/sync";

const DEFAULT_APP_CONFIG = {
  version: 1,
  providers: [],
  mapping: {},
  fallback: { enabled: true, order: ["text", "image", "vision", "video"] },
};

describe("sync-config-ssrf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadConfigAsync.mockResolvedValue({ ...DEFAULT_APP_CONFIG });
    mockSaveConfigAsync.mockResolvedValue(true);
    mockKeyStorageSave.mockResolvedValue({ ok: true });
    mockKeyStorageLoad.mockResolvedValue({
      ok: true,
      value: JSON.stringify({ username: "admin", token: "sk-sync-token" }),
    });
    mockKeyStorageDelete.mockResolvedValue({ ok: true });
    mockMakeSyncRequest.mockResolvedValue({
      statusCode: 200,
      data: { version: "v1.0.0", token: "auth-token-123" },
    });
  });

  describe("handleSyncTest - 用户配置的 URL 直接信任", () => {
    it("应直接信任用户配置的外部 URL", async () => {
      const result = await handleSyncTest("POST", {
        url: "https://sync.example.com",
        username: "admin",
        password: "pass123",
      });

      expect(result.success).toBe(true);
    });

    it("应直接信任用户配置的内网 URL（本地优先应用信任用户配置）", async () => {
      const result = await handleSyncTest("POST", {
        url: "http://192.168.1.1:3000",
        username: "admin",
        password: "pass123",
      });

      expect(result.success).toBe(true);
    });

    it("应直接信任用户配置的 localhost URL", async () => {
      const result = await handleSyncTest("POST", {
        url: "http://localhost:8080",
        username: "admin",
        password: "pass123",
      });

      expect(result.success).toBe(true);
    });

    it("连接失败时应返回错误", async () => {
      mockMakeSyncRequest.mockRejectedValue(new Error("ECONNREFUSED"));

      const result = await handleSyncTest("POST", {
        url: "https://sync.example.com",
        username: "admin",
        password: "pass123",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("CONNECTION_FAILED");
    });

    it("认证失败时应返回错误", async () => {
      mockMakeSyncRequest.mockResolvedValue({ statusCode: 401, data: {} });

      const result = await handleSyncTest("POST", {
        url: "https://sync.example.com",
        username: "admin",
        password: "wrong",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("AUTH_FAILED");
    });

    it("缺少 url 参数时应返回错误", async () => {
      const result = await handleSyncTest("POST", {
        username: "admin",
        password: "pass123",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("缺少 username 或 password 时应返回错误", async () => {
      const result = await handleSyncTest("POST", {
        url: "https://sync.example.com",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("成功时应返回服务器版本和延迟", async () => {
      const result = await handleSyncTest("POST", {
        url: "https://sync.example.com",
        username: "admin",
        password: "pass123",
      });

      expect(result.success).toBe(true);
      expect(result.serverVersion).toBe("v1.0.0");
      expect(result.latency).toBeDefined();
    });
  });

  describe("handleSyncProxy - 用户配置的 URL 直接信任", () => {
    it("应直接信任配置的服务器 URL 并发送代理请求", async () => {
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

      const result = await handleSyncProxy("POST", {
        action: "push",
        changes: [],
        deviceId: "device-1",
      });

      expect(result.success).toBe(true);
    });

    it("应直接信任内网服务器 URL（本地优先应用信任用户配置）", async () => {
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
            url: "http://10.0.0.1:3000",
            connected: true,
            lastConnectedAt: 1716193800,
            serverVersion: "v1.0.0",
          },
        },
      });

      const result = await handleSyncProxy("POST", {
        action: "push",
        changes: [],
        deviceId: "device-1",
      });

      expect(result.success).toBe(true);
    });

    it("未配置服务器时应返回错误", async () => {
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

      const result = await handleSyncProxy("POST", {
        action: "push",
        changes: [],
        deviceId: "device-1",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("应从 keyStorage 注入认证 token 到代理请求", async () => {
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

      const result = await handleSyncProxy("POST", {
        action: "push",
        changes: [],
        deviceId: "device-1",
      });

      expect(mockKeyStorageLoad).toHaveBeenCalledWith("sync_credentials");
      expect(result.success).toBe(true);
    });

    it("keyStorage 中无凭证时代理请求应返回认证错误", async () => {
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
      mockKeyStorageLoad.mockResolvedValue({ ok: false, error: "Not found" });

      const result = await handleSyncProxy("POST", {
        action: "push",
        changes: [],
        deviceId: "device-1",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("缺少 action 参数时应返回错误", async () => {
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

      const result = await handleSyncProxy("POST", {});

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("无效 action 值应返回错误", async () => {
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

      const result = await handleSyncProxy("POST", {
        action: "invalid",
        deviceId: "device-1",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
