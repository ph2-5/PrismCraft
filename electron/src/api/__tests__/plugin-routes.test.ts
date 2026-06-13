import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IncomingMessage } from "http";

const { mockPluginRegistry, mockSaveUserPlugin, mockDeleteUserPlugin, mockListUserPluginFiles, mockValidatePluginConfig, mockGetAllProcessMetrics } = vi.hoisted(() => ({
  mockPluginRegistry: {
    getAll: vi.fn(() => []),
    getAllCapabilities: vi.fn(() => ({})),
    getAllModelProfiles: vi.fn(() => ({})),
    isUserPlugin: vi.fn(() => false),
    isCodePlugin: vi.fn(() => false),
    selectById: vi.fn(() => undefined),
    reloadUserPlugins: vi.fn(() => ({ loaded: 0, errors: [] })),
    loadCodePlugins: vi.fn(async () => ({ loaded: 0, errors: [] })),
    unregister: vi.fn(),
    register: vi.fn(),
  },
  mockSaveUserPlugin: vi.fn(() => ({ success: true, filePath: "/test/plugin.json" })),
  mockDeleteUserPlugin: vi.fn(() => ({ success: true })),
  mockListUserPluginFiles: vi.fn(() => []),
  mockValidatePluginConfig: vi.fn(() => ({ valid: true, errors: [] })),
  mockGetAllProcessMetrics: vi.fn(() => []),
}));

vi.mock("../../plugins", () => ({
  pluginRegistry: mockPluginRegistry,
  saveUserPlugin: mockSaveUserPlugin,
  deleteUserPlugin: mockDeleteUserPlugin,
  listUserPluginFiles: mockListUserPluginFiles,
  validatePluginConfig: mockValidatePluginConfig,
  getAllProcessMetrics: mockGetAllProcessMetrics,
}));

