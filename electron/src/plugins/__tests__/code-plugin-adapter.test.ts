import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockProcessManager } = vi.hoisted(() => {
  const manager = {
    call: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
    restart: vi.fn().mockResolvedValue({ pluginId: "test-plugin", pluginDisplayName: "Test Plugin", metadata: {} }),
    alive: true,
    id: "test-plugin",
    displayName: "Test Plugin",
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
    setConfig: vi.fn().mockResolvedValue(undefined),
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

function createMetadata(overrides: Record<string, unknown> = {}) {
  return {
    capabilities: {
      video: true,
      image: true,
      text: true,
      vision: true,
    },
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
    availableModels: ["v1", "v2"],
    apiKeyDetection: {
      rules: [{ pattern: "^sk-test-", confidence: "high" as const }],
      suggestedName: "Test Provider",
      baseUrl: "https://api.test.com",
    },
    preferLocalData: true,
    matchPatterns: [
      { urlPattern: "api.test.com", modelPattern: undefined },
    ],
    ...overrides,
  };
}

describe("CodePluginAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should use processManager id and displayName", () => {
      const adapter = new CodePluginAdapter(mockProcessManager as never, createMetadata());

      expect(adapter.id).toBe("test-plugin");
      expect(adapter.displayName).toBe("Test Plugin");
    });

    it("should register process death callback", () => {
      const _adapter = new CodePluginAdapter(mockProcessManager as never, createMetadata());
      expect(mockProcessManager.setOnProcessDeath).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe("match() with matchPatterns", () => {
    it("should match URL when matchPatterns contain matching urlPattern", () => {
      const adapter = new CodePluginAdapter(mockProcessManager as never, createMetadata());

      expect(adapter.match("https://api.test.com/v1/generate", "v1")).toBe(true);
    });

    it("should not match URL when no urlPattern matches", () => {
      const adapter = new CodePluginAdapter(mockProcessManager as never, createMetadata());

      expect(adapter.match("https://api.other.com/v1/generate", "v1")).toBe(false);
    });

    it("should match URL with modelPattern", () => {
      const metadata = createMetadata({
        matchPatterns: [
          { urlPattern: "api.test.com", modelPattern: "v2" },
        ],
      });
      const adapter = new CodePluginAdapter(mockProcessManager as never, metadata);

      expect(adapter.match("https://api.test.com/v1/generate", "v2")).toBe(true);
      expect(adapter.match("https://api.test.com/v1/generate", "v1")).toBe(false);
    });

    it("should return false when matchPatterns is empty", () => {
      const metadata = createMetadata({ matchPatterns: [] });
      const adapter = new CodePluginAdapter(mockProcessManager as never, metadata);

      expect(adapter.match("https://api.test.com/v1/generate")).toBe(false);
    });

    it("should return false when matchPatterns is undefined", () => {
      const metadata = createMetadata({ matchPatterns: undefined });
      const adapter = new CodePluginAdapter(mockProcessManager as never, metadata);

      expect(adapter.match("https://api.test.com/v1/generate")).toBe(false);
    });
  });

  describe("cached metadata accessors", () => {
    it("should return cached videoCapabilities", () => {
      const adapter = new CodePluginAdapter(mockProcessManager as never, createMetadata());
      expect(adapter.videoCapabilities.defaultModel).toBe("v1");
    });

    it("should return cached imageCapabilities", () => {
      const adapter = new CodePluginAdapter(mockProcessManager as never, createMetadata());
      expect(adapter.imageCapabilities.defaultModel).toBe("i1");
    });

    it("should return cached availableModels", () => {
      const adapter = new CodePluginAdapter(mockProcessManager as never, createMetadata());
      expect(adapter.getAvailableModels()).toEqual(["v1", "v2"]);
    });

    it("should return cached apiKeyDetection", () => {
      const adapter = new CodePluginAdapter(mockProcessManager as never, createMetadata());
      expect(adapter.getApiKeyDetection()?.suggestedName).toBe("Test Provider");
    });

    it("should return cached preferLocalData", () => {
      const adapter = new CodePluginAdapter(mockProcessManager as never, createMetadata());
      expect(adapter.preferLocalData).toBe(true);
    });

    it("should return cached matchPatterns", () => {
      const adapter = new CodePluginAdapter(mockProcessManager as never, createMetadata());
      expect(adapter.matchPatterns).toEqual([{ urlPattern: "api.test.com", modelPattern: undefined }]);
    });

    it("should return cached capabilities", () => {
      const adapter = new CodePluginAdapter(mockProcessManager as never, createMetadata());
      expect(adapter.capabilities).toEqual({ video: true, image: true, text: true, vision: true });
    });

    it("should return overridden capabilities", () => {
      const metadata = createMetadata({
        capabilities: { video: true, image: false, text: true, vision: false },
      });
      const adapter = new CodePluginAdapter(mockProcessManager as never, metadata);
      expect(adapter.capabilities).toEqual({ video: true, image: false, text: true, vision: false });
    });
  });

  describe("async IPC methods", () => {
    it("should delegate buildVideoRequestAsync to IPC", async () => {
      mockProcessManager.call.mockResolvedValue({ body: { ipc: true }, endpoint: "/ipc" });
      const adapter = new CodePluginAdapter(mockProcessManager as never, createMetadata());

      const result = await adapter.buildVideoRequestAsync!({ prompt: "test", duration: 5 } as never);
      expect(mockProcessManager.call).toHaveBeenCalledWith("buildVideoRequest", [{ prompt: "test", duration: 5 }]);
      expect(result).toEqual({ body: { ipc: true }, endpoint: "/ipc" });
    });

    it("should delegate buildImageRequestAsync to IPC", async () => {
      mockProcessManager.call.mockResolvedValue({ body: {}, endpoint: "/ipc-img" });
      const adapter = new CodePluginAdapter(mockProcessManager as never, createMetadata());

      const result = await adapter.buildImageRequestAsync!({ prompt: "test", size: "1:1", referenceImages: [] } as never);
      expect(mockProcessManager.call).toHaveBeenCalledWith("buildImageRequest", [expect.any(Object)]);
      expect(result.endpoint).toBe("/ipc-img");
    });

    it("should delegate getAuthHeadersAsync to IPC with config sync", async () => {
      mockProcessManager.call.mockResolvedValue({ "X-Custom": "header" });
      const adapter = new CodePluginAdapter(mockProcessManager as never, createMetadata());

      const result = await adapter.getAuthHeadersAsync!("key123");
      expect(mockProcessManager.setConfig).toHaveBeenCalledWith({ apiKey: "key123" });
      expect(mockProcessManager.call).toHaveBeenCalledWith("getAuthHeaders", ["key123", undefined]);
      expect(result).toEqual({ "X-Custom": "header" });
    });

    it("should not re-sync same apiKey to Worker", async () => {
      mockProcessManager.call.mockResolvedValue({ Authorization: "Bearer key" });
      const adapter = new CodePluginAdapter(mockProcessManager as never, createMetadata());

      await adapter.getAuthHeadersAsync!("key123");
      await adapter.getAuthHeadersAsync!("key123");

      expect(mockProcessManager.setConfig).toHaveBeenCalledTimes(1);
    });

    it("should delegate extractTaskIdAsync to IPC", async () => {
      mockProcessManager.call.mockResolvedValue("ipc-task-id");
      const adapter = new CodePluginAdapter(mockProcessManager as never, createMetadata());

      const result = await adapter.extractTaskIdAsync!({ id: "x" });
      expect(result).toBe("ipc-task-id");
    });

    it("should delegate extractVideoUrlAsync to IPC", async () => {
      mockProcessManager.call.mockResolvedValue("https://ipc.example.com/video.mp4");
      const adapter = new CodePluginAdapter(mockProcessManager as never, createMetadata());

      const result = await adapter.extractVideoUrlAsync!({});
      expect(result).toBe("https://ipc.example.com/video.mp4");
    });

    it("should delegate extractImageUrlAsync to IPC", async () => {
      mockProcessManager.call.mockResolvedValue("https://ipc.example.com/img.png");
      const adapter = new CodePluginAdapter(mockProcessManager as never, createMetadata());

      const result = await adapter.extractImageUrlAsync!({});
      expect(result).toBe("https://ipc.example.com/img.png");
    });

    it("should delegate extractStatusAsync to IPC", async () => {
      mockProcessManager.call.mockResolvedValue({ status: "completed", progress: 100 });
      const adapter = new CodePluginAdapter(mockProcessManager as never, createMetadata());

      const result = await adapter.extractStatusAsync!({});
      expect(result).toEqual({ status: "completed", progress: 100 });
    });

    it("should delegate extractTextContentAsync to IPC", async () => {
      mockProcessManager.call.mockResolvedValue("extracted text");
      const adapter = new CodePluginAdapter(mockProcessManager as never, createMetadata());

      const result = await adapter.extractTextContentAsync!({});
      expect(result).toBe("extracted text");
    });

    it("should delegate getVideoStatusEndpointAsync to IPC", async () => {
      mockProcessManager.call.mockResolvedValue("/ipc/status/");
      const adapter = new CodePluginAdapter(mockProcessManager as never, createMetadata());

      const result = await adapter.getVideoStatusEndpointAsync!("https://api.com", "task1");
      expect(result).toBe("/ipc/status/");
    });

    it("should delegate getModelCapabilitiesAsync to IPC", async () => {
      mockProcessManager.call.mockResolvedValue({ maxReferences: 8, maxResolution: 4096, maxSizeMB: 20, supportsLastFrame: true, referenceMode: "merged" });
      const adapter = new CodePluginAdapter(mockProcessManager as never, createMetadata());

      const result = await adapter.getModelCapabilitiesAsync!("model-x");
      expect(result.maxReferences).toBe(8);
    });

    it("should delegate getModelParameterProfileAsync to IPC", async () => {
      const profile = { modelId: "x", capabilities: {}, parameters: {} };
      mockProcessManager.call.mockResolvedValue(profile);
      const adapter = new CodePluginAdapter(mockProcessManager as never, createMetadata());

      const result = await adapter.getModelParameterProfileAsync!("x");
      expect(result.modelId).toBe("x");
    });

    it("should delegate getAvailableModelsAsync to IPC", async () => {
      mockProcessManager.call.mockResolvedValue(["ipc-model-1", "ipc-model-2"]);
      const adapter = new CodePluginAdapter(mockProcessManager as never, createMetadata());

      const result = await adapter.getAvailableModelsAsync!();
      expect(result).toEqual(["ipc-model-1", "ipc-model-2"]);
    });

    it("should delegate getApiKeyDetectionAsync to IPC", async () => {
      const detection = { rules: [{ pattern: "^ipc-", confidence: "high" }], suggestedName: "IPC Provider", baseUrl: "https://ipc.com" };
      mockProcessManager.call.mockResolvedValue(detection);
      const adapter = new CodePluginAdapter(mockProcessManager as never, createMetadata());

      const result = await adapter.getApiKeyDetectionAsync!();
      expect(result?.suggestedName).toBe("IPC Provider");
    });

    it("should delegate getCloudInfoAsync to IPC", async () => {
      const cloudInfo = { name: "IPC Cloud", websiteUrl: "https://cloud.com" };
      mockProcessManager.call.mockResolvedValue(cloudInfo);
      const adapter = new CodePluginAdapter(mockProcessManager as never, createMetadata());

      const result = await adapter.getCloudInfoAsync!("https://cloud.com");
      expect(result?.name).toBe("IPC Cloud");
    });

    it("should delegate buildTextRequestAsync to IPC", async () => {
      mockProcessManager.call.mockResolvedValue({ body: {}, endpoint: "/ipc/text" });
      const adapter = new CodePluginAdapter(mockProcessManager as never, createMetadata());

      const result = await adapter.buildTextRequestAsync!({ prompt: "test", maxTokens: 100, temperature: 0.5 } as never);
      expect(result.endpoint).toBe("/ipc/text");
    });

    it("should delegate buildVisionRequestAsync to IPC", async () => {
      mockProcessManager.call.mockResolvedValue({ body: {}, endpoint: "/ipc/vision" });
      const adapter = new CodePluginAdapter(mockProcessManager as never, createMetadata());

      const result = await adapter.buildVisionRequestAsync!({ prompt: "test", imageUrl: "https://img.com/x.png" } as never);
      expect(result.endpoint).toBe("/ipc/vision");
    });
  });

  describe("process lifecycle", () => {
    it("should attempt restart on process death", async () => {
      new CodePluginAdapter(mockProcessManager as never, createMetadata());

      const deathCallback = mockProcessManager.setOnProcessDeath.mock.calls[0]![0] as () => void;
      deathCallback();

      expect(mockProcessManager.restart).toHaveBeenCalledTimes(1);
    });

    it("should not restart concurrently", async () => {
      mockProcessManager.restart.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));

      new CodePluginAdapter(mockProcessManager as never, createMetadata());

      const deathCallback = mockProcessManager.setOnProcessDeath.mock.calls[0]![0] as () => void;
      deathCallback();
      deathCallback();

      expect(mockProcessManager.restart).toHaveBeenCalledTimes(1);
    });

    it("should shutdown process via shutdownProcess()", async () => {
      const adapter = new CodePluginAdapter(mockProcessManager as never, createMetadata());

      await adapter.shutdownProcess();
      expect(mockProcessManager.shutdown).toHaveBeenCalled();
    });
  });
});
