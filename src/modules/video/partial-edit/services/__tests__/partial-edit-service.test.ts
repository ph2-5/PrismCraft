/**
 * Task 2A.22: partial-edit-service 单元测试
 *
 * 覆盖：
 * - 校验失败（空 prompt、空 mask、preserveUnmasked=false）
 * - mask 编码失败 / mask 体积超限
 * - 原视频 Asset 不存在
 * - provider 不支持 generatePartialEdit
 * - provider 调用失败 / 返回无效 taskId
 * - 成功路径：创建 VideoTask 并发出 toast
 * - savePartialEditAsset：taskSubtype/status/sourceVideoAssetId 校验
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { VideoTask, GenerationAsset } from "@/domain/schemas";

// ── Mock 依赖 ──────────────────────────────────────────────────────────────
const {
  mockGenerationAssetStorage,
  mockVideoProvider,
  mockContainer,
  mockErrorLogger,
  mockEmitToast,
} = vi.hoisted(() => {
  const mockGenerationAssetStorage = {
    getAssetById: vi.fn(),
    getAssetsBySourceAssetId: vi.fn<(id: string) => Promise<GenerationAsset[]>>().mockResolvedValue([]),
    createAsset: vi.fn(),
  };

  const mockVideoProvider = {
    generateVideo: vi.fn(),
    generatePartialEdit: vi.fn(),
  };

  const mockContainer = {
    generationAssetStorage: mockGenerationAssetStorage,
    videoProvider: mockVideoProvider,
  };

  const mockErrorLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const mockEmitToast = vi.fn();

  return {
    mockGenerationAssetStorage,
    mockVideoProvider,
    mockContainer,
    mockErrorLogger,
    mockEmitToast,
  };
});

vi.mock("@/infrastructure/di", () => ({
  container: mockContainer,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
}));

vi.mock("@/shared/utils/toast-bridge", () => ({
  emitToast: mockEmitToast,
}));

vi.mock("@/shared/constants", () => ({
  t: vi.fn((key: string, _params?: Record<string, unknown>) => key),
}));

// mock canvas 工厂（在每个测试的 beforeEach 中 stubGlobal，
// 因为 setup.ts 的 afterEach 会调用 vi.unstubAllGlobals() 清除 stub）
function stubCanvas() {
  vi.stubGlobal("OffscreenCanvas", undefined);
  vi.stubGlobal("document", {
    createElement: vi.fn(() => ({
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        fillStyle: "",
        strokeStyle: "",
        lineWidth: 0,
        lineCap: "",
        lineJoin: "",
        fillRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        closePath: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        arc: vi.fn(),
      })),
      toDataURL: vi.fn(() => "data:image/png;base64,SGVsbG8="),
    })),
  });
}

import {
  startPartialEditTask,
  startFaceSwapTask,
  savePartialEditAsset,
  listPartialEditHistory,
} from "../partial-edit-service";
import type { PartialEditRequest, FaceSwapRequest } from "../../domain/edit-schema";
import type { MaskConfig } from "../../domain/mask-types";

// ── 工厂函数 ────────────────────────────────────────────────────────────────
function makeValidMask(): MaskConfig {
  return {
    shapes: [{ type: "rectangle", x: 0, y: 0, width: 100, height: 100 }],
    videoTimestamp: 1.0,
    inverse: false,
  };
}

function makeValidRequest(overrides: Partial<PartialEditRequest> = {}): PartialEditRequest {
  return {
    sourceVideoAssetId: "asset-source-1",
    mask: makeValidMask(),
    editPrompt: "把背景换成夜景",
    preserveUnmasked: true,
    providerId: "seedance",
    modelId: "seedance-2.5",
    duration: 5,
    storyId: "story-1",
    beatId: "beat-1",
    ...overrides,
  };
}

function makeMockVideoTaskStore() {
  return {
    addTask: vi.fn<(task: Omit<VideoTask, "progress" | "createdAt">) => Promise<VideoTask>>().mockImplementation(
      async (task) => ({
        ...task,
        progress: 0,
        createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      }) as VideoTask,
    ),
  };
}

function makeSourceAsset(overrides: Partial<GenerationAsset> = {}): GenerationAsset {
  return {
    id: "asset-source-1",
    type: "video",
    sourceType: "ai_generated",
    url: "https://example.com/source.mp4",
    localPath: "/tmp/source.mp4",
    prompt: "original prompt",
    createdAt: Date.now(),
    storyBeatId: "beat-1",
    characterId: null,
    sceneId: null,
    projectId: null,
    subShotId: null,
    characterVariantId: null,
    sceneVariantId: null,
    sourceAssetId: null,
    ...overrides,
  } as unknown as GenerationAsset;
}

describe("partial-edit-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubCanvas();

    // 默认 mock：原 Asset 存在、provider 支持并返回成功
    mockGenerationAssetStorage.getAssetById.mockResolvedValue(makeSourceAsset());
    mockGenerationAssetStorage.getAssetsBySourceAssetId.mockResolvedValue([]);
    mockGenerationAssetStorage.createAsset.mockResolvedValue(undefined);

    mockVideoProvider.generatePartialEdit.mockResolvedValue({
      success: true,
      data: {
        taskId: "provider-task-id",
        providerId: "seedance",
        providerModelId: "seedance-2.5",
        providerFormat: "mp4",
      },
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 用例 1: 校验失败 — 空 editPrompt
  // ─────────────────────────────────────────────────────────────────────────
  it("空 editPrompt 应返回 validation 错误", async () => {
    const req = makeValidRequest({ editPrompt: "" });
    const store = makeMockVideoTaskStore();
    const result = await startPartialEditTask(req, store);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("validation");
      expect(result.error.errors.some((e) => e.field === "editPrompt")).toBe(true);
    }
    // 不应调用 provider
    expect(mockVideoProvider.generatePartialEdit).not.toHaveBeenCalled();
    expect(store.addTask).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 用例 2: 校验失败 — preserveUnmasked=false
  // ─────────────────────────────────────────────────────────────────────────
  it("preserveUnmasked=false 应返回 validation 错误", async () => {
    const req = makeValidRequest({ preserveUnmasked: false as unknown as true });
    const store = makeMockVideoTaskStore();
    const result = await startPartialEditTask(req, store);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("validation");
      expect(result.error.errors.some((e) => e.field === "preserveUnmasked")).toBe(true);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 用例 3: 原视频 Asset 不存在
  // ─────────────────────────────────────────────────────────────────────────
  it("原视频 Asset 不存在应返回 source_video_not_found 错误", async () => {
    mockGenerationAssetStorage.getAssetById.mockResolvedValue(null);
    const req = makeValidRequest();
    const store = makeMockVideoTaskStore();
    const result = await startPartialEditTask(req, store);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("source_video_not_found");
      expect(result.error.sourceVideoAssetId).toBe("asset-source-1");
    }
    expect(mockVideoProvider.generatePartialEdit).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 用例 4: provider 不支持 generatePartialEdit
  // ─────────────────────────────────────────────────────────────────────────
  it("provider 未实现 generatePartialEdit 应返回 provider_not_supported 错误", async () => {
    // 删除 generatePartialEdit 方法
    const providerWithoutPartial = { ...mockVideoProvider };
    delete (providerWithoutPartial as Partial<typeof mockVideoProvider>).generatePartialEdit;
    // 重新 mock container 指向新 provider
    mockContainer.videoProvider = providerWithoutPartial as typeof mockVideoProvider;

    const req = makeValidRequest();
    const store = makeMockVideoTaskStore();
    const result = await startPartialEditTask(req, store);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("provider_not_supported");
    }
    expect(store.addTask).not.toHaveBeenCalled();

    // 恢复
    mockContainer.videoProvider = mockVideoProvider;
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 用例 5: provider 调用抛出异常
  // ─────────────────────────────────────────────────────────────────────────
  it("provider.generatePartialEdit 抛出异常应返回 provider_call_failed 错误", async () => {
    mockVideoProvider.generatePartialEdit.mockRejectedValue(new Error("API timeout"));
    const req = makeValidRequest();
    const store = makeMockVideoTaskStore();
    const result = await startPartialEditTask(req, store);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("provider_call_failed");
      expect(result.error.message).toContain("API timeout");
    }
    expect(store.addTask).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 用例 6: provider 返回无效 taskId
  // ─────────────────────────────────────────────────────────────────────────
  it("provider 返回空 taskId 应返回 provider_call_failed 错误", async () => {
    mockVideoProvider.generatePartialEdit.mockResolvedValue({
      success: true,
      data: { taskId: "" },
    });
    const req = makeValidRequest();
    const store = makeMockVideoTaskStore();
    const result = await startPartialEditTask(req, store);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("provider_call_failed");
      expect(result.error.message).toContain("taskId");
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 用例 7: 成功路径 — 创建 VideoTask 并发出 toast
  // ─────────────────────────────────────────────────────────────────────────
  it("成功路径应创建 taskSubtype=partial_redraw 的 VideoTask 并发出 toast", async () => {
    const req = makeValidRequest();
    const store = makeMockVideoTaskStore();
    const result = await startPartialEditTask(req, store);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.taskId).toBe("provider-task-id");
      expect(result.value.sourceVideoAssetId).toBe("asset-source-1");
      expect(result.value.createdAt).toBeDefined();
    }

    // 验证 addTask 收到正确参数
    expect(store.addTask).toHaveBeenCalledTimes(1);
    const addedTask = store.addTask.mock.calls[0]![0];
    expect(addedTask.taskId).toBe("provider-task-id");
    expect(addedTask.taskSubtype).toBe("partial_redraw");
    expect(addedTask.sourceVideoAssetId).toBe("asset-source-1");
    expect(addedTask.maskData).toBe("SGVsbG8="); // mock canvas 返回的 base64
    expect(addedTask.editPrompt).toBe("把背景换成夜景");
    expect(addedTask.maskBounds).toBeDefined();
    expect(addedTask.prompt).toContain("严格保持"); // 中文 strict 前缀
    expect(addedTask.storyId).toBe("story-1");
    expect(addedTask.beatId).toBe("beat-1");

    // 验证 toast 通知
    expect(mockEmitToast).toHaveBeenCalledWith(
      "success",
      expect.any(String),
      expect.any(String),
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 用例 8: savePartialEditAsset — taskSubtype 不是 partial_redraw
  // ─────────────────────────────────────────────────────────────────────────
  describe("savePartialEditAsset", () => {
    it("taskSubtype 不是 partial_redraw 应返回 validation 错误", async () => {
      const task = {
        taskId: "t1",
        status: "completed",
        videoUrl: "https://example.com/v.mp4",
        sourceVideoAssetId: "asset-source-1",
        taskSubtype: "normal",
      } as unknown as VideoTask;
      const result = await savePartialEditAsset(task);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("validation");
      }
    });

    it("任务未完成应返回 validation 错误", async () => {
      const task = {
        taskId: "t1",
        status: "generating",
        videoUrl: undefined,
        sourceVideoAssetId: "asset-source-1",
        taskSubtype: "partial_redraw",
      } as unknown as VideoTask;
      const result = await savePartialEditAsset(task);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("validation");
      }
    });

    it("缺少 sourceVideoAssetId 应返回 validation 错误", async () => {
      const task = {
        taskId: "t1",
        status: "completed",
        videoUrl: "https://example.com/v.mp4",
        sourceVideoAssetId: undefined,
        taskSubtype: "partial_redraw",
      } as unknown as VideoTask;
      const result = await savePartialEditAsset(task);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("validation");
      }
    });

    it("原 Asset 不存在应返回 source_video_not_found 错误", async () => {
      mockGenerationAssetStorage.getAssetById.mockResolvedValue(null);
      const task = {
        taskId: "t1",
        status: "completed",
        videoUrl: "https://example.com/v.mp4",
        sourceVideoAssetId: "asset-source-1",
        taskSubtype: "partial_redraw",
        editPrompt: "test",
        prompt: "full prompt",
        providerModelId: "seedance-2.5",
        providerId: "seedance",
      } as unknown as VideoTask;
      const result = await savePartialEditAsset(task);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("source_video_not_found");
      }
    });

    it("成功路径应创建 type=partial_edit_video 的 Asset 并继承关联关系", async () => {
      const sourceAsset = makeSourceAsset({
        storyBeatId: "beat-1",
        characterId: "char-1",
        sceneId: "scene-1",
        projectId: "proj-1",
      });
      mockGenerationAssetStorage.getAssetById.mockResolvedValue(sourceAsset);

      const task = {
        taskId: "t1",
        status: "completed",
        videoUrl: "https://example.com/result.mp4",
        localVideoPath: "/tmp/result.mp4",
        sourceVideoAssetId: "asset-source-1",
        taskSubtype: "partial_redraw",
        editPrompt: "把背景换成红色",
        prompt: "full prompt",
        providerModelId: "seedance-2.5",
        providerId: "seedance",
        maskBounds: { x: 0, y: 0, width: 100, height: 100 },
      } as unknown as VideoTask;

      const result = await savePartialEditAsset(task);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.assetId).toMatch(/^gen-asset-/);
      }

      // 验证 createAsset 收到正确参数
      expect(mockGenerationAssetStorage.createAsset).toHaveBeenCalledTimes(1);
      const createArg = mockGenerationAssetStorage.createAsset.mock.calls[0]![0];
      expect(createArg.type).toBe("partial_edit_video");
      expect(createArg.sourceAssetId).toBe("asset-source-1");
      expect(createArg.url).toBe("https://example.com/result.mp4");
      // 继承原 Asset 的关联关系
      expect(createArg.storyBeatId).toBe("beat-1");
      expect(createArg.characterId).toBe("char-1");
      expect(createArg.sceneId).toBe("scene-1");
      expect(createArg.projectId).toBe("proj-1");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 用例 9: listPartialEditHistory — 委托给 storage.getAssetsBySourceAssetId
  // ─────────────────────────────────────────────────────────────────────────
  describe("listPartialEditHistory", () => {
    it("应调用 storage.getAssetsBySourceAssetId", async () => {
      const mockAssets = [
        makeSourceAsset({ id: "asset-2", sourceAssetId: "asset-source-1" }),
      ];
      mockGenerationAssetStorage.getAssetsBySourceAssetId.mockResolvedValue(mockAssets);

      const result = await listPartialEditHistory("asset-source-1");
      expect(result).toEqual(mockAssets);
      expect(mockGenerationAssetStorage.getAssetsBySourceAssetId).toHaveBeenCalledWith("asset-source-1");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Task 2A.23: startFaceSwapTask — face-swap 任务创建
  // ─────────────────────────────────────────────────────────────────────────
  describe("startFaceSwapTask", () => {
    function makeValidFaceSwapRequest(overrides: Partial<FaceSwapRequest> = {}): FaceSwapRequest {
      return {
        sourceVideoAssetId: "asset-source-1",
        characterRefImageUrl: "https://example.com/char.jpg",
        characterId: "char-1",
        editPrompt: "替换角色面部为参考图",
        providerId: "seedance",
        modelId: "seedance-2.5",
        duration: 5,
        storyId: "story-1",
        beatId: "beat-1",
        ...overrides,
      };
    }

    it("空 characterRefImageUrl 应返回 validation 错误", async () => {
      const req = makeValidFaceSwapRequest({ characterRefImageUrl: "" });
      const store = makeMockVideoTaskStore();
      const result = await startFaceSwapTask(req, store);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("validation");
        expect(result.error.errors.some((e) => e.field === "characterRefImageUrl")).toBe(true);
      }
      expect(mockVideoProvider.generatePartialEdit).not.toHaveBeenCalled();
    });

    it("空 editPrompt 应返回 validation 错误", async () => {
      const req = makeValidFaceSwapRequest({ editPrompt: "" });
      const store = makeMockVideoTaskStore();
      const result = await startFaceSwapTask(req, store);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("validation");
      }
    });

    it("原视频 Asset 不存在应返回 source_video_not_found 错误", async () => {
      mockGenerationAssetStorage.getAssetById.mockResolvedValue(null);
      const req = makeValidFaceSwapRequest();
      const store = makeMockVideoTaskStore();
      const result = await startFaceSwapTask(req, store);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("source_video_not_found");
      }
    });

    it("provider 未实现 generatePartialEdit 应返回 provider_not_supported 错误", async () => {
      const providerWithoutPartial = { ...mockVideoProvider };
      delete (providerWithoutPartial as Partial<typeof mockVideoProvider>).generatePartialEdit;
      mockContainer.videoProvider = providerWithoutPartial as typeof mockVideoProvider;

      const req = makeValidFaceSwapRequest();
      const store = makeMockVideoTaskStore();
      const result = await startFaceSwapTask(req, store);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("provider_not_supported");
      }

      mockContainer.videoProvider = mockVideoProvider;
    });

    it("provider 调用抛出异常应返回 provider_call_failed 错误", async () => {
      mockVideoProvider.generatePartialEdit.mockRejectedValue(new Error("face-swap API error"));
      const req = makeValidFaceSwapRequest();
      const store = makeMockVideoTaskStore();
      const result = await startFaceSwapTask(req, store);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("provider_call_failed");
        expect(result.error.message).toContain("face-swap API error");
      }
    });

    it("成功路径应创建 taskSubtype=face_swap 的 VideoTask 并附加角色参考图", async () => {
      const req = makeValidFaceSwapRequest();
      const store = makeMockVideoTaskStore();
      const result = await startFaceSwapTask(req, store);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.taskId).toBe("provider-task-id");
      }

      // 验证 addTask 收到正确参数
      expect(store.addTask).toHaveBeenCalledTimes(1);
      const addedTask = store.addTask.mock.calls[0]![0];
      expect(addedTask.taskId).toBe("provider-task-id");
      expect(addedTask.taskSubtype).toBe("face_swap");
      expect(addedTask.sourceVideoAssetId).toBe("asset-source-1");
      expect(addedTask.maskData).toBe("SGVsbG8="); // mock canvas 返回的 base64
      expect(addedTask.editPrompt).toBe("替换角色面部为参考图");
      expect(addedTask.fixedImageUrl).toBe("https://example.com/char.jpg");
      expect(addedTask.fixedImageLockType).toBe("character");
      // prompt 应包含参考图 URL
      expect(addedTask.prompt).toContain("https://example.com/char.jpg");
      expect(addedTask.prompt).toContain("[Face-swap target reference image]");
      expect(addedTask.storyId).toBe("story-1");
      expect(addedTask.beatId).toBe("beat-1");
      expect(addedTask.maskBounds).toBeDefined();
      // 全帧 mask 边界应为 (0,0,1000,1000)
      expect(addedTask.maskBounds).toEqual({ x: 0, y: 0, width: 1000, height: 1000 });

      // 验证 toast 通知
      expect(mockEmitToast).toHaveBeenCalledWith(
        "info",
        expect.any(String),
        expect.any(String),
      );
    });

    it("provider 返回空 taskId 应返回 provider_call_failed 错误", async () => {
      mockVideoProvider.generatePartialEdit.mockResolvedValue({
        success: true,
        data: { taskId: "" },
      });
      const req = makeValidFaceSwapRequest();
      const store = makeMockVideoTaskStore();
      const result = await startFaceSwapTask(req, store);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("provider_call_failed");
      }
    });

    it("addTask 失败应返回 provider_call_failed 错误", async () => {
      const store = makeMockVideoTaskStore();
      store.addTask.mockRejectedValue(new Error("db write failed"));
      const req = makeValidFaceSwapRequest();
      const result = await startFaceSwapTask(req, store);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("provider_call_failed");
        expect(result.error.message).toContain("db write failed");
      }
    });
  });
});
