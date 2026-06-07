import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockProcessManager } = vi.hoisted(() => {
  const manager = {
    call: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
    restart: vi.fn().mockResolvedValue({ pluginId: "test-plugin", pluginDisplayName: "Test", metadata: {} }),
    alive: true,
    setOnProcessDeath: vi.fn(),
    getMetrics: vi.fn().mockReturnValue({
      pluginId: "test-plugin",
      alive: true,
      ready: true,
      totalCalls: 0,
      failedCalls: 0,
      timedOutCalls: 0,
      avgCallDurationMs: 0,
      lastCallAt: null,
      crashCount: 0,
      uptimeMs: 1000,
      pid: 12345,
    }),
  };
  return { mockProcessManager: manager };
});

vi.mock("../plugin-process-manager", () => ({
  PluginProcessManager: vi.fn(() => mockProcessManager),
  getProcessManager: vi.fn(),
  registerProcessManager: vi.fn(),
  unregisterProcessManager: vi.fn(),
  shutdownAllProcessManagers: vi.fn(),
  getAllProcessManagers: vi.fn(() => new Map()),
  getAllProcessMetrics: vi.fn(() => []),
}));

vi.mock("../logging/logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { CodePluginAdapter } from "../code-plugin-adapter";
import type { CodePluginExport } from "../code-plugin-loader";

function createPluginExport(overrides: Partial<CodePluginExport> = {}): CodePluginExport {
  return {
    id: "test-plugin",
    displayName: "Test Plugin",
    match: vi.fn(() => true),
    videoCapabilities: {
      supportsLastFrame: false,
      supportsReferenceVideo: false,
      supportsMimicryLevel: false,
      defaultModel: "v1",
      maxDuration: 10,
    },
    imageCapabilities: {
      supportsReferenceImage: false,
      defaultModel: "i1",
    },
    getModelCapabilities: vi.fn(() => ({
      maxReferences: 4,
      maxResolution: 2048,
      maxSizeMB: 10,
      supportsLastFrame: false,
      referenceMode: "separate",
    })),
    buildVideoRequest: vi.fn(() => ({ body: { prompt: "test" }, endpoint: "/api/video" })),
    buildImageRequest: vi.fn(() => ({ body: {}, endpoint: "/api/image" })),
    extractTaskId: vi.fn(() => "task-123"),
    extractVideoUrl: vi.fn(() => "https://example.com/video.mp4"),
    extractImageUrl: vi.fn(() => "https://example.com/image.png"),
    getVideoStatusEndpoint: vi.fn(() => "/api/status/"),
    getAuthHeaders: vi.fn(() => ({ Authorization: "Bearer key" })),
    getModelParameterProfile: vi.fn(() => ({
      modelId: "v1",
      capabilities: { maxReferences: 4, maxResolution: 2048, maxSizeMB: 10, supportsLastFrame: false, referenceMode: "separate" },
      parameters: { durations: [], resolutions: [], styles: [], negativePrompt: false, seed: false },
    })),
    getAvailableModels: vi.fn(() => ["v1", "v2"]),
    getApiKeyDetection: vi.fn(() => ({
      rules: [{ pattern: "^sk-test-", confidence: "high" as const }],
      suggestedName: "Test Provider",
      baseUrl: "https://api.test.com",
    })),
    preferLocalData: true,
    ...overrides,
  } as unknown as CodePluginExport;
}

describe("CodePluginAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("sandbox mode", () => {
    it("should use pluginExport directly for sync methods", () => {
      const pluginExport = createPluginExport();
      const adapter = new CodePluginAdapter(pluginExport);

      expect(adapter.id).toBe("test-plugin");
      expect(adapter.displayName).toBe("Test Plugin");
      expect(adapter.isolationMode).toBe("sandbox");
    });

    it("should delegate match() to pluginExport", () => {
      const pluginExport = createPluginExport();
      const adapter = new CodePluginAdapter(pluginExport);

      expect(adapter.match("https://api.test.com", "v1")).toBe(true);
      expect(pluginExport.match).toHaveBeenCalledWith("https://api.test.com", "v1");
    });

    it("should delegate buildVideoRequest() to pluginExport", () => {
      const pluginExport = createPluginExport();
      const adapter = new CodePluginAdapter(pluginExport);

      const ctx = { prompt: "hello", duration: 5 };
      const result = adapter.buildVideoRequest(ctx as never);
      expect(result.body).toEqual({ prompt: "test" });
      expect(result.endpoint).toBe("/api/video");
    });

    it("should return fallback when method throws", () => {
      const pluginExport = createPluginExport({
        buildVideoRequest: vi.fn(() => { throw new Error("boom"); }),
      });
      const adapter = new CodePluginAdapter(pluginExport);

      const result = adapter.buildVideoRequest({ prompt: "test", duration: 5 } as never);
      expect(result.body).toEqual({});
      expect(result.endpoint).toBe("");
    });

    it("should use cached metadata when available", () => {
      const pluginExport = createPluginExport();
      const cached = {
        videoCapabilities: { supportsLastFrame: true, supportsReferenceVideo: true, supportsMimicryLevel: false, defaultModel: "cached", maxDuration: 20 },
        imageCapabilities: { supportsReferenceImage: true, defaultModel: "cached-img" },
        availableModels: ["cached1", "cached2"],
        apiKeyDetection: {
          rules: [{ pattern: "^cached-", confidence: "high" as const }],
          suggestedName: "Cached Provider",
          baseUrl: "https://cached.com",
        },
        preferLocalData: false,
      };

      const adapter = new CodePluginAdapter(pluginExport, undefined, cached);

      expect(adapter.videoCapabilities.defaultModel).toBe("cached");
      expect(adapter.imageCapabilities.defaultModel).toBe("cached-img");
      expect(adapter.getAvailableModels()).toEqual(["cached1", "cached2"]);
      expect(adapter.getApiKeyDetection()?.suggestedName).toBe("Cached Provider");
      expect(adapter.preferLocalData).toBe(false);
    });

    it("should fallback to base class when extractTaskId returns undefined", () => {
      const pluginExport = createPluginExport({
        extractTaskId: vi.fn(() => undefined),
      });
      const adapter = new CodePluginAdapter(pluginExport);

      const result = adapter.extractTaskId({ id: "base-task" });
      expect(result).toBe("base-task");
    });
  });

  describe("process mode", () => {
    it("should use IPC for async methods", async () => {
      const pluginExport = createPluginExport();
      mockProcessManager.call.mockResolvedValue({ body: { ipc: true }, endpoint: "/ipc" });

      const adapter = new CodePluginAdapter(pluginExport, mockProcessManager as never);
      expect(adapter.isolationMode).toBe("process");

      const result = await adapter.buildVideoRequestAsync!({ prompt: "test", duration: 5 } as never);
      expect(mockProcessManager.call).toHaveBeenCalledWith("buildVideoRequest", [{ prompt: "test", duration: 5 }]);
      expect(result).toEqual({ body: { ipc: true }, endpoint: "/ipc" });
    });

    it("should fallback to sync on IPC failure", async () => {
      const pluginExport = createPluginExport();
      mockProcessManager.call.mockRejectedValue(new Error("IPC fail"));

      const adapter = new CodePluginAdapter(pluginExport, mockProcessManager as never);

      const result = await adapter.buildVideoRequestAsync!({ prompt: "test", duration: 5 } as never);
      expect(result.body).toEqual({ prompt: "test" });
      expect(result.endpoint).toBe("/api/video");
    });

    it("should delegate getAuthHeadersAsync to IPC with config sync", async () => {
      const pluginExport = createPluginExport();
      mockProcessManager.call.mockResolvedValue({ "X-Custom": "header" });
      mockProcessManager.setConfig = vi.fn().mockResolvedValue(undefined);

      const adapter = new CodePluginAdapter(pluginExport, mockProcessManager as never);

      const result = await adapter.getAuthHeadersAsync!("key123");
      expect(mockProcessManager.setConfig).toHaveBeenCalledWith({ apiKey: "key123" });
      expect(mockProcessManager.call).toHaveBeenCalledWith("getAuthHeaders", ["key123", undefined]);
      expect(result).toEqual({ "X-Custom": "header" });
    });

    it("should not re-sync same apiKey to Worker", async () => {
      const pluginExport = createPluginExport();
      mockProcessManager.call.mockResolvedValue({ Authorization: "Bearer key" });
      mockProcessManager.setConfig = vi.fn().mockResolvedValue(undefined);

      const adapter = new CodePluginAdapter(pluginExport, mockProcessManager as never);

      await adapter.getAuthHeadersAsync!("key123");
      await adapter.getAuthHeadersAsync!("key123");

      expect(mockProcessManager.setConfig).toHaveBeenCalledTimes(1);
    });

    it("should delegate extractTaskIdAsync to IPC", async () => {
      const pluginExport = createPluginExport();
      mockProcessManager.call.mockResolvedValue("ipc-task-id");

      const adapter = new CodePluginAdapter(pluginExport, mockProcessManager as never);

      const result = await adapter.extractTaskIdAsync!({ id: "x" });
      expect(result).toBe("ipc-task-id");
    });

    it("should delegate extractVideoUrlAsync to IPC", async () => {
      const pluginExport = createPluginExport();
      mockProcessManager.call.mockResolvedValue("https://ipc.example.com/video.mp4");

      const adapter = new CodePluginAdapter(pluginExport, mockProcessManager as never);

      const result = await adapter.extractVideoUrlAsync!({});
      expect(result).toBe("https://ipc.example.com/video.mp4");
    });

    it("should delegate extractImageUrlAsync to IPC", async () => {
      const pluginExport = createPluginExport();
      mockProcessManager.call.mockResolvedValue("https://ipc.example.com/img.png");

      const adapter = new CodePluginAdapter(pluginExport, mockProcessManager as never);

      const result = await adapter.extractImageUrlAsync!({});
      expect(result).toBe("https://ipc.example.com/img.png");
    });

    it("should delegate extractStatusAsync to IPC", async () => {
      const pluginExport = createPluginExport();
      mockProcessManager.call.mockResolvedValue({ status: "completed", progress: 100 });

      const adapter = new CodePluginAdapter(pluginExport, mockProcessManager as never);

      const result = await adapter.extractStatusAsync!({});
      expect(result).toEqual({ status: "completed", progress: 100 });
    });

    it("should delegate extractTextContentAsync to IPC", async () => {
      const pluginExport = createPluginExport();
      mockProcessManager.call.mockResolvedValue("extracted text");

      const adapter = new CodePluginAdapter(pluginExport, mockProcessManager as never);

      const result = await adapter.extractTextContentAsync!({});
      expect(result).toBe("extracted text");
    });

    it("should delegate getVideoStatusEndpointAsync to IPC", async () => {
      const pluginExport = createPluginExport();
      mockProcessManager.call.mockResolvedValue("/ipc/status/");

      const adapter = new CodePluginAdapter(pluginExport, mockProcessManager as never);

      const result = await adapter.getVideoStatusEndpointAsync!("https://api.com", "task1");
      expect(result).toBe("/ipc/status/");
    });

    it("should delegate getModelCapabilitiesAsync to IPC", async () => {
      const pluginExport = createPluginExport();
      mockProcessManager.call.mockResolvedValue({ maxReferences: 8, maxResolution: 4096, maxSizeMB: 20, supportsLastFrame: true, referenceMode: "merged" });

      const adapter = new CodePluginAdapter(pluginExport, mockProcessManager as never);

      const result = await adapter.getModelCapabilitiesAsync!("model-x");
      expect(result.maxReferences).toBe(8);
    });

    it("should delegate getModelParameterProfileAsync to IPC", async () => {
      const pluginExport = createPluginExport();
      const profile = { modelId: "x", capabilities: {}, parameters: {} };
      mockProcessManager.call.mockResolvedValue(profile);

      const adapter = new CodePluginAdapter(pluginExport, mockProcessManager as never);

      const result = await adapter.getModelParameterProfileAsync!("x");
      expect(result.modelId).toBe("x");
    });

    it("should delegate getAvailableModelsAsync to IPC", async () => {
      const pluginExport = createPluginExport();
      mockProcessManager.call.mockResolvedValue(["ipc-model-1", "ipc-model-2"]);

      const adapter = new CodePluginAdapter(pluginExport, mockProcessManager as never);

      const result = await adapter.getAvailableModelsAsync!();
      expect(result).toEqual(["ipc-model-1", "ipc-model-2"]);
    });

    it("should delegate getApiKeyDetectionAsync to IPC", async () => {
      const pluginExport = createPluginExport();
      const detection = { rules: [{ pattern: "^ipc-", confidence: "high" }], suggestedName: "IPC Provider", baseUrl: "https://ipc.com" };
      mockProcessManager.call.mockResolvedValue(detection);

      const adapter = new CodePluginAdapter(pluginExport, mockProcessManager as never);

      const result = await adapter.getApiKeyDetectionAsync!();
      expect(result?.suggestedName).toBe("IPC Provider");
    });

    it("should delegate getCloudInfoAsync to IPC", async () => {
      const pluginExport = createPluginExport();
      const cloudInfo = { name: "IPC Cloud", websiteUrl: "https://cloud.com" };
      mockProcessManager.call.mockResolvedValue(cloudInfo);

      const adapter = new CodePluginAdapter(pluginExport, mockProcessManager as never);

      const result = await adapter.getCloudInfoAsync!("https://cloud.com");
      expect(result?.name).toBe("IPC Cloud");
    });

    it("should register process death callback", () => {
      const pluginExport = createPluginExport();
      const _adapter = new CodePluginAdapter(pluginExport, mockProcessManager as never);
      expect(mockProcessManager.setOnProcessDeath).toHaveBeenCalledWith(expect.any(Function));
    });

    it("should attempt restart on process death", async () => {
      const pluginExport = createPluginExport();
      new CodePluginAdapter(pluginExport, mockProcessManager as never);

      const deathCallback = mockProcessManager.setOnProcessDeath.mock.calls[0]![0] as () => void;
      deathCallback();

      expect(mockProcessManager.restart).toHaveBeenCalledTimes(1);
    });

    it("should not restart concurrently", async () => {
      const pluginExport = createPluginExport();
      mockProcessManager.restart.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));

      new CodePluginAdapter(pluginExport, mockProcessManager as never);

      const deathCallback = mockProcessManager.setOnProcessDeath.mock.calls[0]![0] as () => void;
      deathCallback();
      deathCallback();

      expect(mockProcessManager.restart).toHaveBeenCalledTimes(1);
    });

    it("should shutdown process via shutdownProcess()", async () => {
      const pluginExport = createPluginExport();
      const adapter = new CodePluginAdapter(pluginExport, mockProcessManager as never);

      await adapter.shutdownProcess();
      expect(mockProcessManager.shutdown).toHaveBeenCalled();
    });

    it("should not throw on shutdownProcess in sandbox mode", async () => {
      const pluginExport = createPluginExport();
      const adapter = new CodePluginAdapter(pluginExport);

      await expect(adapter.shutdownProcess()).resolves.toBeUndefined();
    });
  });
});
