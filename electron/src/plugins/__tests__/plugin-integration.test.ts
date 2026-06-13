import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { UserPluginAdapter } from "../user-plugin-loader";
import type { UserPluginConfig } from "../user-plugin-schema";

const FIXTURES_DIR = path.join(__dirname, "fixtures");

function loadFixtureConfig(filename: string): UserPluginConfig {
  const filePath = path.join(FIXTURES_DIR, filename);
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content) as UserPluginConfig;
}

function loadFixtureCode(filename: string): Record<string, unknown> {
  const filePath = path.join(FIXTURES_DIR, filename);
  const content = fs.readFileSync(filePath, "utf-8");
  const moduleExports: Record<string, unknown> = {};
  const mockModule = { exports: moduleExports };
  const fn = new Function("module", "exports", content);
  fn.call(moduleExports, mockModule, moduleExports);
  return mockModule.exports as Record<string, unknown>;
}

describe("Plugin System Integration Tests", () => {
  describe("Declarative Plugin (.plugin.json)", () => {
    let config: UserPluginConfig;
    let adapter: UserPluginAdapter;

    beforeEach(() => {
      config = loadFixtureConfig("test-declarative-provider.plugin.json");
      adapter = new UserPluginAdapter(config);
    });

    it("should load and parse .plugin.json fixture", () => {
      expect(config.id).toBe("test-declarative-provider");
      expect(config.version).toBe("1.0.0");
      expect(config.displayName).toBe("Test Declarative Provider");
    });

    it("should create UserPluginAdapter from fixture config", () => {
      expect(adapter.id).toBe("test-declarative-provider");
      expect(adapter.displayName).toBe("Test Declarative Provider");
    });

    it("should report correct capabilities", () => {
      expect(adapter.capabilities).toEqual({
        video: true,
        image: true,
        text: true,
        vision: true,
      });
    });

    it("should match configured URL patterns", () => {
      expect(adapter.match("https://test-declarative.example.com/v1/generate")).toBe(true);
      expect(adapter.match("https://other.example.com/v1/generate")).toBe(false);
    });

    it("should match configured model patterns", () => {
      expect(adapter.match("https://test-declarative.example.com/v1", "test-video-model")).toBe(true);
      expect(adapter.match("https://test-declarative.example.com/v1", "other-model")).toBe(false);
    });

    it("should build video request with flat format", () => {
      const result = adapter.buildVideoRequest({
        prompt: "a dancing cat",
        model: "test-video-model",
        duration: 5,
      });

      expect(result.body).toMatchObject({
        prompt: "a dancing cat",
        model: "test-video-model",
        duration: 5,
        watermark: false,
      });
      expect(result.endpoint).toBe("/v1/videos/generations");
      expect(result).not.toHaveProperty("notSupported");
    });

    it("should build image request with openai format", () => {
      const result = adapter.buildImageRequest({
        prompt: "a beautiful sunset",
        model: "test-image-model",
        size: "1024x1024",
        referenceImages: [],
      });

      expect(result.body).toMatchObject({
        prompt: "a beautiful sunset",
        model: "test-image-model",
        size: "1024x1024",
        n: 1,
      });
      expect(result.endpoint).toBe("/v1/images/generations");
    });

    it("should extract task ID from response", () => {
      const taskId = adapter.extractTaskId({ id: "task-abc-123" });
      expect(taskId).toBe("task-abc-123");
    });

    it("should extract video URL from response", () => {
      const url = adapter.extractVideoUrl({ data: { video_url: "https://cdn.example.com/video.mp4" } });
      expect(url).toBe("https://cdn.example.com/video.mp4");
    });

    it("should extract image URL from response", () => {
      const url = adapter.extractImageUrl({ data: [{ url: "https://cdn.example.com/img.png" }] });
      expect(url).toBe("https://cdn.example.com/img.png");
    });

    it("should extract error from response", () => {
      const err = adapter.extractError({ error: { message: "rate limited", code: "429" } });
      expect(err).toEqual({ message: "rate limited", code: "429" });
    });

    it("should return Bearer auth headers", () => {
      const headers = adapter.getAuthHeaders("tdk-testkey12345678901234");
      expect(headers).toEqual({ Authorization: "Bearer tdk-testkey12345678901234" });
    });

    it("should return video status endpoint with template", () => {
      const endpoint = adapter.getVideoStatusEndpoint("https://test-declarative.example.com", "task-123");
      expect(endpoint).toBe("/v1/videos/task-123");
    });

    it("should return API key detection rules", () => {
      const detection = adapter.getApiKeyDetection();
      expect(detection).toBeDefined();
      expect(detection!.rules).toHaveLength(1);
      expect(detection!.rules[0]!.pattern).toBe("^tdk-[a-zA-Z0-9]{20,}$");
      expect(detection!.suggestedName).toBe("Test Declarative Provider");
      expect(detection!.baseUrl).toBe("https://test-declarative.example.com/v1");
    });

    it("should return model parameter profiles", () => {
      const profile = adapter.getModelParameterProfile("test-video-model");
      expect(profile.modelId).toBe("test-video-model");
      expect(profile.displayName).toBe("Test Video Model");
      expect(profile.parameters.durations).toHaveLength(2);
      expect(profile.parameters.negativePrompt).toBe(true);
      expect(profile.parameters.seed).toBe(false);
    });

    it("should return available models", () => {
      const models = adapter.getAvailableModels();
      expect(models).toEqual(["test-video-model", "test-image-model"]);
    });

    it("should return polling config", () => {
      const polling = adapter.getPollingConfig();
      expect(polling.intervalSeconds).toBe(3);
      expect(polling.maxAttempts).toBe(60);
      expect(polling.backoffMultiplier).toBe(1.2);
    });

    it("should return cloud info", () => {
      const info = adapter.getCloudInfo("https://test-declarative.example.com");
      expect(info).toBeDefined();
      expect(info!.name).toBe("Test Declarative Cloud");
      expect(info!.taskUrlPattern("task-123")).toBe("https://test-declarative.example.com/tasks/task-123");
    });

    it("should return image transport mode", () => {
      expect(adapter.getImageTransportMode()).toBe("base64");
    });

    it("should build video request with first and last frame", () => {
      const result = adapter.buildVideoRequest({
        prompt: "test",
        model: "test-video-model",
        duration: 5,
        firstFrameUrl: "https://img.com/first.png",
        lastFrameUrl: "https://img.com/last.png",
      });

      expect((result.body as Record<string, unknown>).image_url).toBe("https://img.com/first.png");
      expect((result.body as Record<string, unknown>).last_frame_url).toBe("https://img.com/last.png");
    });
  });

  describe("Code Plugin (.plugin.js) - Metadata Extraction", () => {
    let exported: Record<string, unknown>;

    beforeEach(() => {
      exported = loadFixtureCode("test-code-plugin.plugin.js");
    });

    it("should load and parse .plugin.js fixture", () => {
      expect(exported.id).toBe("test-code-plugin");
      expect(exported.displayName).toBe("Test Code Plugin");
    });

    it("should have all required metadata fields", () => {
      expect(exported.videoCapabilities).toBeDefined();
      expect(exported.imageCapabilities).toBeDefined();
      expect(typeof exported.match).toBe("function");
      expect(typeof exported.buildVideoRequest).toBe("function");
      expect(typeof exported.buildImageRequest).toBe("function");
      expect(typeof exported.extractTaskId).toBe("function");
      expect(typeof exported.extractVideoUrl).toBe("function");
      expect(typeof exported.extractImageUrl).toBe("function");
      expect(typeof exported.getAuthHeaders).toBe("function");
      expect(typeof exported.getModelParameterProfile).toBe("function");
    });

    it("should have matchPatterns for sync matching", () => {
      const patterns = exported.matchPatterns as Array<{ urlPattern: string; modelPattern?: string }>;
      expect(Array.isArray(patterns)).toBe(true);
      expect(patterns).toHaveLength(2);
      expect(patterns[0]!.urlPattern).toBe("test-code.example.com");
      expect(patterns[1]!.urlPattern).toBe("test-code-alt.example.com");
      expect(patterns[1]!.modelPattern).toBe("tc-");
    });

    it("should have API key detection rules", () => {
      const detection = exported.apiKeyDetection as Record<string, unknown>;
      expect(detection).toBeDefined();
      expect(Array.isArray(detection.rules)).toBe(true);
      expect(detection.suggestedName).toBe("Test Code Provider");
      expect(detection.baseUrl).toBe("https://test-code.example.com/v1");
    });

    it("should have video capabilities", () => {
      const vc = exported.videoCapabilities as Record<string, unknown>;
      expect(vc.supportsLastFrame).toBe(true);
      expect(vc.defaultModel).toBe("tc-video-v1");
      expect(vc.maxDuration).toBe(15);
    });

    it("should have image capabilities", () => {
      const ic = exported.imageCapabilities as Record<string, unknown>;
      expect(ic.supportsReferenceImage).toBe(true);
      expect(ic.defaultModel).toBe("tc-image-v1");
    });

    it("should have preferLocalData flag", () => {
      expect(exported.preferLocalData).toBe(true);
    });
  });

  describe("Code Plugin (.plugin.js) - Method Execution", () => {
    let exported: Record<string, unknown>;

    beforeEach(() => {
      exported = loadFixtureCode("test-code-plugin.plugin.js");
    });

    it("should match URLs via match function", () => {
      const match = exported.match as (url: string, model?: string) => boolean;
      expect(match("https://test-code.example.com/v1")).toBe(true);
      expect(match("https://other.example.com/v1")).toBe(false);
    });

    it("should match models via match function", () => {
      const match = exported.match as (url: string, model?: string) => boolean;
      expect(match("https://other.example.com/v1", "tc-video-v1")).toBe(true);
      expect(match("https://other.example.com/v1", "other-model")).toBe(false);
    });

    it("should build video request", () => {
      const buildVideoRequest = exported.buildVideoRequest as (ctx: Record<string, unknown>) => Record<string, unknown>;
      const result = buildVideoRequest({
        prompt: "a dancing cat",
        model: "tc-video-v1",
        duration: 5,
        firstFrameUrl: "https://img.com/first.png",
      });

      expect(result.body).toMatchObject({
        prompt: "a dancing cat",
        model: "tc-video-v1",
        duration: 5,
        first_frame: "https://img.com/first.png",
      });
      expect(result.endpoint).toBe("/v1/videos/generations");
    });

    it("should build image request", () => {
      const buildImageRequest = exported.buildImageRequest as (ctx: Record<string, unknown>) => Record<string, unknown>;
      const result = buildImageRequest({
        prompt: "a sunset",
        model: "tc-image-v1",
        size: "1024x1024",
        referenceImages: ["https://img.com/ref.png"],
      });

      expect(result.body).toMatchObject({
        prompt: "a sunset",
        model: "tc-image-v1",
        size: "1024x1024",
        n: 1,
        reference_image: "https://img.com/ref.png",
      });
      expect(result.endpoint).toBe("/v1/images/generations");
    });

    it("should build text request", () => {
      const buildTextRequest = exported.buildTextRequest as (ctx: Record<string, unknown>) => Record<string, unknown>;
      const result = buildTextRequest({
        prompt: "hello",
        maxTokens: 100,
        temperature: 0.5,
      });

      expect(result.body).toMatchObject({
        model: "tc-text-v1",
        max_tokens: 100,
        temperature: 0.5,
      });
      expect(result.endpoint).toBe("/v1/chat/completions");
    });

    it("should build vision request", () => {
      const buildVisionRequest = exported.buildVisionRequest as (ctx: Record<string, unknown>) => Record<string, unknown>;
      const result = buildVisionRequest({
        prompt: "describe this",
        imageUrl: "https://img.com/photo.png",
      });

      expect(result.endpoint).toBe("/v1/chat/completions");
      const body = result.body as Record<string, unknown>;
      expect(body).toHaveProperty("messages");
    });

    it("should extract task ID", () => {
      const extractTaskId = exported.extractTaskId as (data: Record<string, unknown>) => string | undefined;
      expect(extractTaskId({ id: "task-123" })).toBe("task-123");
      expect(extractTaskId({ task_id: "task-456" })).toBe("task-456");
    });

    it("should extract video URL", () => {
      const extractVideoUrl = exported.extractVideoUrl as (data: Record<string, unknown>) => string | undefined;
      expect(extractVideoUrl({ output: { video_url: "https://cdn.com/v.mp4" } })).toBe("https://cdn.com/v.mp4");
      expect(extractVideoUrl({ data: { video_url: "https://cdn.com/v2.mp4" } })).toBe("https://cdn.com/v2.mp4");
    });

    it("should extract image URL", () => {
      const extractImageUrl = exported.extractImageUrl as (data: Record<string, unknown>) => string | undefined;
      expect(extractImageUrl({ data: [{ url: "https://cdn.com/img.png" }] })).toBe("https://cdn.com/img.png");
    });

    it("should extract text content", () => {
      const extractTextContent = exported.extractTextContent as (data: Record<string, unknown>) => string;
      expect(extractTextContent({ choices: [{ message: { content: "Hello" } }] })).toBe("Hello");
      expect(extractTextContent({})).toBe("");
    });

    it("should extract status with mapping", () => {
      const extractStatus = exported.extractStatus as (data: Record<string, unknown>) => Record<string, unknown>;
      expect(extractStatus({ status: "processing" })).toMatchObject({ status: "generating" });
      expect(extractStatus({ status: "success" })).toMatchObject({ status: "completed" });
      expect(extractStatus({ status: "failed" })).toMatchObject({ status: "failed" });
      expect(extractStatus({ status: "timeout" })).toMatchObject({ status: "timeout" });
    });

    it("should return auth headers", () => {
      const getAuthHeaders = exported.getAuthHeaders as (apiKey: string, endpoint?: string) => Record<string, string>;
      const headers = getAuthHeaders("tck-testkey1234567890abcdef");
      expect(headers).toEqual({ Authorization: "Bearer tck-testkey1234567890abcdef" });
    });

    it("should return video status endpoint", () => {
      const getVideoStatusEndpoint = exported.getVideoStatusEndpoint as (baseUrl: string, taskId: string) => string;
      expect(getVideoStatusEndpoint("https://test-code.example.com", "task-789")).toBe(
        "https://test-code.example.com/v1/videos/task-789",
      );
    });

    it("should return model capabilities", () => {
      const getModelCapabilities = exported.getModelCapabilities as (modelId: string) => Record<string, unknown>;
      const caps = getModelCapabilities("tc-video-v1");
      expect(caps.maxReferences).toBe(4);
      expect(caps.supportsLastFrame).toBe(true);
      expect(caps.referenceMode).toBe("separate");
    });

    it("should return model parameter profile", () => {
      const getModelParameterProfile = exported.getModelParameterProfile as (modelId: string) => Record<string, unknown>;
      const profile = getModelParameterProfile.call(exported, "tc-video-v1");
      expect(profile.modelId).toBe("tc-video-v1");
      expect(profile.displayName).toBe("TC tc-video-v1");
      const params = profile.parameters as Record<string, unknown>;
      expect(params.durations).toHaveLength(3);
      expect(params.negativePrompt).toBe(true);
      expect(params.seed).toBe(true);
    });

    it("should return available models", () => {
      const getAvailableModels = exported.getAvailableModels as () => string[];
      expect(getAvailableModels()).toEqual(["tc-video-v1", "tc-video-v2", "tc-image-v1", "tc-text-v1"]);
    });

    it("should return cloud info", () => {
      const getCloudInfo = exported.getCloudInfo as (baseUrl: string) => Record<string, unknown>;
      const info = getCloudInfo("https://test-code.example.com");
      expect(info.name).toBe("Test Code Cloud");
      const taskUrlFn = info.taskUrlPattern as (taskId: string) => string;
      expect(taskUrlFn("task-123")).toBe("https://test-code.example.com/tasks/task-123");
    });

    it("should return image transport mode by purpose", () => {
      const getImageTransportMode = exported.getImageTransportMode as (purpose: string) => string;
      expect(getImageTransportMode("characterRef")).toBe("base64");
      expect(getImageTransportMode("sceneRef")).toBe("base64");
      expect(getImageTransportMode("firstFrame")).toBe("url");
      expect(getImageTransportMode("referenceImage")).toBe("url");
    });
  });

  describe("Plugin Registry Integration", () => {
    let registry: InstanceType<typeof import("../registry").PluginRegistry>;

    beforeEach(async () => {
      vi.clearAllMocks();
      const { PluginRegistry } = await import("../registry");
      registry = new PluginRegistry();
    });

    it("should register declarative plugin and use it for matching", () => {
      const config = loadFixtureConfig("test-declarative-provider.plugin.json");
      const adapter = new UserPluginAdapter(config);
      registry.register(adapter, true);

      const selected = registry.select("https://test-declarative.example.com/v1/generate");
      expect(selected).toBeDefined();
      expect(selected!.id).toBe("test-declarative-provider");
    });

    it("should register declarative plugin and match by model", () => {
      const config = loadFixtureConfig("test-declarative-provider.plugin.json");
      const adapter = new UserPluginAdapter(config);
      registry.register(adapter, true);

      const selected = registry.select("https://test-declarative.example.com/v1", "test-video-model");
      expect(selected).toBeDefined();
      expect(selected!.id).toBe("test-declarative-provider");
    });

    it("should not match unrelated URLs", () => {
      const config = loadFixtureConfig("test-declarative-provider.plugin.json");
      const adapter = new UserPluginAdapter(config);
      registry.register(adapter, true);

      const selected = registry.select("https://totally-unrelated.example.com/v1");
      expect(selected).toBeUndefined();
    });

    it("should return capabilities for registered plugin", () => {
      const config = loadFixtureConfig("test-declarative-provider.plugin.json");
      const adapter = new UserPluginAdapter(config);
      registry.register(adapter, true);

      const caps = registry.getAllCapabilities();
      expect(caps["test-declarative-provider"]).toBeDefined();
      expect(caps["test-declarative-provider"]!.capabilities).toEqual({
        video: true,
        image: true,
        text: true,
        vision: true,
      });
      expect(caps["test-declarative-provider"]!.isUserPlugin).toBe(true);
    });

    it("should return model profiles for registered plugin", () => {
      const config = loadFixtureConfig("test-declarative-provider.plugin.json");
      const adapter = new UserPluginAdapter(config);
      registry.register(adapter, true);

      const profiles = registry.getAllModelProfiles();
      expect(Object.keys(profiles)).toContain("test-video-model");
      expect(Object.keys(profiles)).toContain("test-image-model");
      expect(profiles["test-video-model"]!.providerId).toBe("test-declarative-provider");
    });

    it("should unregister plugin and remove from matching", () => {
      const config = loadFixtureConfig("test-declarative-provider.plugin.json");
      const adapter = new UserPluginAdapter(config);
      registry.register(adapter, true);

      expect(registry.select("https://test-declarative.example.com/v1")).toBeDefined();
      registry.unregister("test-declarative-provider");
      expect(registry.select("https://test-declarative.example.com/v1")).toBeUndefined();
    });

    it("should separate built-in and user plugins", () => {
      const config = loadFixtureConfig("test-declarative-provider.plugin.json");
      const adapter = new UserPluginAdapter(config);

      const builtInPlugin = {
        id: "built-in-test",
        displayName: "Built-in Test",
        match: () => false,
        capabilities: { video: true, image: false, text: false, vision: false },
        videoCapabilities: { supportsLastFrame: false, supportsReferenceVideo: false, supportsMimicryLevel: false, defaultModel: "", maxDuration: 10 },
        imageCapabilities: { supportsReferenceImage: false, defaultModel: "" },
        getModelCapabilities: () => ({ maxReferences: 4, maxResolution: 2048, maxSizeMB: 10, supportsLastFrame: false, referenceMode: "separate" as const }),
        buildVideoRequest: () => ({ body: {}, endpoint: "" }),
        buildImageRequest: () => ({ body: {}, endpoint: "" }),
        extractTaskId: () => undefined,
        extractVideoUrl: () => undefined,
        extractImageUrl: () => undefined,
        getVideoStatusEndpoint: (_b: string, t: string) => `/videos/${t}`,
        buildTextRequest: () => ({ body: {}, endpoint: "" }),
        buildVisionRequest: () => ({ body: {}, endpoint: "" }),
        getImageTransportMode: () => "url" as const,
        prepareImage: () => Promise.resolve(undefined),
        getAuthHeaders: () => ({}),
        getModelParameterProfile: (m: string) => ({ modelId: m, capabilities: { maxReferences: 4, maxResolution: 2048, maxSizeMB: 10, supportsLastFrame: false, referenceMode: "separate" as const }, parameters: {} }),
        getAvailableModels: () => [] as string[],
        getApiKeyDetection: () => undefined,
      };

      registry.register(builtInPlugin);
      registry.register(adapter, true);

      expect(registry.getBuiltInPlugins()).toHaveLength(1);
      expect(registry.getUserPlugins()).toHaveLength(1);
      expect(registry.isUserPlugin("test-declarative-provider")).toBe(true);
      expect(registry.isUserPlugin("built-in-test")).toBe(false);
    });
  });

  describe("Plugin Config Validation", () => {
    it("should validate fixture config as valid", async () => {
      const { validatePluginConfig } = await import("../user-plugin-schema");
      const config = loadFixtureConfig("test-declarative-provider.plugin.json");
      const result = validatePluginConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject config with built-in ID", async () => {
      const { validatePluginConfig } = await import("../user-plugin-schema");
      const config = loadFixtureConfig("test-declarative-provider.plugin.json");
      config.id = "volcengine";
      const result = validatePluginConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("内置插件保留 ID"))).toBe(true);
    });

    it("should reject config missing required fields", async () => {
      const { validatePluginConfig } = await import("../user-plugin-schema");
      const result = validatePluginConfig({});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should reject null config", async () => {
      const { validatePluginConfig } = await import("../user-plugin-schema");
      const result = validatePluginConfig(null);
      expect(result.valid).toBe(false);
    });
  });

  describe("End-to-End: Declarative Plugin Request Flow", () => {
    let adapter: UserPluginAdapter;

    beforeEach(() => {
      const config = loadFixtureConfig("test-declarative-provider.plugin.json");
      adapter = new UserPluginAdapter(config);
    });

    it("should complete full video generation request flow", () => {
      const apiKey = "tdk-testkey12345678901234";

      const matchResult = adapter.match("https://test-declarative.example.com/v1/generate");
      expect(matchResult).toBe(true);

      const authHeaders = adapter.getAuthHeaders(apiKey);
      expect(authHeaders).toEqual({ Authorization: `Bearer ${apiKey}` });

      const request = adapter.buildVideoRequest({
        prompt: "A cat playing piano",
        model: "test-video-model",
        duration: 5,
        firstFrameUrl: "https://img.com/cat.png",
      });
      expect(request.endpoint).toBe("/v1/videos/generations");
      expect(request.body).toMatchObject({ prompt: "A cat playing piano" });

      const taskId = adapter.extractTaskId({ id: "gen-001" });
      expect(taskId).toBe("gen-001");

      const statusEndpoint = adapter.getVideoStatusEndpoint("https://test-declarative.example.com", "gen-001");
      expect(statusEndpoint).toBe("/v1/videos/gen-001");

      const videoUrl = adapter.extractVideoUrl({ data: { video_url: "https://cdn.example.com/video.mp4" } });
      expect(videoUrl).toBe("https://cdn.example.com/video.mp4");
    });

    it("should complete full image generation request flow", () => {
      const request = adapter.buildImageRequest({
        prompt: "A beautiful landscape",
        model: "test-image-model",
        size: "1024x1024",
        referenceImages: [],
      });
      expect(request.endpoint).toBe("/v1/images/generations");

      const imageUrl = adapter.extractImageUrl({ data: [{ url: "https://cdn.example.com/landscape.png" }] });
      expect(imageUrl).toBe("https://cdn.example.com/landscape.png");
    });

    it("should handle error response", () => {
      const err = adapter.extractError({ error: { message: "Internal server error", code: "500" } });
      expect(err).toEqual({ message: "Internal server error", code: "500" });
    });
  });

  describe("End-to-End: Code Plugin Metadata Extraction (simulating worker)", () => {
    it("should extract all metadata from code plugin export", () => {
      const exported = loadFixtureCode("test-code-plugin.plugin.js");

      const vc = exported.videoCapabilities as Record<string, unknown>;
      expect(vc.supportsLastFrame).toBe(true);
      expect(vc.defaultModel).toBe("tc-video-v1");

      const ic = exported.imageCapabilities as Record<string, unknown>;
      expect(ic.supportsReferenceImage).toBe(true);
      expect(ic.defaultModel).toBe("tc-image-v1");

      const getAvailableModels = exported.getAvailableModels as () => string[];
      const models = getAvailableModels();
      expect(models).toHaveLength(4);

      const detection = exported.apiKeyDetection as Record<string, unknown>;
      expect(detection).toBeDefined();
      const rules = detection.rules as Array<Record<string, unknown>>;
      expect(rules).toHaveLength(1);
      expect(rules[0]!.pattern).toBe("^tck-[a-zA-Z0-9]{24,}$");

      const matchPatterns = exported.matchPatterns as Array<Record<string, unknown>>;
      expect(matchPatterns).toHaveLength(2);

      expect(exported.preferLocalData).toBe(true);
    });
  });
});
