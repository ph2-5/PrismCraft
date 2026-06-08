import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils", () => ({
  ensureAccessibleUrl: vi.fn((url: string) => url),
  downloadAsBase64: vi.fn(() => Promise.resolve("base64data")),
  resolveLocalUrlToBase64: vi.fn(() => Promise.resolve("data:image/png;base64,localdata")),
  stripDataUriPrefix: vi.fn((s: string) => s.replace(/^data:[^;]+;base64,/, "")),
  urlToPureBase64: vi.fn((s: string) => s.replace(/^data:[^;]+;base64,/, "")),
}));

vi.mock("../logging/logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { UserPluginAdapter } from "../user-plugin-loader";
import type { UserPluginConfig } from "../user-plugin-schema";

function createConfig(overrides: Partial<UserPluginConfig> = {}): UserPluginConfig {
  return {
    id: "test-provider",
    version: "1.0.0",
    displayName: "Test Provider",
    description: "A test provider",
    match: {
      apiUrlPatterns: ["api.test.com"],
      modelPatterns: ["test-model"],
    },
    capabilities: {
      video: {
        supportsLastFrame: true,
        supportsReferenceVideo: true,
        supportsMimicryLevel: false,
        defaultModel: "test-video-model",
        maxDuration: 10,
      },
      image: {
        supportsReferenceImage: true,
        defaultModel: "test-image-model",
      },
      text: true,
      vision: true,
    },
    transport: {
      imageMode: "base64",
      videoMode: "url",
      preferLocalData: true,
    },
    auth: {
      type: "bearer",
    },
    endpoints: {
      video: {
        generate: "/v1/videos/generations",
        status: "/v1/videos/{taskId}",
      },
      image: {
        generate: "/v1/images/generations",
      },
    },
    request: {
      video: {
        bodyFormat: "flat",
        promptField: "prompt",
        modelField: "model",
        durationField: "duration",
      },
      image: {
        bodyFormat: "openai",
        promptField: "prompt",
        modelField: "model",
        sizeField: "size",
      },
    },
    response: {
      video: {
        taskIdPath: "id",
        videoUrlPath: "data.video_url",
      },
      image: {
        imageUrlPath: "data.0.url",
      },
    },
    ...overrides,
  } as UserPluginConfig;
}

describe("UserPluginAdapter", () => {
  let adapter: UserPluginAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new UserPluginAdapter(createConfig());
  });

  describe("constructor", () => {
    it("should create adapter from valid config", () => {
      expect(adapter.id).toBe("test-provider");
      expect(adapter.displayName).toBe("Test Provider");
    });

    it("should store the config", () => {
      expect(adapter.config.id).toBe("test-provider");
    });
  });

  describe("match()", () => {
    it("should match URL using contains mode (default)", () => {
      expect(adapter.match("https://api.test.com/v1/generate")).toBe(true);
      expect(adapter.match("https://api.other.com/v1/generate")).toBe(false);
    });

    it("should match URL using prefix mode", () => {
      const config = createConfig({
        match: {
          mode: "prefix",
          apiUrlPatterns: ["https://api.test.com"],
        },
      });
      const a = new UserPluginAdapter(config);

      expect(a.match("https://api.test.com/v1/generate")).toBe(true);
      expect(a.match("https://api.test.com.au/v1/generate")).toBe(true);
      expect(a.match("https://other.api.test.com/v1/generate")).toBe(false);
    });

    it("should match URL using regex mode", () => {
      const config = createConfig({
        match: {
          mode: "regex",
          apiUrlPatterns: ["api\\.test\\.com"],
        },
      });
      const a = new UserPluginAdapter(config);

      expect(a.match("https://api.test.com/v1/generate")).toBe(true);
      expect(a.match("https://api.other.com/v1/generate")).toBe(false);
    });

    it("should handle invalid regex gracefully", () => {
      const config = createConfig({
        match: {
          mode: "regex",
          apiUrlPatterns: ["[invalid"],
        },
      });
      const a = new UserPluginAdapter(config);

      expect(a.match("https://api.test.com/v1/generate")).toBe(false);
    });

    it("should also check modelPatterns when model is provided", () => {
      expect(adapter.match("https://api.test.com/v1", "test-model-1")).toBe(true);
      expect(adapter.match("https://api.test.com/v1", "other-model")).toBe(false);
    });

    it("should skip model check when no model provided but modelPatterns exist", () => {
      expect(adapter.match("https://api.test.com/v1")).toBe(true);
    });

    it("should match any URL when no modelPatterns configured", () => {
      const config = createConfig({
        match: {
          apiUrlPatterns: ["api.test.com"],
        },
      });
      const a = new UserPluginAdapter(config);

      expect(a.match("https://api.test.com/v1", "any-model")).toBe(true);
    });
  });

  describe("capabilities getter", () => {
    it("should return correct capabilities flags", () => {
      expect(adapter.capabilities).toEqual({
        video: true,
        image: true,
        text: true,
        vision: true,
      });
    });

    it("should return false for missing optional capabilities", () => {
      const config = createConfig({
        capabilities: {
          video: {
            supportsLastFrame: false,
            supportsReferenceVideo: false,
            supportsMimicryLevel: false,
            defaultModel: "v1",
            maxDuration: 10,
          },
        },
      });
      const a = new UserPluginAdapter(config);

      expect(a.capabilities).toEqual({
        video: true,
        image: false,
        text: false,
        vision: false,
      });
    });
  });

  describe("videoCapabilities / imageCapabilities getters", () => {
    it("should return video capabilities from config", () => {
      expect(adapter.videoCapabilities.supportsLastFrame).toBe(true);
      expect(adapter.videoCapabilities.defaultModel).toBe("test-video-model");
    });

    it("should return default video capabilities when not configured", () => {
      const config = createConfig({
        capabilities: {},
      });
      const a = new UserPluginAdapter(config);

      expect(a.videoCapabilities.supportsLastFrame).toBe(false);
      expect(a.videoCapabilities.defaultModel).toBe("");
    });

    it("should return image capabilities from config", () => {
      expect(adapter.imageCapabilities.supportsReferenceImage).toBe(true);
      expect(adapter.imageCapabilities.defaultModel).toBe("test-image-model");
    });

    it("should return default image capabilities when not configured", () => {
      const config = createConfig({
        capabilities: {},
      });
      const a = new UserPluginAdapter(config);

      expect(a.imageCapabilities.supportsReferenceImage).toBe(false);
      expect(a.imageCapabilities.defaultModel).toBe("");
    });
  });

  describe("buildVideoRequest()", () => {
    it("should build flat format request", () => {
      const result = adapter.buildVideoRequest({
        prompt: "a cat",
        model: "test-video-model",
        duration: 5,
      });

      expect(result.body).toMatchObject({
        prompt: "a cat",
        model: "test-video-model",
        duration: 5,
      });
      expect(result.endpoint).toBe("/v1/videos/generations");
    });

    it("should build openai-content format request", () => {
      const config = createConfig({
        request: {
          video: {
            bodyFormat: "openai-content",
          },
        },
      } as Partial<UserPluginConfig>);
      const a = new UserPluginAdapter(config);

      const result = a.buildVideoRequest({
        prompt: "a cat",
        model: "test-video-model",
        duration: 5,
        firstFrameUrl: "https://img.com/first.png",
        lastFrameUrl: "https://img.com/last.png",
      });

      expect(result.body).toHaveProperty("content");
      const content = (result.body as Record<string, unknown>).content as Record<string, unknown>[];
      expect(content[0]).toEqual({ type: "text", text: "a cat" });
      expect(content[1]).toEqual({ type: "image_url", image_url: { url: "https://img.com/first.png" } });
      expect(content[2]).toEqual({ type: "image_url", image_url: { url: "https://img.com/last.png" } });
    });

    it("should build dashscope format request", () => {
      const config = createConfig({
        request: {
          video: {
            bodyFormat: "dashscope",
          },
        },
      } as Partial<UserPluginConfig>);
      const a = new UserPluginAdapter(config);

      const result = a.buildVideoRequest({
        prompt: "a cat",
        model: "test-video-model",
        duration: 5,
        firstFrameUrl: "https://img.com/first.png",
      });

      expect(result.body).toHaveProperty("input");
      expect(result.body).toHaveProperty("parameters");
      const input = (result.body as Record<string, unknown>).input as Record<string, unknown>;
      expect(input.prompt).toBe("a cat");
      expect(input.image_url).toBe("https://img.com/first.png");
    });

    it("should build custom format request with template", () => {
      const config = createConfig({
        request: {
          video: {
            bodyFormat: "custom",
            customBodyTemplate: {
              prompt: "{{prompt}}",
              model_name: "{{model}}",
              time: "{{duration}}",
            },
          },
        },
      } as Partial<UserPluginConfig>);
      const a = new UserPluginAdapter(config);

      const result = a.buildVideoRequest({
        prompt: "a cat",
        model: "test-video-model",
        duration: 5,
      });

      expect((result.body as Record<string, unknown>).prompt).toBe("a cat");
      expect((result.body as Record<string, unknown>).model_name).toBe("test-video-model");
      expect((result.body as Record<string, unknown>).time).toBe(5);
    });

    it("should return notSupported when no video request config", () => {
      const config = createConfig({
        request: {
          video: undefined,
        },
      } as Partial<UserPluginConfig>);
      const a = new UserPluginAdapter(config);

      const result = a.buildVideoRequest({ prompt: "test", duration: 5 });
      expect(result).toHaveProperty("notSupported", true);
    });

    it("should include extraFields in request body", () => {
      const config = createConfig({
        request: {
          video: {
            bodyFormat: "flat",
            extraFields: { watermark: false, quality: "hd" },
          },
        },
      } as Partial<UserPluginConfig>);
      const a = new UserPluginAdapter(config);

      const result = a.buildVideoRequest({ prompt: "test", duration: 5 });
      expect((result.body as Record<string, unknown>).watermark).toBe(false);
      expect((result.body as Record<string, unknown>).quality).toBe("hd");
    });

    it("should include reference video fields in flat format", () => {
      const result = adapter.buildVideoRequest({
        prompt: "test",
        duration: 5,
        referenceVideoUrl: "https://video.ref/mp4",
        referenceVideoMimicryLevel: "deep",
      });

      expect((result.body as Record<string, unknown>).reference_video_url).toBe("https://video.ref/mp4");
      expect((result.body as Record<string, unknown>).mimicry_level).toBe("deep");
    });
  });

  describe("buildImageRequest()", () => {
    it("should build openai format request", () => {
      const result = adapter.buildImageRequest({
        prompt: "a dog",
        model: "test-image-model",
        size: "1024x1024",
        referenceImages: [],
      });

      expect(result.body).toMatchObject({
        model: "test-image-model",
        prompt: "a dog",
        n: 1,
        size: "1024x1024",
      });
      expect(result.endpoint).toBe("/v1/images/generations");
    });

    it("should build flat format request", () => {
      const config = createConfig({
        request: {
          image: {
            bodyFormat: "flat",
            promptField: "text",
            modelField: "model_name",
            sizeField: "resolution",
          },
        },
      } as Partial<UserPluginConfig>);
      const a = new UserPluginAdapter(config);

      const result = a.buildImageRequest({
        prompt: "a dog",
        model: "test-image-model",
        size: "1024x1024",
        referenceImages: [],
      });

      expect((result.body as Record<string, unknown>).text).toBe("a dog");
      expect((result.body as Record<string, unknown>).model_name).toBe("test-image-model");
      expect((result.body as Record<string, unknown>).resolution).toBe("1024x1024");
    });

    it("should build custom format request with template", () => {
      const config = createConfig({
        request: {
          image: {
            bodyFormat: "custom",
            customBodyTemplate: {
              prompt: "{{prompt}}",
              model_name: "{{model}}",
              img_size: "{{size}}",
            },
          },
        },
      } as Partial<UserPluginConfig>);
      const a = new UserPluginAdapter(config);

      const result = a.buildImageRequest({
        prompt: "a dog",
        model: "test-image-model",
        size: "1024x1024",
        referenceImages: [],
      });

      expect((result.body as Record<string, unknown>).prompt).toBe("a dog");
      expect((result.body as Record<string, unknown>).model_name).toBe("test-image-model");
      expect((result.body as Record<string, unknown>).img_size).toBe("1024x1024");
    });

    it("should return notSupported when no image request config", () => {
      const config = createConfig({
        request: {
          image: undefined,
        },
      } as Partial<UserPluginConfig>);
      const a = new UserPluginAdapter(config);

      const result = a.buildImageRequest({
        prompt: "test",
        size: "1024x1024",
        referenceImages: [],
      });
      expect(result).toHaveProperty("notSupported", true);
    });

    it("should include reference images in openai format when supported", () => {
      const result = adapter.buildImageRequest({
        prompt: "a dog",
        model: "test-image-model",
        size: "1024x1024",
        referenceImages: ["https://img.com/ref1.png"],
        characterRef: "https://img.com/char.png",
      });

      expect((result.body as Record<string, unknown>).reference_images).toEqual(["https://img.com/ref1.png"]);
      expect((result.body as Record<string, unknown>).character_ref).toBe("https://img.com/char.png");
    });

    it("should not include reference images when not supported", () => {
      const config = createConfig({
        capabilities: {
          image: {
            supportsReferenceImage: false,
            defaultModel: "test-image-model",
          },
        },
      });
      const a = new UserPluginAdapter(config);

      const result = a.buildImageRequest({
        prompt: "a dog",
        model: "test-image-model",
        size: "1024x1024",
        referenceImages: ["https://img.com/ref1.png"],
      });

      expect((result.body as Record<string, unknown>).reference_images).toBeUndefined();
    });
  });

  describe("getAuthHeaders()", () => {
    it("should return Bearer auth for bearer type", () => {
      const headers = adapter.getAuthHeaders("sk-test-key");
      expect(headers).toEqual({ Authorization: "Bearer sk-test-key" });
    });

    it("should return API key header for api-key-header type", () => {
      const config = createConfig({
        auth: { type: "api-key-header", headerName: "X-API-Key" },
      });
      const a = new UserPluginAdapter(config);

      const headers = a.getAuthHeaders("sk-test-key");
      expect(headers).toEqual({ "X-API-Key": "sk-test-key" });
    });

    it("should return default header name for api-key-header without headerName", () => {
      const config = createConfig({
        auth: { type: "api-key-header" },
      });
      const a = new UserPluginAdapter(config);

      const headers = a.getAuthHeaders("sk-test-key");
      expect(headers).toEqual({ "X-API-Key": "sk-test-key" });
    });

    it("should return empty headers for api-key-query type", () => {
      const config = createConfig({
        auth: { type: "api-key-query" },
      });
      const a = new UserPluginAdapter(config);

      const headers = a.getAuthHeaders("sk-test-key");
      expect(headers).toEqual({});
    });

    it("should return custom headers for custom type", () => {
      const config = createConfig({
        auth: {
          type: "custom",
          customHeaders: {
            "X-Custom-Auth": "Token {apiKey}",
            "X-Extra": "fixed-value",
          },
        },
      });
      const a = new UserPluginAdapter(config);

      const headers = a.getAuthHeaders("my-secret-key");
      expect(headers).toEqual({
        "X-Custom-Auth": "Token my-secret-key",
        "X-Extra": "fixed-value",
      });
    });

    it("should use endpoint-specific auth when endpoint matches", () => {
      const config = createConfig({
        endpoints: {
          video: {
            generate: "/v1/videos/generations",
            status: "/v1/videos/{taskId}",
            auth: { type: "api-key-header", headerName: "X-Video-Key" },
          },
        },
      } as Partial<UserPluginConfig>);
      const a = new UserPluginAdapter(config);

      const headers = a.getAuthHeaders("sk-test-key", "/v1/videos/generations");
      expect(headers).toEqual({ "X-Video-Key": "sk-test-key" });
    });
  });

  describe("getApiKeyDetection()", () => {
    it("should return detection rules from config", () => {
      const config = createConfig({
        apiKeyDetection: {
          rules: [{ pattern: "^sk-test-", confidence: "high" as const }],
          suggestedName: "Test Provider",
          baseUrl: "https://api.test.com",
        },
      });
      const a = new UserPluginAdapter(config);

      const detection = a.getApiKeyDetection();
      expect(detection).toBeDefined();
      expect(detection!.rules).toHaveLength(1);
      expect(detection!.rules[0]!.pattern).toBe("^sk-test-");
      expect(detection!.suggestedName).toBe("Test Provider");
      expect(detection!.baseUrl).toBe("https://api.test.com");
    });

    it("should return undefined when no detection config", () => {
      const config = createConfig({});
      delete config.apiKeyDetection;
      const a = new UserPluginAdapter(config);

      expect(a.getApiKeyDetection()).toBeUndefined();
    });

    it("should return undefined when detection has no rules", () => {
      const config = createConfig({
        apiKeyDetection: {
          rules: [],
          suggestedName: "Test",
        },
      });
      const a = new UserPluginAdapter(config);

      expect(a.getApiKeyDetection()).toBeUndefined();
    });

    it("should use displayName as fallback suggestedName", () => {
      const config = createConfig({
        apiKeyDetection: {
          rules: [{ pattern: "^sk-", confidence: "medium" as const }],
        },
      });
      const a = new UserPluginAdapter(config);

      const detection = a.getApiKeyDetection();
      expect(detection!.suggestedName).toBe("Test Provider");
    });
  });

  describe("getModelParameterProfile()", () => {
    it("should return profile with model-specific parameters", () => {
      const config = createConfig({
        models: {
          "test-video-model": {
            parameters: {
              durations: [
                { value: 2, label: "2s" },
                { value: 5, label: "5s" },
              ],
              resolutions: [
                { value: "1920x1080", label: "16:9", width: 1920, height: 1080 },
              ],
              styles: [
                { value: "cinematic", label: "Cinematic" },
              ],
              negativePrompt: true,
              seed: true,
            },
            displayName: "Test Video Model",
          },
        },
      });
      const a = new UserPluginAdapter(config);

      const profile = a.getModelParameterProfile("test-video-model");
      expect(profile.modelId).toBe("test-video-model");
      expect(profile.displayName).toBe("Test Video Model");
      expect(profile.parameters.durations).toHaveLength(2);
      expect(profile.parameters.negativePrompt).toBe(true);
      expect(profile.parameters.seed).toBe(true);
    });

    it("should return default profile for unknown model", () => {
      const profile = adapter.getModelParameterProfile("unknown-model");
      expect(profile.modelId).toBe("unknown-model");
      expect(profile.parameters.durations).toHaveLength(3);
      expect(profile.parameters.negativePrompt).toBe(false);
    });
  });

  describe("extractTaskId()", () => {
    it("should extract task ID using configured path", () => {
      const result = adapter.extractTaskId({ id: "task-123" });
      expect(result).toBe("task-123");
    });

    it("should extract nested task ID using dot path", () => {
      const config = createConfig({
        response: {
          video: {
            taskIdPath: "data.task_id",
          },
        },
      } as Partial<UserPluginConfig>);
      const a = new UserPluginAdapter(config);

      const result = a.extractTaskId({ data: { task_id: "nested-123" } });
      expect(result).toBe("nested-123");
    });
  });

  describe("extractVideoUrl()", () => {
    it("should extract video URL using configured path", () => {
      const config = createConfig({
        response: {
          video: {
            videoUrlPath: "data.video_url",
          },
        },
      } as Partial<UserPluginConfig>);
      const a = new UserPluginAdapter(config);

      const result = a.extractVideoUrl({ data: { video_url: "https://cdn.com/video.mp4" } });
      expect(result).toBe("https://cdn.com/video.mp4");
    });
  });

  describe("extractImageUrl()", () => {
    it("should extract image URL using configured path", () => {
      const config = createConfig({
        response: {
          image: {
            imageUrlPath: "data.0.url",
          },
        },
      } as Partial<UserPluginConfig>);
      const a = new UserPluginAdapter(config);

      const result = a.extractImageUrl({ data: [{ url: "https://cdn.com/img.png" }] });
      expect(result).toBe("https://cdn.com/img.png");
    });

    it("should extract base64 image using base64Path", () => {
      const config = createConfig({
        response: {
          image: {
            base64Path: "data.image_base64",
          },
        },
      } as Partial<UserPluginConfig>);
      const a = new UserPluginAdapter(config);

      const result = a.extractImageUrl({ data: { image_base64: "aGVsbG8=" } });
      expect(result).toBe("data:image/png;base64,aGVsbG8=");
    });
  });

  describe("getVideoStatusEndpoint()", () => {
    it("should use configured status template", () => {
      const result = adapter.getVideoStatusEndpoint("https://api.test.com", "task-123");
      expect(result).toBe("/v1/videos/task-123");
    });

    it("should use default pattern when no template configured", () => {
      const config = createConfig({
        endpoints: {
          video: {
            generate: "/v1/videos/generations",
          },
        },
      } as Partial<UserPluginConfig>);
      const a = new UserPluginAdapter(config);

      const result = a.getVideoStatusEndpoint("https://api.test.com", "task-123");
      expect(result).toBe("https://api.test.com/v1/videos/task-123");
    });
  });

  describe("getPollingConfig()", () => {
    it("should return default polling config", () => {
      const config = adapter.getPollingConfig();
      expect(config.intervalSeconds).toBe(5);
      expect(config.maxAttempts).toBe(120);
      expect(config.backoffMultiplier).toBe(1.0);
    });

    it("should return custom polling config", () => {
      const config = createConfig({
        polling: {
          intervalSeconds: 3,
          maxAttempts: 60,
          backoffMultiplier: 1.5,
        },
      });
      const a = new UserPluginAdapter(config);

      const polling = a.getPollingConfig();
      expect(polling.intervalSeconds).toBe(3);
      expect(polling.maxAttempts).toBe(60);
      expect(polling.backoffMultiplier).toBe(1.5);
    });
  });

  describe("getCloudInfo()", () => {
    it("should return cloud info from config", () => {
      const config = createConfig({
        cloudInfo: {
          name: "Test Cloud",
          websiteUrl: "https://cloud.test.com",
          taskUrlPattern: "https://cloud.test.com/tasks/{taskId}",
          apiDocUrl: "https://docs.test.com",
          howToCheck: "Visit the dashboard",
        },
      });
      const a = new UserPluginAdapter(config);

      const info = a.getCloudInfo("https://api.test.com");
      expect(info).toBeDefined();
      expect(info!.name).toBe("Test Cloud");
      expect(info!.taskUrlPattern("abc")).toBe("https://cloud.test.com/tasks/abc");
    });

    it("should return undefined when no cloudInfo configured", () => {
      expect(adapter.getCloudInfo("https://api.test.com")).toBeUndefined();
    });
  });

  describe("getAvailableModels()", () => {
    it("should return model IDs from config", () => {
      const config = createConfig({
        availableModels: [
          { id: "model-a", displayName: "Model A", type: "video" },
          { id: "model-b", displayName: "Model B", type: "image" },
        ],
      });
      const a = new UserPluginAdapter(config);

      expect(a.getAvailableModels()).toEqual(["model-a", "model-b"]);
    });

    it("should return empty array when no availableModels configured", () => {
      const config = createConfig({});
      delete config.availableModels;
      const a = new UserPluginAdapter(config);

      expect(a.getAvailableModels()).toEqual([]);
    });
  });

  describe("getImageTransportMode()", () => {
    it("should return transport mode from config", () => {
      expect(adapter.getImageTransportMode()).toBe("base64");
    });
  });

  describe("extractError()", () => {
    it("should extract error using configured errorPath", () => {
      const config = createConfig({
        response: {
          video: {
            errorPath: "error.message",
            errorCodePath: "error.code",
          },
        },
      } as Partial<UserPluginConfig>);
      const a = new UserPluginAdapter(config);

      const err = a.extractError({ error: { message: "rate limited", code: "429" } });
      expect(err).toEqual({ message: "rate limited", code: "429" });
    });

    it("should return undefined when no errorPath configured", () => {
      expect(adapter.extractError({ error: "something" })).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("should handle missing optional fields gracefully", () => {
      const minimalConfig: UserPluginConfig = {
        id: "minimal",
        version: "1.0.0",
        displayName: "Minimal",
        match: { apiUrlPatterns: ["minimal.com"] },
        capabilities: {},
        transport: { imageMode: "url", videoMode: "url" },
        auth: { type: "bearer" },
        endpoints: {},
        request: {},
        response: {},
      };
      const a = new UserPluginAdapter(minimalConfig);

      expect(a.capabilities).toEqual({ video: false, image: false, text: false, vision: false });
      expect(a.videoCapabilities.defaultModel).toBe("");
      expect(a.imageCapabilities.defaultModel).toBe("");
    });
  });
});
