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

import { handleSyncProxy } from "../../../../electron/src/handlers/sync";

const DEFAULT_APP_CONFIG = {
  version: 1,
  providers: [],
  mapping: {},
  fallback: { enabled: true, order: ["text", "image", "vision", "video"] },
};

const SYNC_SERVER_CONFIG = {
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
};

describe("sync-proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadConfigAsync.mockResolvedValue({
      ...DEFAULT_APP_CONFIG,
      sync: { ...SYNC_SERVER_CONFIG },
    });
    mockSsrfGuardValidate.mockResolvedValue({ safe: true });
    mockKeyStorageLoad.mockResolvedValue({
      ok: true,
      value: JSON.stringify({ username: "admin", token: "sk-sync-token" }),
    });
    mockMakeSyncRequest.mockResolvedValue({
      statusCode: 200,
      data: { changes: [], latestVectorClock: {} },
    });
  });

  it("push 操作应发送 POST 到 /sync/push 并携带 token header", async () => {
    await handleSyncProxy("POST", {
      action: "push",
      deviceId: "device-1",
      changes: [{ id: 1 }],
    });

    expect(mockMakeSyncRequest).toHaveBeenCalledWith(
      "https://sync.example.com/sync/push",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-Sync-Token": "sk-sync-token",
        }),
      }),
    );
  });

  it("pull 操作应发送 GET 到 /sync/pull 并携带查询参数", async () => {
    await handleSyncProxy("POST", {
      action: "pull",
      deviceId: "device-1",
      since: 1716193800,
    });

    expect(mockMakeSyncRequest).toHaveBeenCalledWith(
      expect.stringContaining("https://sync.example.com/sync/pull"),
      expect.objectContaining({
        method: "GET",
      }),
    );

    const calledUrl = mockMakeSyncRequest.mock.calls[0][0] as string;
    expect(calledUrl).toContain("deviceId=device-1");
    expect(calledUrl).toContain("since=1716193800");
  });

  it("代理应返回远程服务器的数据", async () => {
    const remoteData = { changes: [{ id: 1, type: "character" }], latestVectorClock: { device1: 5 } };
    mockMakeSyncRequest.mockResolvedValue({
      statusCode: 200,
      data: remoteData,
    });

    const result = await handleSyncProxy("POST", {
      action: "pull",
      deviceId: "device-1",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(remoteData);
  });

  it("代理应处理 401 认证失败", async () => {
    mockMakeSyncRequest.mockResolvedValue({
      statusCode: 401,
      data: { error: "Unauthorized" },
    });

    const result = await handleSyncProxy("POST", {
      action: "push",
      deviceId: "device-1",
      changes: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Authentication failed");
  });

  it("代理应处理网络错误", async () => {
    mockMakeSyncRequest.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await handleSyncProxy("POST", {
      action: "push",
      deviceId: "device-1",
      changes: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Proxy request failed");
    expect(result.error).toContain("ECONNREFUSED");
  });
});
