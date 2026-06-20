/**
 * R126: IPC handler 不得返回凭据
 * 回归防护: 确保同步相关的 IPC handler（handleSyncTest、handleSyncConfig、handleSyncProxy）
 *           不在响应中返回 token、password 等敏感凭据。
 *
 * 攻击场景：若 IPC handler 将服务器返回的 token、用户密码等凭据返回给渲染进程，
 *           恶意/被入侵的渲染进程可获取长期凭据并持久化窃取。
 *           正确行为：
 *           - handleSyncTest 仅返回 success/message/serverVersion/latency，不返回 token
 *           - handleSyncConfig (GET) 返回的 token 字段为 "***"（掩码），不返回明文 token
 *           - handleSyncProxy 不在响应中包含 token
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// 提升 mock，确保在模块导入前生效
const {
  mockLoadConfigAsync,
  mockSaveConfigAsync,
  mockKeyStorageLoad,
  mockKeyStorageSave,
  mockKeyStorageDelete,
  mockMakeSyncRequest,
} = vi.hoisted(() => ({
  mockLoadConfigAsync: vi.fn(),
  mockSaveConfigAsync: vi.fn(),
  mockKeyStorageLoad: vi.fn(),
  mockKeyStorageSave: vi.fn(),
  mockKeyStorageDelete: vi.fn(),
  mockMakeSyncRequest: vi.fn(),
}));

// Mock config handler
vi.mock("../handlers/config", () => ({
  loadConfigAsync: mockLoadConfigAsync,
  saveConfigAsync: mockSaveConfigAsync,
  handleConfig: vi.fn(),
  handleSecureConfig: vi.fn(),
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  getConfigFile: vi.fn(),
  getConfigDir: vi.fn(),
}));

// Mock key-storage
vi.mock("../security/key-storage/key-storage", () => ({
  keyStorage: {
    load: mockKeyStorageLoad,
    save: mockKeyStorageSave,
    delete: mockKeyStorageDelete,
  },
}));

// Mock sync-http-client
vi.mock("../sync-http-client", () => ({
  makeSyncRequest: mockMakeSyncRequest,
}));

// Mock logger
vi.mock("../logging/logger", () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

import { handleSyncTest, handleSyncConfig, handleSyncProxy } from "../handlers/sync";

describe("R126: IPC handler 不得返回凭据", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认配置
    mockLoadConfigAsync.mockResolvedValue({
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
    mockSaveConfigAsync.mockResolvedValue(true);
    mockKeyStorageLoad.mockResolvedValue({ ok: true, value: null });
    mockKeyStorageSave.mockResolvedValue({ ok: true });
    mockKeyStorageDelete.mockResolvedValue({ ok: true });
  });

  describe("handleSyncTest - 不返回 token", () => {
    it("成功响应不应包含 token 字段", async () => {
      // 模拟服务器返回包含 token 的响应
      mockMakeSyncRequest.mockResolvedValue({
        statusCode: 200,
        data: {
          token: "secret-long-lived-token-12345",
          version: "1.2.3",
          user: { id: 1, role: "admin" },
        },
      });

      const result = await handleSyncTest("POST", {
        url: "https://sync.example.com",
        username: "testuser",
        password: "testpass",
      });

      // 响应应成功
      expect(result.success).toBe(true);
      // 不应包含 token 字段
      expect(result).not.toHaveProperty("token");
      // 不应包含 password 字段
      expect(result).not.toHaveProperty("password");
      // 不应包含 username 字段
      expect(result).not.toHaveProperty("username");
    });

    it("成功响应应仅包含 success/message/serverVersion/latency", async () => {
      mockMakeSyncRequest.mockResolvedValue({
        statusCode: 200,
        data: {
          token: "secret-token",
          version: "2.0.0",
          refreshToken: "refresh-xyz",
        },
      });

      const result = await handleSyncTest("POST", {
        url: "https://sync.example.com",
        username: "testuser",
        password: "testpass",
      });

      // 应仅包含允许的字段
      const allowedKeys = ["success", "message", "serverVersion", "latency"];
      const resultKeys = Object.keys(result);
      for (const key of resultKeys) {
        expect(allowedKeys).toContain(key);
      }
    });

    it("响应中不应出现服务器返回的 token 值", async () => {
      const secretToken = "super-secret-token-abc123";
      mockMakeSyncRequest.mockResolvedValue({
        statusCode: 200,
        data: {
          token: secretToken,
          version: "1.0.0",
        },
      });

      const result = await handleSyncTest("POST", {
        url: "https://sync.example.com",
        username: "testuser",
        password: "testpass",
      });

      // 整个响应序列化后不应包含 token 值
      const resultJson = JSON.stringify(result);
      expect(resultJson).not.toContain(secretToken);
    });

    it("响应中不应出现 refreshToken 值", async () => {
      const refreshToken = "refresh-token-xyz789";
      mockMakeSyncRequest.mockResolvedValue({
        statusCode: 200,
        data: {
          token: "access-token",
          refreshToken: refreshToken,
          version: "1.0.0",
        },
      });

      const result = await handleSyncTest("POST", {
        url: "https://sync.example.com",
        username: "testuser",
        password: "testpass",
      });

      const resultJson = JSON.stringify(result);
      expect(resultJson).not.toContain(refreshToken);
    });

    it("失败响应也不应包含凭据", async () => {
      mockMakeSyncRequest.mockResolvedValue({
        statusCode: 401,
        data: { token: "should-not-leak" },
      });

      const result = await handleSyncTest("POST", {
        url: "https://sync.example.com",
        username: "testuser",
        password: "testpass",
      });

      expect(result.success).toBe(false);
      expect(result).not.toHaveProperty("token");
      const resultJson = JSON.stringify(result);
      expect(resultJson).not.toContain("should-not-leak");
    });
  });

  describe("handleSyncConfig (GET) - token 掩码处理", () => {
    it("有 token 时应返回 *** 而非明文 token", async () => {
      // 模拟已存储的凭据
      mockKeyStorageLoad.mockResolvedValue({
        ok: true,
        value: JSON.stringify({ username: "admin", token: "secret-token-xyz" }),
      });
      mockLoadConfigAsync.mockResolvedValue({
        sync: {
          enabled: true,
          server: {
            url: "https://sync.example.com",
            connected: true,
            lastConnectedAt: "2026-01-01T00:00:00Z",
            serverVersion: "1.0.0",
          },
        },
      });

      const result = await handleSyncConfig("GET", {});

      expect(result.success).toBe(true);
      const config = result.config as Record<string, unknown>;
      const server = config.server as Record<string, unknown>;
      // token 应被掩码为 ***
      expect(server.token).toBe("***");
      expect(server.token).not.toBe("secret-token-xyz");
    });

    it("无 token 时应返回空字符串", async () => {
      mockKeyStorageLoad.mockResolvedValue({
        ok: true,
        value: JSON.stringify({ username: "admin", token: "" }),
      });
      mockLoadConfigAsync.mockResolvedValue({
        sync: {
          enabled: true,
          server: {
            url: "https://sync.example.com",
            connected: false,
          },
        },
      });

      const result = await handleSyncConfig("GET", {});

      expect(result.success).toBe(true);
      const config = result.config as Record<string, unknown>;
      const server = config.server as Record<string, unknown>;
      // 无 token 时应为空字符串
      expect(server.token).toBe("");
    });

    it("响应中不应出现明文 token 值", async () => {
      const secretToken = "plaintext-secret-token-123";
      mockKeyStorageLoad.mockResolvedValue({
        ok: true,
        value: JSON.stringify({ username: "admin", token: secretToken }),
      });
      mockLoadConfigAsync.mockResolvedValue({
        sync: {
          enabled: true,
          server: {
            url: "https://sync.example.com",
            connected: true,
          },
        },
      });

      const result = await handleSyncConfig("GET", {});

      const resultJson = JSON.stringify(result);
      // 明文 token 不应出现在响应中
      expect(resultJson).not.toContain(secretToken);
    });

    it("username 可以返回（非敏感信息），但 token 必须掩码", async () => {
      mockKeyStorageLoad.mockResolvedValue({
        ok: true,
        value: JSON.stringify({ username: "myuser", token: "tok-123" }),
      });
      mockLoadConfigAsync.mockResolvedValue({
        sync: {
          enabled: true,
          server: { url: "https://sync.example.com" },
        },
      });

      const result = await handleSyncConfig("GET", {});

      const config = result.config as Record<string, unknown>;
      const server = config.server as Record<string, unknown>;
      // username 可以返回
      expect(server.username).toBe("myuser");
      // token 必须掩码
      expect(server.token).toBe("***");
    });
  });

  describe("handleSyncProxy - 不返回 token", () => {
    it("成功响应不应包含 token 字段", async () => {
      mockKeyStorageLoad.mockResolvedValue({
        ok: true,
        value: JSON.stringify({ username: "user", token: "proxy-token-123" }),
      });
      mockLoadConfigAsync.mockResolvedValue({
        sync: {
          server: { url: "https://sync.example.com" },
        },
      });
      mockMakeSyncRequest.mockResolvedValue({
        statusCode: 200,
        data: {
          synced: true,
          items: [{ id: 1, name: "item1" }],
        },
      });

      const result = await handleSyncProxy("POST", {
        action: "pull",
        deviceId: "device-1",
      });

      expect(result.success).toBe(true);
      // 不应包含 token 字段
      expect(result).not.toHaveProperty("token");
      // 不应包含 credentials 字段
      expect(result).not.toHaveProperty("credentials");
    });

    it("响应中不应出现内部使用的 token 值", async () => {
      const internalToken = "internal-sync-token-456";
      mockKeyStorageLoad.mockResolvedValue({
        ok: true,
        value: JSON.stringify({ username: "user", token: internalToken }),
      });
      mockLoadConfigAsync.mockResolvedValue({
        sync: {
          server: { url: "https://sync.example.com" },
        },
      });
      mockMakeSyncRequest.mockResolvedValue({
        statusCode: 200,
        data: { synced: true },
      });

      const result = await handleSyncProxy("POST", {
        action: "push",
        deviceId: "device-1",
        changes: [],
      });

      const resultJson = JSON.stringify(result);
      // 内部使用的 token 不应泄露到响应
      expect(resultJson).not.toContain(internalToken);
    });

    it("失败响应也不应包含 token", async () => {
      mockKeyStorageLoad.mockResolvedValue({
        ok: true,
        value: JSON.stringify({ username: "user", token: "fail-token-789" }),
      });
      mockLoadConfigAsync.mockResolvedValue({
        sync: {
          server: { url: "https://sync.example.com" },
        },
      });
      mockMakeSyncRequest.mockResolvedValue({
        statusCode: 500,
        data: { error: "Internal server error" },
      });

      const result = await handleSyncProxy("POST", {
        action: "pull",
        deviceId: "device-1",
      });

      expect(result.success).toBe(false);
      expect(result).not.toHaveProperty("token");
      const resultJson = JSON.stringify(result);
      expect(resultJson).not.toContain("fail-token-789");
    });

    it("token 用于请求头但不出现在响应中", async () => {
      const authToken = "header-auth-token-abc";
      mockKeyStorageLoad.mockResolvedValue({
        ok: true,
        value: JSON.stringify({ username: "user", token: authToken }),
      });
      mockLoadConfigAsync.mockResolvedValue({
        sync: {
          server: { url: "https://sync.example.com" },
        },
      });
      mockMakeSyncRequest.mockResolvedValue({
        statusCode: 200,
        data: { result: "ok" },
      });

      const result = await handleSyncProxy("POST", {
        action: "pull",
        deviceId: "device-1",
      });

      // 验证 makeSyncRequest 被调用时 token 在 header 中
      expect(mockMakeSyncRequest).toHaveBeenCalled();
      const callArgs = mockMakeSyncRequest.mock.calls[0];
      const options = callArgs[1] as { headers: Record<string, string> };
      expect(options.headers["X-Sync-Token"]).toBe(authToken);

      // 但响应中不应包含 token
      const resultJson = JSON.stringify(result);
      expect(resultJson).not.toContain(authToken);
    });
  });
});
