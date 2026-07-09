import { vi } from "vitest";
import { createStoragePortMock } from "./storage-ports";

export function createDiContainerMock(overrides: Record<string, unknown> = {}) {
  const storageMocks = {
    videoTaskStorage: createStoragePortMock("videoTask"),
    characterStorage: createStoragePortMock("character"),
    sceneStorage: createStoragePortMock("scene"),
    storyStorage: createStoragePortMock("story"),
    versionStorage: createStoragePortMock("version"),
    elementStorage: createStoragePortMock("element"),
    videoCacheStorage: createStoragePortMock("videoCache"),
    collectionStorage: createStoragePortMock("collection"),
    storyboardStorage: createStoragePortMock("storyboard"),
    importExportStorage: createStoragePortMock("importExport"),
    templateStorage: createStoragePortMock("template"),
    autoSaveStorage: createStoragePortMock("autoSave"),
    errorLogStorage: createStoragePortMock("errorLog"),
    sessionStorage: createStoragePortMock("session"),
  };

  const providerMocks = {
    videoProvider: {
      generateVideo: vi.fn().mockResolvedValue({ success: true, data: { videoUrl: "/mock/video.mp4", taskId: "task_1" } }),
      queryVideoStatus: vi.fn().mockResolvedValue({ success: true, data: { status: "completed", videoUrl: "/mock/video.mp4" } }),
      generateKeyframe: vi.fn().mockResolvedValue({ success: true, data: { imageUrl: "/mock/keyframe.png" } }),
      generateFramePair: vi.fn().mockResolvedValue({ success: true, data: { firstFrame: { imageUrl: "/mock/first.png", prompt: "", derivedFrom: "" }, lastFrame: { imageUrl: "/mock/last.png", prompt: "", derivedFrom: "" }, generatedAt: Date.now() } }),
      generateVideoWithFrames: vi.fn().mockResolvedValue({ success: true, data: { videoUrl: "/mock/video.mp4", taskId: "task_1" } }),
    },
    imageProvider: {
      generateImage: vi.fn().mockResolvedValue({ success: true, data: { imageUrl: "/mock/image.png" } }),
      analyzeImage: vi.fn().mockResolvedValue({ success: true, data: { analysis: "mock analysis" } }),
    },
    textProvider: {
      generateText: vi.fn().mockResolvedValue({ success: true, data: { text: "mock text" } }),
    },
    fileUploader: {
      uploadFile: vi.fn().mockResolvedValue({ success: true, data: { url: "/mock/upload" } }),
    },
  };

  const base = {
    ...storageMocks,
    ...providerMocks,
    resolveImageUrl: vi.fn((url: string) => url),
    safeRun: vi.fn().mockResolvedValue(undefined),
    safeQuery: vi.fn().mockResolvedValue([]),
    safeTransaction: vi.fn().mockResolvedValue([]),
    trackChange: vi.fn().mockResolvedValue(undefined),
    registerChangeTracker: vi.fn(),
    eventBus: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
    getErrorMessage: vi.fn((e: unknown) => String(e)),
    loadConfig: vi.fn().mockResolvedValue({}),
    checkConfigStatus: vi.fn().mockResolvedValue({
      capabilities: {
        text: { configured: true, provider: "openai", available: true, model: "gpt-4" },
        image: { configured: true, provider: "openai", available: true, model: "dall-e-3" },
        vision: { configured: true, provider: "openai", available: true, model: "gpt-4-vision" },
        video: { configured: true, provider: "zhipu", available: true, model: "cogvideox" },
        embedding: { configured: false, provider: "未配置", available: false },
        audio: { configured: false, provider: "未配置", available: false },
      },
      allConfigured: true,
      configuredCount: 4,
      totalCount: 4,
      missing: [],
    }),
    initConfig: vi.fn(),
    toSqlValue: vi.fn((v: unknown) => v),
    imageApi: {},
    videoApi: {},
    textApi: {},
    apiClient: {
      get: vi.fn().mockResolvedValue({ ok: true, value: {} }),
      post: vi.fn().mockResolvedValue({ ok: true, value: { success: true } }),
      put: vi.fn().mockResolvedValue({ ok: true, value: {} }),
      delete: vi.fn().mockResolvedValue({ ok: true, value: {} }),
    },
    preferencesStorage: {
      get: vi.fn().mockReturnValue(null),
      set: vi.fn(),
      remove: vi.fn(),
      has: vi.fn().mockReturnValue(false),
    },
    synthesizeOutfit: vi.fn(),
    batchSynthesizeOutfits: vi.fn(),
    getProviderSupportedCodecs: vi.fn().mockReturnValue([]),
    getProviderMaxDuration: vi.fn().mockReturnValue(10),
    cloudProviders: [],
    defaultCloudProvider: "openai",
    registerObjectUrl: vi.fn(),
    revokeObjectUrl: vi.fn(),
    getObjectUrl: vi.fn(),
    mediaAssetRepository: {},
    updateOutfitImage: vi.fn(),
    isCodecSupportedByProvider: vi.fn().mockReturnValue(true),
    resilientFetch: vi.fn().mockResolvedValue(new Response()),
    ...overrides,
  };

  return base;
}

export function mockDiContainer(overrides: Record<string, unknown> = {}) {
  const mock = createDiContainerMock(overrides);
  vi.mock("@/infrastructure/di", () => ({
    container: mock,
    resolve: vi.fn(),
  }));
  return mock;
}
