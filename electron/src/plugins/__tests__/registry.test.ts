import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockLoadUserPlugins, mockListCodePluginFiles, mockScanCodePluginFile, mockRegisterProcessManager, mockUnregisterProcessManager } = vi.hoisted(() => ({
  mockLoadUserPlugins: vi.fn(() => []),
  mockListCodePluginFiles: vi.fn(() => []),
  mockScanCodePluginFile: vi.fn(() => ({ valid: true, errors: [] })),
  mockRegisterProcessManager: vi.fn(),
  mockUnregisterProcessManager: vi.fn(),
}));

vi.mock("../user-plugin-loader", () => ({
  loadUserPlugins: mockLoadUserPlugins,
  USER_PLUGINS_DIR: "/mock/plugins",
}));

vi.mock("../code-plugin-loader", () => ({
  CODE_PLUGINS_DIR: "/mock/code-plugins",
  listCodePluginFiles: mockListCodePluginFiles,
  scanCodePluginFile: mockScanCodePluginFile,
}));

vi.mock("../plugin-process-manager", () => {
  return {
    PluginProcessManager: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
      this.load = vi.fn().mockResolvedValue({
        pluginId: "code-test-plugin",
        pluginDisplayName: "Code Test Plugin",
        metadata: {
          capabilities: { video: true, image: true, text: true, vision: true },
          videoCapabilities: { supportsLastFrame: false, supportsReferenceVideo: false, supportsMimicryLevel: false, defaultModel: "v1", maxDuration: 10 },
          imageCapabilities: { supportsReferenceImage: false, defaultModel: "i1" },
          availableModels: [],
        },
      });
      this.shutdown = vi.fn().mockResolvedValue(undefined);
      this.call = vi.fn();
      this.setOnProcessDeath = vi.fn();
      this.getMetrics = vi.fn();
      this.setConfig = vi.fn().mockResolvedValue(undefined);
      this.alive = true;
      this.id = null;
      this.displayName = null;
    }),
    registerProcessManager: mockRegisterProcessManager,
    unregisterProcessManager: mockUnregisterProcessManager,
    getProcessManager: vi.fn(),
    shutdownAllProcessManagers: vi.fn(),
    getAllProcessManagers: vi.fn(() => new Map()),
    getAllProcessMetrics: vi.fn(() => []),
  };
});

vi.mock("../code-plugin-adapter", () => ({
  CodePluginAdapter: vi.fn().mockImplementation(function (this: Record<string, unknown>, _manager: unknown, metadata: Record<string, unknown>) {
    this.id = "code-test-plugin";
    this.displayName = "Code Test Plugin";
    this.match = vi.fn(() => true);
    this.capabilities = metadata.capabilities || { video: true, image: true, text: true, vision: true };
    this.videoCapabilities = metadata.videoCapabilities || { supportsLastFrame: false, supportsReferenceVideo: false, supportsMimicryLevel: false, defaultModel: "v1", maxDuration: 10 };
    this.imageCapabilities = metadata.imageCapabilities || { supportsReferenceImage: false, defaultModel: "i1" };
    this.getModelCapabilities = vi.fn(() => ({ maxReferences: 4, maxResolution: 2048, maxSizeMB: 10, supportsLastFrame: false, referenceMode: "separate" as const }));
    this.buildVideoRequest = vi.fn(() => ({ body: {}, endpoint: "" }));
    this.buildImageRequest = vi.fn(() => ({ body: {}, endpoint: "" }));
    this.extractTaskId = vi.fn();
    this.extractVideoUrl = vi.fn();
    this.extractImageUrl = vi.fn();
    this.getVideoStatusEndpoint = vi.fn();
    this.buildTextRequest = vi.fn();
    this.buildVisionRequest = vi.fn();
    this.getImageTransportMode = vi.fn(() => "url");
    this.prepareImage = vi.fn();
    this.getAuthHeaders = vi.fn(() => ({}));
    this.getModelParameterProfile = vi.fn(() => ({
      modelId: "code-test-plugin",
      capabilities: { maxReferences: 4, maxResolution: 2048, maxSizeMB: 10, supportsLastFrame: false, referenceMode: "separate" },
      parameters: {},
    }));
    this.getAvailableModels = vi.fn(() => []);
    this.getApiKeyDetection = vi.fn(() => undefined);
  }),
}));

