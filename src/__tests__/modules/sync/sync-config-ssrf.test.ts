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
    validate: mockSsrfGuardValidate,
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
    mockSsrfGuardValidate.mockResolvedValue({ safe: true });
    mockMakeSyncRequest.mockResolvedValue({
      statusCode: 200,
      data: { version: "v1.0.0", token: "auth-token-123" },
    });
  });

  describe("handleSyncTest - SSRF 防护", () => {
    it("应通过 ssrfGuard 验证目标 URL", async () => {
      mockSsrfGuardValidate.mockResolvedValue({ safe: true });

      await handleSyncTest("POST", {
        url: "https://sync.example.com",
        username: "admin",
        password: "pass123",
      });

      expect(mockSsrfGuardValidate).toHaveBeenCalledWith("https://sync.example.com");
    });

    it("应拒绝指向私有 IP 的测试连接请求", async () => {
      mockSsrfGuardValidate.mockResolvedValue({
        safe: false,
        reason: "Private hostname detected",
      });

      const result = await handleSyncTest("POST", {
        url: "http://192.168.1.1:3000",
        username: "admin",
        password: "pass123",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Private");
      expect(result.error).toBeDefined();
    });

    it("应拒绝指向云元数据端点的测试连接请求", async () => {
      mockSsrfGuardValidate.mockResolvedValue({
        safe: false,
        reason: "Cloud metadata endpoint blocked",
      });

      const result = await handleSyncTest("POST", {
        url: "http://169.254.169.254/latest/meta-data/",
        username: "admin",
        password: "pass123",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("metadata");
    });

    it("应拒绝无效 URL 格式", async () => {
      mockSsrfGuardValidate.mockResolvedValue({
        safe: false,
        reason: "Invalid URL format",
      });

      const result = await handleSyncTest("POST", {
        url: "not-a-valid-url",
        username: "admin",
        password: "pass123",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("应拒绝非 http/https 协议", async () => {
      mockSsrfGuardValidate.mockResolvedValue({
        safe: false,
        reason: "Unsupported protocol: file:",
      });

      const result = await handleSyncTest("POST", {
        url: "file:///etc/passwd",
        username: "admin",
        password: "pass123",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("protocol");
    });

    it("白名单内的 URL 应允许测试连接", async () => {
      mockSsrfGuardValidate.mockResolvedValue({ safe: true });

      const result = await handleSyncTest("POST", {
        url: "https://sync.example.com",
        username: "admin",
        password: "pass123",
      });

      expect(mockSsrfGuardValidate).toHaveBeenCalledWith("https://sync.example.com");
      expect(result.success).toBe(true);
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
      mockSsrfGuardValidate.mockResolvedValue({ safe: true });

      const result = await handleSyncTest("POST", {
        url: "https://sync.example.com",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("handleSyncProxy - SSRF 防护", () => {
    it("应从配置中读取服务器 URL 并通过 ssrfGuard 验证", async () => {
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
      mockSsrfGuardValidate.mockResolvedValue({ safe: true });

      await handleSyncProxy("POST", {
        action: "push",
        changes: [],
        deviceId: "device-1",
      });

      expect(mockSsrfGuardValidate).toHaveBeenCalledWith("https://sync.example.com");
    });

    it("应拒绝向私有 IP 代理请求", async () => {
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
      mockSsrfGuardValidate.mockResolvedValue({
        safe: false,
        reason: "DNS resolved to private IP: 10.0.0.1",
      });

      const result = await handleSyncProxy("POST", {
        action: "push",
        changes: [],
        deviceId: "device-1",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("private");
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
      mockSsrfGuardValidate.mockResolvedValue({ safe: true });
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
      mockSsrfGuardValidate.mockResolvedValue({ safe: true });
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
      mockSsrfGuardValidate.mockResolvedValue({ safe: true });

      const result = await handleSyncProxy("POST", {
        action: "invalid",
        deviceId: "device-1",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
