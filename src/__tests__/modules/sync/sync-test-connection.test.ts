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

import { handleSyncTest } from "../../../../electron/src/handlers/sync";

describe("sync-test-connection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSsrfGuardValidate.mockResolvedValue({ safe: true });
    mockMakeSyncRequest.mockResolvedValue({
      statusCode: 200,
      data: { version: "v1.0.0", token: "auth-token-123" },
    });
  });

  it("成功测试连接应返回 serverVersion、latency（不返回 token）", async () => {
    const result = await handleSyncTest("POST", {
      url: "https://sync.example.com",
      username: "admin",
      password: "pass123",
    });

    expect(result.success).toBe(true);
    expect(result.token).toBeUndefined();
    expect(result.serverVersion).toBe("v1.0.0");
    expect(result.latency).toBeDefined();
    expect(typeof result.latency).toBe("number");
    expect(result.latency).toBeGreaterThanOrEqual(0);
  });

  it("401 响应应返回认证错误", async () => {
    mockMakeSyncRequest.mockResolvedValue({
      statusCode: 401,
      data: { error: "Unauthorized" },
    });

    const result = await handleSyncTest("POST", {
      url: "https://sync.example.com",
      username: "admin",
      password: "wrong-password",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("AUTH_FAILED");
  });

  it("网络错误应返回连接错误", async () => {
    mockMakeSyncRequest.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await handleSyncTest("POST", {
      url: "https://sync.example.com",
      username: "admin",
      password: "pass123",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("CONNECTION_FAILED");
    expect(result.error).toContain("ECONNREFUSED");
  });

  it("超时应返回超时错误", async () => {
    mockMakeSyncRequest.mockRejectedValue(new Error("Request timeout"));

    const result = await handleSyncTest("POST", {
      url: "https://sync.example.com",
      username: "admin",
      password: "pass123",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("CONNECTION_FAILED");
    expect(result.error).toContain("timeout");
  });

  it("makeSyncRequest 应使用正确的 URL 和 body 调用", async () => {
    await handleSyncTest("POST", {
      url: "https://sync.example.com",
      username: "admin",
      password: "pass123",
    });

    expect(mockMakeSyncRequest).toHaveBeenCalledWith(
      "https://sync.example.com/auth/login",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "pass123" }),
        timeout: 15000,
      }),
    );
  });
});