vi.mock("../logging/logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { PluginRegistry } from "../registry";
import { PluginProcessManager } from "../plugin-process-manager";
import type { AIProviderPlugin } from "../types";

function createMockPlugin(overrides: Partial<AIProviderPlugin> = {}): AIProviderPlugin {
  const id = overrides.id ?? `plugin-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    displayName: overrides.displayName ?? `Plugin ${id}`,
    match: overrides.match ?? (() => false),
    capabilities: overrides.capabilities ?? { video: true, image: true, text: true, vision: true },
    videoCapabilities: overrides.videoCapabilities ?? {
      supportsLastFrame: false,
      supportsReferenceVideo: false,
      supportsMimicryLevel: false,
      defaultModel: "model-1",
      maxDuration: 10,
    },
    imageCapabilities: overrides.imageCapabilities ?? {
      supportsReferenceImage: false,
      defaultModel: "model-1",
    },
    getModelCapabilities: overrides.getModelCapabilities ?? (() => ({
      maxReferences: 4,
      maxResolution: 2048,
      maxSizeMB: 10,
      supportsLastFrame: false,
      referenceMode: "separate" as const,
    })),
    buildVideoRequest: overrides.buildVideoRequest ?? (() => ({ body: {}, endpoint: "" })),
    buildImageRequest: overrides.buildImageRequest ?? (() => ({ body: {}, endpoint: "" })),
    extractTaskId: overrides.extractTaskId ?? (() => undefined),
    extractVideoUrl: overrides.extractVideoUrl ?? (() => undefined),
    extractImageUrl: overrides.extractImageUrl ?? (() => undefined),
    getVideoStatusEndpoint: overrides.getVideoStatusEndpoint ?? ((_base: string, taskId: string) => `/videos/${taskId}`),
    buildTextRequest: overrides.buildTextRequest ?? (() => ({ body: {}, endpoint: "" })),
    buildVisionRequest: overrides.buildVisionRequest ?? (() => ({ body: {}, endpoint: "" })),
    getImageTransportMode: overrides.getImageTransportMode ?? (() => "url"),
    prepareImage: overrides.prepareImage ?? (() => Promise.resolve(undefined)),
    getAuthHeaders: overrides.getAuthHeaders ?? (() => ({})),
    getModelParameterProfile: overrides.getModelParameterProfile ?? ((modelId: string) => ({
      modelId,
      capabilities: { maxReferences: 4, maxResolution: 2048, maxSizeMB: 10, supportsLastFrame: false, referenceMode: "separate" as const },
      parameters: {},
    })),
    getAvailableModels: overrides.getAvailableModels ?? (() => []),
    getApiKeyDetection: overrides.getApiKeyDetection ?? (() => undefined),
    ...overrides,
  } as AIProviderPlugin;
}

describe("PluginRegistry", () => {
  let registry: InstanceType<typeof PluginRegistry>;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new PluginRegistry();
  });

  describe("register() and unregister()", () => {
    it("should register a plugin and make it available via getAll()", () => {
      const plugin = createMockPlugin({ id: "test-plugin" });
      registry.register(plugin);

      expect(registry.getAll()).toHaveLength(1);
      expect(registry.getAll()[0]!.id).toBe("test-plugin");
    });

    it("should register multiple plugins", () => {
      const p1 = createMockPlugin({ id: "p1" });
      const p2 = createMockPlugin({ id: "p2" });
      registry.register(p1);
      registry.register(p2);

      expect(registry.getAll()).toHaveLength(2);
    });

    it("should register same ID plugin twice (no dedup)", () => {
      const p1 = createMockPlugin({ id: "same-id" });
      const p2 = createMockPlugin({ id: "same-id" });
      registry.register(p1);
      registry.register(p2);

      expect(registry.getAll()).toHaveLength(2);
    });

    it("should unregister a plugin by ID", () => {
      const plugin = createMockPlugin({ id: "to-remove" });
      registry.register(plugin);
      const result = registry.unregister("to-remove");

      expect(result).toBe(true);
      expect(registry.getAll()).toHaveLength(0);
    });

    it("should return false when unregistering non-existent plugin", () => {
      const result = registry.unregister("non-existent");
      expect(result).toBe(false);
    });

    it("should track user plugin IDs via isUserPlugin", () => {
      const plugin = createMockPlugin({ id: "user-p1" });
      registry.register(plugin, true);

      expect(registry.isUserPlugin("user-p1")).toBe(true);
      expect(registry.isUserPlugin("user-p1")).toBe(true);
    });

    it("should clear userPluginIds on unregister", () => {
      const plugin = createMockPlugin({ id: "user-p1" });
      registry.register(plugin, true);
      registry.unregister("user-p1");

      expect(registry.isUserPlugin("user-p1")).toBe(false);
    });
  });

  describe("select()", () => {
    it("should return the first matching plugin", () => {
      const p1 = createMockPlugin({ id: "p1", match: () => false });
      const p2 = createMockPlugin({ id: "p2", match: () => true });
      const p3 = createMockPlugin({ id: "p3", match: () => true });

      registry.register(p1);
      registry.register(p2);
      registry.register(p3);

      const selected = registry.select("https://api.example.com");
      expect(selected?.id).toBe("p2");
    });

    it("should return fallback when no plugin matches", () => {
      const fallback = createMockPlugin({ id: "fallback" });
      registry.setFallback(fallback);

      const p1 = createMockPlugin({ id: "p1", match: () => false });
      registry.register(p1);

      const selected = registry.select("https://unknown.com");
      expect(selected?.id).toBe("fallback");
    });

    it("should return undefined when no plugin matches and no fallback", () => {
      const p1 = createMockPlugin({ id: "p1", match: () => false });
      registry.register(p1);

      const selected = registry.select("https://unknown.com");
      expect(selected).toBeUndefined();
    });

    it("should return undefined when no plugins registered and no fallback", () => {
      const selected = registry.select("https://unknown.com");
      expect(selected).toBeUndefined();
    });

    it("should catch errors from match() and continue to next plugin", () => {
      const p1 = createMockPlugin({
        id: "error-plugin",
        match: () => { throw new Error("match error"); },
      });
      const p2 = createMockPlugin({ id: "p2", match: () => true });

      registry.register(p1);
      registry.register(p2);

      const selected = registry.select("https://api.example.com");
      expect(selected?.id).toBe("p2");
    });

    it("should pass apiUrl and model to match()", () => {
      const matchFn = vi.fn((_url: string, _model?: string) => true);
      const plugin = createMockPlugin({ id: "p1", match: matchFn });
      registry.register(plugin);

      registry.select("https://api.example.com", "gpt-4");
      expect(matchFn).toHaveBeenCalledWith("https://api.example.com", "gpt-4");
    });
  });

  describe("setFallback()", () => {
    it("should set a fallback plugin returned by select when no match", () => {
      const fallback = createMockPlugin({ id: "fallback-plugin" });
      registry.setFallback(fallback);

      const selected = registry.select("https://nothing-matches.com");
      expect(selected?.id).toBe("fallback-plugin");
    });
  });

  describe("selectById()", () => {
    it("should return plugin by ID", () => {
      const p1 = createMockPlugin({ id: "target" });
      const p2 = createMockPlugin({ id: "other" });
      registry.register(p1);
      registry.register(p2);

      expect(registry.selectById("target")?.id).toBe("target");
    });

    it("should return undefined for non-existent ID", () => {
      expect(registry.selectById("non-existent")).toBeUndefined();
    });
  });

  describe("getBuiltInPlugins() / getUserPlugins()", () => {
    it("should separate built-in and user plugins", () => {
      const builtIn = createMockPlugin({ id: "built-in" });
      const user = createMockPlugin({ id: "user-plugin" });

      registry.register(builtIn);
      registry.register(user, true);

      expect(registry.getBuiltInPlugins()).toHaveLength(1);
      expect(registry.getBuiltInPlugins()[0]!.id).toBe("built-in");
      expect(registry.getUserPlugins()).toHaveLength(1);
      expect(registry.getUserPlugins()[0]!.id).toBe("user-plugin");
    });
  });

  describe("getAllCapabilities()", () => {
    it("should aggregate capabilities from all registered plugins", () => {
      const p1 = createMockPlugin({
        id: "p1",
        capabilities: { video: true, image: false, text: false, vision: false },
      });
      const p2 = createMockPlugin({
        id: "p2",
        capabilities: { video: false, image: true, text: true, vision: false },
      });

      registry.register(p1);
      registry.register(p2);

      const caps = registry.getAllCapabilities();
      expect(Object.keys(caps)).toHaveLength(2);
      expect(caps["p1"]!.capabilities).toEqual({ video: true, image: false, text: false, vision: false });
      expect(caps["p2"]!.capabilities).toEqual({ video: false, image: true, text: true, vision: false });
    });

    it("should mark user and code plugins correctly", () => {
      const builtIn = createMockPlugin({ id: "built-in" });
      const user = createMockPlugin({ id: "user-p" });
      registry.register(builtIn);
      registry.register(user, true);

      const caps = registry.getAllCapabilities();
      expect(caps["built-in"]!.isUserPlugin).toBe(false);
      expect(caps["built-in"]!.isCodePlugin).toBe(false);
      expect(caps["user-p"]!.isUserPlugin).toBe(true);
      expect(caps["user-p"]!.isCodePlugin).toBe(false);
    });

    it("should return empty object when no plugins registered", () => {
      expect(registry.getAllCapabilities()).toEqual({});
    });
  });

  describe("getAllModelProfiles()", () => {
    it("should aggregate model profiles from all plugins", () => {
      const p1 = createMockPlugin({
        id: "p1",
        getAvailableModels: () => ["model-a", "model-b"],
        getModelParameterProfile: (modelId: string) => ({
          modelId,
          capabilities: { maxReferences: 4, maxResolution: 2048, maxSizeMB: 10, supportsLastFrame: false, referenceMode: "separate" as const },
          parameters: {},
        }),
      });

      registry.register(p1);

      const profiles = registry.getAllModelProfiles();
      expect(Object.keys(profiles)).toHaveLength(2);
      expect(profiles["model-a"]!.providerId).toBe("p1");
      expect(profiles["model-b"]!.providerId).toBe("p1");
    });

    it("should handle plugin with no available models", () => {
      const p1 = createMockPlugin({
        id: "p1",
        getAvailableModels: () => [],
      });

      registry.register(p1);
      expect(registry.getAllModelProfiles()).toEqual({});
    });

    it("should handle plugin without getAvailableModels", () => {
      const p1 = createMockPlugin({ id: "p1" });
      delete (p1 as Record<string, unknown>).getAvailableModels;

      registry.register(p1);
      expect(registry.getAllModelProfiles()).toEqual({});
    });
  });

  describe("reloadUserPlugins()", () => {
    it("should remove old user plugins and load new ones", () => {
      const oldUserPlugin = createMockPlugin({ id: "old-user" });
      registry.register(oldUserPlugin, true);

      const newUserPlugin = createMockPlugin({ id: "new-user" });
      mockLoadUserPlugins.mockReturnValue([newUserPlugin]);

      const result = registry.reloadUserPlugins();

      expect(result.loaded).toBe(1);
      expect(registry.getUserPlugins()).toHaveLength(1);
      expect(registry.getUserPlugins()[0]!.id).toBe("new-user");
    });

    it("should handle loadUserPlugins throwing an error", () => {
      mockLoadUserPlugins.mockImplementation(() => { throw new Error("disk error"); });

      const result = registry.reloadUserPlugins();

      expect(result.loaded).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("disk error");
    });
  });

  describe("loadCodePlugins()", () => {
    it("should load code plugins via process isolation", async () => {
      mockListCodePluginFiles.mockReturnValue(["/mock/code-plugins/test.plugin.js"]);
      mockScanCodePluginFile.mockReturnValue({ valid: true, errors: [] });

      (PluginProcessManager as unknown as ReturnType<typeof vi.fn>).mockImplementation(function (this: Record<string, unknown>) {
        this.load = vi.fn().mockResolvedValue({
          pluginId: "code-test-plugin",
          pluginDisplayName: "Code Test Plugin",
          metadata: {
            capabilities: { video: true, image: true, text: true, vision: true },
            videoCapabilities: { supportsLastFrame: false, supportsReferenceVideo: false, supportsMimicryLevel: false, defaultModel: "v1", maxDuration: 10 },
            imageCapabilities: { supportsReferenceImage: false, defaultModel: "i1" },
            availableModels: [],
          },
        });
        this.shutdown = vi.fn().mockResolvedValue(undefined);
        this.call = vi.fn();
        this.setOnProcessDeath = vi.fn();
        this.getMetrics = vi.fn();
        this.setConfig = vi.fn().mockResolvedValue(undefined);
        this.alive = true;
        this.id = null;
        this.displayName = null;
      });

      const result = await registry.loadCodePlugins();

      expect(result.loaded).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(mockRegisterProcessManager).toHaveBeenCalledWith("code-test-plugin", expect.anything());
    });

    it("should skip invalid code plugins and report errors", async () => {
      mockListCodePluginFiles.mockReturnValue(["/mock/code-plugins/bad.plugin.js"]);
      mockScanCodePluginFile.mockReturnValue({ valid: false, errors: ["invalid structure"] });

      const result = await registry.loadCodePlugins();

      expect(result.loaded).toBe(0);
      expect(result.errors).toContain("invalid structure");
    });

    it("should handle load failure and shutdown manager", async () => {
      mockListCodePluginFiles.mockReturnValue(["/mock/code-plugins/fail.plugin.js"]);
      mockScanCodePluginFile.mockReturnValue({ valid: true, errors: [] });

      (PluginProcessManager as unknown as ReturnType<typeof vi.fn>).mockImplementation(function (this: Record<string, unknown>) {
        this.load = vi.fn().mockRejectedValue(new Error("spawn failed"));
        this.shutdown = vi.fn().mockResolvedValue(undefined);
        this.call = vi.fn();
        this.setOnProcessDeath = vi.fn();
        this.getMetrics = vi.fn();
        this.setConfig = vi.fn().mockResolvedValue(undefined);
        this.alive = true;
        this.id = null;
        this.displayName = null;
      });

      const result = await registry.loadCodePlugins();

      expect(result.loaded).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("spawn failed");
    });

    it("should remove old code plugins before loading new ones", async () => {
      const oldCodePlugin = createMockPlugin({ id: "old-code" });
      registry.register(oldCodePlugin);
      (registry as unknown as Record<string, unknown>).codePluginIds = new Set(["old-code"]);

      mockListCodePluginFiles.mockReturnValue([]);

      await registry.loadCodePlugins();

      expect(registry.getAll().find((p) => p.id === "old-code")).toBeUndefined();
      expect(mockUnregisterProcessManager).toHaveBeenCalledWith("old-code");
    });
  });

  describe("getCodePlugins()", () => {
    it("should return only code plugins", () => {
      const builtIn = createMockPlugin({ id: "built-in" });
      registry.register(builtIn);

      const codePlugin = createMockPlugin({ id: "code-p" });
      registry.register(codePlugin);
      (registry as unknown as Record<string, unknown>).codePluginIds = new Set(["code-p"]);

      expect(registry.getCodePlugins()).toHaveLength(1);
      expect(registry.getCodePlugins()[0]!.id).toBe("code-p");
    });
  });

  describe("isCodePlugin()", () => {
    it("should return true for code plugin IDs", () => {
      const plugin = createMockPlugin({ id: "code-p" });
      registry.register(plugin);
      (registry as unknown as Record<string, unknown>).codePluginIds = new Set(["code-p"]);

      expect(registry.isCodePlugin("code-p")).toBe(true);
      expect(registry.isCodePlugin("built-in")).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("should handle select with no plugins registered", () => {
      expect(registry.select("https://any.com")).toBeUndefined();
    });

    it("should handle getAll with empty registry", () => {
      expect(registry.getAll()).toEqual([]);
    });

    it("should handle getBuiltInPlugins with empty registry", () => {
      expect(registry.getBuiltInPlugins()).toEqual([]);
    });

    it("should handle getUserPlugins with empty registry", () => {
      expect(registry.getUserPlugins()).toEqual([]);
    });

    it("should handle getCodePlugins with empty registry", () => {
      expect(registry.getCodePlugins()).toEqual([]);
    });
  });
});