vi.mock("../../logging/logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { routes } from "../routes";

function callRoute(path: string, method: string, body?: Record<string, unknown>) {
  const route = routes[path];
  if (!route) throw new Error(`Route not found: ${path}`);
  if (!route.methods.includes(method)) throw new Error(`Method ${method} not allowed for ${path}`);

  const mockReq = { method, headers: {} } as unknown as IncomingMessage;
  return route.handler(method, body || {}, mockReq);
}

describe("Plugin API Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET plugins/list", () => {
    it("should return empty list when no plugins registered", async () => {
      const result = await callRoute("plugins/list", "GET");
      expect(result.success).toBe(true);
      expect(result.data.plugins).toEqual([]);
      expect(result.data.capabilities).toEqual({});
      expect(result.data.modelProfiles).toEqual({});
    });

    it("should return plugin list with capabilities", async () => {
      mockPluginRegistry.getAll.mockReturnValue([
        {
          id: "test-plugin",
          displayName: "Test Plugin",
          capabilities: { video: true, image: true, text: false, vision: false },
          videoCapabilities: { supportsLastFrame: true, defaultModel: "v1", maxDuration: 10 },
          imageCapabilities: { supportsReferenceImage: false, defaultModel: "i1" },
        },
      ]);
      mockPluginRegistry.getAllCapabilities.mockReturnValue({
        "test-plugin": { capabilities: { video: true, image: true, text: false, vision: false }, isUserPlugin: false, isCodePlugin: false },
      });
      mockPluginRegistry.getAllModelProfiles.mockReturnValue({
        "v1": { providerId: "test-plugin", modelId: "v1" },
      });

      const result = await callRoute("plugins/list", "GET");
      expect(result.success).toBe(true);
      expect(result.data.plugins).toHaveLength(1);
      expect(result.data.plugins[0].id).toBe("test-plugin");
      expect(result.data.capabilities).toBeDefined();
      expect(result.data.modelProfiles).toBeDefined();
    });
  });

  describe("GET plugins/capabilities", () => {
    it("should return provider capabilities", async () => {
      mockPluginRegistry.getAll.mockReturnValue([
        {
          id: "test-plugin",
          displayName: "Test Plugin",
          capabilities: { video: true, image: false, text: false, vision: false },
          videoCapabilities: { supportsLastFrame: true, supportsReferenceVideo: false, supportsMimicryLevel: false, defaultModel: "v1", maxDuration: 10 },
          imageCapabilities: { supportsReferenceImage: false, defaultModel: "" },
        },
      ]);

      const result = await callRoute("plugins/capabilities", "GET");
      expect(result.success).toBe(true);
      expect(result.data["test-plugin"]).toBeDefined();
      expect(result.data["test-plugin"].supportsLastFrame).toBe(true);
      expect(result.data["test-plugin"].defaultVideoModel).toBe("v1");
    });
  });

  describe("GET plugins/detection-rules", () => {
    it("should return empty rules when no plugins have detection", async () => {
      mockPluginRegistry.getAll.mockReturnValue([
        { id: "no-detect", displayName: "No Detect", getApiKeyDetection: () => undefined },
      ]);

      const result = await callRoute("plugins/detection-rules", "GET");
      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it("should return detection rules sorted by confidence", async () => {
      mockPluginRegistry.getAll.mockReturnValue([
        {
          id: "low-conf",
          displayName: "Low Confidence",
          getApiKeyDetection: () => ({ rules: [{ pattern: "^low-", confidence: "low" }], suggestedName: "Low" }),
        },
        {
          id: "high-conf",
          displayName: "High Confidence",
          getApiKeyDetection: () => ({ rules: [{ pattern: "^high-", confidence: "high" }], suggestedName: "High" }),
        },
      ]);
      mockPluginRegistry.isUserPlugin.mockReturnValue(false);
      mockPluginRegistry.isCodePlugin.mockReturnValue(false);

      const result = await callRoute("plugins/detection-rules", "GET");
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].pluginId).toBe("high-conf");
      expect(result.data[1].pluginId).toBe("low-conf");
    });
  });

  describe("POST plugins/add", () => {
    it("should reject missing config", async () => {
      const result = await callRoute("plugins/add", "POST", {});
      expect(result.success).toBe(false);
      expect(result.error).toContain("缺少插件配置");
    });

    it("should reject invalid config", async () => {
      mockValidatePluginConfig.mockReturnValue({ valid: false, errors: ["缺少必填字段: id"] });

      const result = await callRoute("plugins/add", "POST", { config: { version: "1.0.0" } });
      expect(result.success).toBe(false);
      expect(result.error).toContain("插件配置无效");
    });

    it("should reject config conflicting with built-in plugin", async () => {
      mockValidatePluginConfig.mockReturnValue({ valid: true, errors: [] });
      mockPluginRegistry.selectById.mockReturnValue({ id: "volcengine" });
      mockPluginRegistry.isUserPlugin.mockReturnValue(false);

      const result = await callRoute("plugins/add", "POST", { config: { id: "volcengine", version: "1.0.0" } });
      expect(result.success).toBe(false);
      expect(result.error).toContain("内置插件冲突");
    });

    it("should add valid plugin and reload", async () => {
      mockValidatePluginConfig.mockReturnValue({ valid: true, errors: [] });
      mockPluginRegistry.selectById.mockReturnValue(undefined);
      mockSaveUserPlugin.mockReturnValue({ success: true, filePath: "/plugins/test.json" });
      mockPluginRegistry.reloadUserPlugins.mockReturnValue({ loaded: 1, errors: [] });

      const result = await callRoute("plugins/add", "POST", {
        config: { id: "test-provider", version: "1.0.0", displayName: "Test" },
      });

      expect(result.success).toBe(true);
      expect(result.data.filePath).toBe("/plugins/test.json");
      expect(result.data.loadedCount).toBe(1);
      expect(result.data.cacheInvalidationToken).toBeDefined();
    });

    it("should handle save failure", async () => {
      mockValidatePluginConfig.mockReturnValue({ valid: true, errors: [] });
      mockPluginRegistry.selectById.mockReturnValue(undefined);
      mockSaveUserPlugin.mockReturnValue({ success: false, error: "磁盘写入失败" });

      const result = await callRoute("plugins/add", "POST", {
        config: { id: "test-provider", version: "1.0.0" },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("磁盘写入失败");
    });
  });

  describe("POST plugins/delete", () => {
    it("should reject missing pluginId", async () => {
      const result = await callRoute("plugins/delete", "POST", {});
      expect(result.success).toBe(false);
      expect(result.error).toContain("缺少 pluginId");
    });

    it("should reject deleting built-in plugin", async () => {
      mockPluginRegistry.isUserPlugin.mockReturnValue(false);

      const result = await callRoute("plugins/delete", "POST", { pluginId: "volcengine" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("不能删除内置插件");
    });

    it("should delete user plugin and unregister", async () => {
      mockPluginRegistry.isUserPlugin.mockReturnValue(true);
      mockDeleteUserPlugin.mockReturnValue({ success: true });

      const result = await callRoute("plugins/delete", "POST", { pluginId: "my-plugin" });
      expect(result.success).toBe(true);
      expect(mockPluginRegistry.unregister).toHaveBeenCalledWith("my-plugin");
      expect(result.data.cacheInvalidationToken).toBeDefined();
    });

    it("should handle delete failure", async () => {
      mockPluginRegistry.isUserPlugin.mockReturnValue(true);
      mockDeleteUserPlugin.mockReturnValue({ success: false, error: "文件不存在" });

      const result = await callRoute("plugins/delete", "POST", { pluginId: "my-plugin" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("文件不存在");
    });
  });

  describe("POST plugins/reload", () => {
    it("should reload user plugins", async () => {
      mockPluginRegistry.reloadUserPlugins.mockReturnValue({ loaded: 2, errors: [] });

      const result = await callRoute("plugins/reload", "POST");
      expect(result.success).toBe(true);
      expect(result.data.loaded).toBe(2);
      expect(result.data.cacheInvalidationToken).toBeDefined();
    });

    it("should report reload errors", async () => {
      mockPluginRegistry.reloadUserPlugins.mockReturnValue({ loaded: 0, errors: ["bad config"] });

      const result = await callRoute("plugins/reload", "POST");
      expect(result.success).toBe(true);
      expect(result.data.errors).toContain("bad config");
    });
  });

  describe("POST plugins/reload-code", () => {
    it("should reload code plugins", async () => {
      mockPluginRegistry.loadCodePlugins.mockResolvedValue({ loaded: 1, errors: [] });

      const result = await callRoute("plugins/reload-code", "POST");
      expect(result.success).toBe(true);
      expect(result.data.loaded).toBe(1);
      expect(result.data.cacheInvalidationToken).toBeDefined();
    });
  });

  describe("GET plugins/process-metrics", () => {
    it("should return process metrics", async () => {
      mockGetAllProcessMetrics.mockReturnValue([
        { pluginId: "code-1", alive: true, totalCalls: 5, failedCalls: 0 },
      ]);

      const result = await callRoute("plugins/process-metrics", "GET");
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].pluginId).toBe("code-1");
    });
  });

  describe("POST plugins/validate", () => {
    it("should reject missing config", async () => {
      const result = await callRoute("plugins/validate", "POST", {});
      expect(result.success).toBe(false);
      expect(result.error).toContain("缺少插件配置");
    });

    it("should return validation result for valid config", async () => {
      mockValidatePluginConfig.mockReturnValue({ valid: true, errors: [] });

      const result = await callRoute("plugins/validate", "POST", { config: { id: "test" } });
      expect(result.success).toBe(true);
      expect(result.data.valid).toBe(true);
      expect(result.data.errors).toHaveLength(0);
    });

    it("should return validation result for invalid config", async () => {
      mockValidatePluginConfig.mockReturnValue({ valid: false, errors: ["缺少必填字段: id"] });

      const result = await callRoute("plugins/validate", "POST", { config: {} });
      expect(result.success).toBe(true);
      expect(result.data.valid).toBe(false);
      expect(result.data.errors).toContain("缺少必填字段: id");
    });
  });

  describe("Cache Invalidation Token", () => {
    it("should increment token on add", async () => {
      mockValidatePluginConfig.mockReturnValue({ valid: true, errors: [] });
      mockPluginRegistry.selectById.mockReturnValue(undefined);
      mockSaveUserPlugin.mockReturnValue({ success: true, filePath: "/test" });
      mockPluginRegistry.reloadUserPlugins.mockReturnValue({ loaded: 1, errors: [] });

      const r1 = await callRoute("plugins/add", "POST", { config: { id: "p1" } });
      const r2 = await callRoute("plugins/add", "POST", { config: { id: "p2" } });

      expect(r2.data.cacheInvalidationToken).toBeGreaterThan(r1.data.cacheInvalidationToken);
    });

    it("should increment token on delete", async () => {
      mockPluginRegistry.isUserPlugin.mockReturnValue(true);
      mockDeleteUserPlugin.mockReturnValue({ success: true });

      const r1 = await callRoute("plugins/delete", "POST", { pluginId: "p1" });
      const r2 = await callRoute("plugins/delete", "POST", { pluginId: "p2" });

      expect(r2.data.cacheInvalidationToken).toBeGreaterThan(r1.data.cacheInvalidationToken);
    });

    it("should increment token on reload", async () => {
      mockPluginRegistry.reloadUserPlugins.mockReturnValue({ loaded: 0, errors: [] });

      const r1 = await callRoute("plugins/reload", "POST");
      const r2 = await callRoute("plugins/reload", "POST");

      expect(r2.data.cacheInvalidationToken).toBeGreaterThan(r1.data.cacheInvalidationToken);
    });
  });
});
