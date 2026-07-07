/**
 * Subworkflow Tools 单元测试
 *
 * 9 个 auto_* 子流程工具的关键路径测试：
 * - auto_create_character / auto_create_scene：AI 推理 → 创建 → 生成图片
 * - auto_plan_storyboard：创建故事 → 规划分镜 → 校验
 * - auto_generate_beat_full：获取故事 → workflow → 更新媒体
 * - auto_generate_video_full：批量生成 → 轮询 → 字幕/配乐
 * - auto_find_and_import_asset：搜索 → 导入
 * - auto_fix_common_errors：AI 分析 → 修复策略
 * - auto_create_from_novel：读取 → 分析 → 创建 → 规划
 * - auto_polish_video：字幕 → 配乐 → 调色
 *
 * Mock 策略：
 * - container（textProvider/imageProvider/videoProvider）
 * - characterService / sceneService / storyService（动态导入）
 * - planStory / generateBeatFullWorkflow / generateBeatKeyframe（动态导入）
 * - toolExecutor / toolRegistry
 * - loadConfig / getConfig / readFile（动态导入）
 *
 * 测试重点：参数解析、错误传播、降级逻辑、步骤编排
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// vi.hoisted：mock 变量在 vi.mock 工厂执行前就已定义
const mocks = vi.hoisted(() => ({
  textProvider: { generateText: vi.fn() },
  imageProvider: { generateImage: vi.fn() },
  videoProvider: {
    queryVideoStatus: vi.fn(),
    generateVideo: vi.fn(),
    generateKeyframe: vi.fn(),
    generateFramePair: vi.fn(),
    generateVideoWithFrames: vi.fn(),
    cancelTask: vi.fn(),
  },
  characterService: {
    create: vi.fn(),
    update: vi.fn(),
    getAll: vi.fn(),
    getById: vi.fn(),
  },
  sceneService: {
    create: vi.fn(),
    update: vi.fn(),
    getAll: vi.fn(),
    getById: vi.fn(),
  },
  storyService: {
    create: vi.fn(),
    update: vi.fn(),
    getById: vi.fn(),
  },
  planStory: vi.fn(),
  generateBeatFullWorkflow: vi.fn(),
  generateBeatKeyframe: vi.fn(),
  toolExecutor: { execute: vi.fn() },
  toolRegistry: { has: vi.fn() },
  loadConfig: vi.fn(),
  getConfig: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    textProvider: mocks.textProvider,
    imageProvider: mocks.imageProvider,
    videoProvider: mocks.videoProvider,
  },
}));

vi.mock("@/modules/character", () => ({
  characterService: mocks.characterService,
}));

vi.mock("@/modules/scene", () => ({
  sceneService: mocks.sceneService,
}));

vi.mock("@/modules/story", () => ({
  storyService: mocks.storyService,
}));

vi.mock("@/modules/story/planning", () => ({
  planStory: mocks.planStory,
}));

vi.mock("@/modules/story/generation", () => ({
  generateBeatFullWorkflow: mocks.generateBeatFullWorkflow,
  generateBeatKeyframe: mocks.generateBeatKeyframe,
}));

vi.mock("../../services/tool-executor", () => ({
  TOOL_TIMEOUTS: {
    query: 5000,
    mutation: 30000,
    generation: 120000,
    videoTask: 600000,
    download: 60000,
  },
  toolExecutor: mocks.toolExecutor,
}));

vi.mock("../../services/tool-registry", () => ({
  toolRegistry: mocks.toolRegistry,
}));

vi.mock("@/shared/api-config", () => ({
  loadConfig: mocks.loadConfig,
}));

vi.mock("@/shared/file-http", () => ({
  getConfig: mocks.getConfig,
  readFile: mocks.readFile,
}));

// storyBeatSchema 用于 auto_create_from_novel 的校验
vi.mock("@/domain/schemas", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    storyBeatSchema: {
      safeParse: (v: unknown) => ({ success: true, data: v }),
    },
  };
});

import {
  autoCreateCharacterTool,
  autoCreateSceneTool,
  autoPlanStoryboardTool,
  autoGenerateBeatFullTool,
  autoGenerateVideoFullTool,
  autoFindAndImportAssetTool,
  autoFixCommonErrorsTool,
  autoCreateFromNovelTool,
  autoPolishVideoTool,
} from "../subworkflow-tools";
import type { ToolContext } from "../../domain/types";

function makeCtx(): ToolContext {
  return {
    sessionId: "test-session",
    onProgress: vi.fn(),
  };
}

/** 构造成功的 Result */
function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

/** 构造失败的 Result */
function err(error: Error): { ok: false; error: Error } {
  return { ok: false, error };
}

beforeEach(() => {
  // vitest 4 的 clearAllMocks 会重置 mock 实现，改用 resetAllMocks 后显式重建默认值
  vi.resetAllMocks();
  // 默认 mock 行为
  mocks.toolRegistry.has.mockReturnValue(true);
  mocks.toolExecutor.execute.mockResolvedValue({ success: true, data: {} });
});

// ============================================================
// 1. auto_create_character
// ============================================================
describe("auto_create_character", () => {
  it("1. AI 推理失败时返回错误", async () => {
    mocks.textProvider.generateText.mockResolvedValue({
      success: true,
      data: { text: "not a json" },
    });

    const result = await autoCreateCharacterTool.execute(
      { description: "赛博朋克女性侦探" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("AI 推理角色设定失败");
    expect(mocks.characterService.create).not.toHaveBeenCalled();
  });

  it("2. 正常流程：推理 → 创建 → 生成图片", async () => {
    mocks.textProvider.generateText.mockResolvedValue({
      success: true,
      data: {
        text: JSON.stringify({
          name: "艾莉",
          gender: "女性",
          age: 28,
          personality: "冷酷、干练",
          appearance: { hairColor: "银色", clothing: "皮衣" },
          customPrompt: "cyberpunk female detective",
        }),
      },
    });
    mocks.characterService.create.mockResolvedValue(
      ok({ id: "char_1", name: "艾莉" }),
    );
    mocks.characterService.update.mockResolvedValue(ok(undefined));
    mocks.imageProvider.generateImage.mockResolvedValue({
      success: true,
      data: { imageUrl: "https://example.com/img.png" },
    });

    const result = await autoCreateCharacterTool.execute(
      { description: "赛博朋克女性侦探" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { characterId: string; imageUrl: string; steps: string[] };
    expect(data.characterId).toBe("char_1");
    expect(data.imageUrl).toBe("https://example.com/img.png");
    expect(data.steps).toContain("推理设定");
    expect(data.steps).toContain("创建角色");
    expect(data.steps).toContain("生成图片");
  });

  it("3. autoGenerateImage=false 时跳过图片生成", async () => {
    mocks.textProvider.generateText.mockResolvedValue({
      success: true,
      data: { text: JSON.stringify({ name: "测试角色" }) },
    });
    mocks.characterService.create.mockResolvedValue(ok({ id: "c1", name: "测试角色" }));

    const result = await autoCreateCharacterTool.execute(
      { description: "测试", autoGenerateImage: false },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    expect(mocks.imageProvider.generateImage).not.toHaveBeenCalled();
    const data = result.data as { imageUrl: string | undefined; steps: string[] };
    expect(data.imageUrl).toBeUndefined();
    expect(data.steps).not.toContain("生成图片");
  });

  it("4. 创建角色失败时返回错误", async () => {
    mocks.textProvider.generateText.mockResolvedValue({
      success: true,
      data: { text: JSON.stringify({ name: "失败角色" }) },
    });
    mocks.characterService.create.mockResolvedValue(err(new Error("DB error")));

    const result = await autoCreateCharacterTool.execute(
      { description: "测试" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("创建角色失败");
    expect(result.error).toContain("DB error");
  });

  it("5. 图片生成失败不阻断主流程", async () => {
    mocks.textProvider.generateText.mockResolvedValue({
      success: true,
      data: { text: JSON.stringify({ name: "角色", customPrompt: "prompt" }) },
    });
    mocks.characterService.create.mockResolvedValue(ok({ id: "c1", name: "角色" }));
    mocks.imageProvider.generateImage.mockResolvedValue({
      success: false,
      error: "image API down",
    });

    const result = await autoCreateCharacterTool.execute(
      { description: "测试" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { imageUrl: string | undefined; steps: string[] };
    expect(data.imageUrl).toBeUndefined();
    expect(data.steps).not.toContain("生成图片");
  });
});

// ============================================================
// 2. auto_create_scene
// ============================================================
describe("auto_create_scene", () => {
  it("6. 正常流程：推理 → 创建 → 生成图片", async () => {
    mocks.textProvider.generateText.mockResolvedValue({
      success: true,
      data: {
        text: JSON.stringify({
          name: "雨夜街道",
          type: "室外",
          timeOfDay: "夜晚",
          weather: "雨天",
          mood: "紧张",
          lighting: "霓虹灯",
          customPrompt: "rainy cyberpunk street",
        }),
      },
    });
    mocks.sceneService.create.mockResolvedValue(ok({ id: "scene_1", name: "雨夜街道" }));
    mocks.sceneService.update.mockResolvedValue(ok(undefined));
    mocks.imageProvider.generateImage.mockResolvedValue({
      success: true,
      data: { imageUrl: "https://example.com/scene.png" },
    });

    const result = await autoCreateSceneTool.execute(
      { description: "雨夜赛博朋克街道" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { sceneId: string; imageUrl: string };
    expect(data.sceneId).toBe("scene_1");
    expect(data.imageUrl).toBe("https://example.com/scene.png");
  });

  it("7. AI 推理失败时返回错误", async () => {
    mocks.textProvider.generateText.mockResolvedValue({
      success: false,
      error: "LLM error",
    });

    const result = await autoCreateSceneTool.execute(
      { description: "测试场景" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("AI 推理场景设定失败");
  });

  it("8. 创建场景失败时返回错误", async () => {
    mocks.textProvider.generateText.mockResolvedValue({
      success: true,
      data: { text: JSON.stringify({ name: "场景" }) },
    });
    mocks.sceneService.create.mockResolvedValue(err(new Error("权限不足")));

    const result = await autoCreateSceneTool.execute(
      { description: "测试" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("创建场景失败");
    expect(result.error).toContain("权限不足");
  });
});

// ============================================================
// 3. auto_plan_storyboard
// ============================================================
describe("auto_plan_storyboard", () => {
  it("9. 创建故事失败时返回错误", async () => {
    mocks.storyService.create.mockResolvedValue(err(new Error("标题重复")));

    const result = await autoPlanStoryboardTool.execute(
      { title: "测试故事", description: "简介" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("创建故事失败");
    expect(mocks.planStory).not.toHaveBeenCalled();
  });

  it("10. autoPlan=false 时只创建故事不规划分镜", async () => {
    mocks.storyService.create.mockResolvedValue(
      ok({ id: "story_1", title: "测试", beats: [] }),
    );

    const result = await autoPlanStoryboardTool.execute(
      { title: "测试", description: "简介", autoPlan: false },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { storyId: string; beatCount: number; note: string };
    expect(data.storyId).toBe("story_1");
    expect(data.beatCount).toBe(0);
    expect(data.note).toContain("autoPlan=false");
    expect(mocks.planStory).not.toHaveBeenCalled();
  });

  it("11. planStory 失败时返回错误", async () => {
    mocks.storyService.create.mockResolvedValue(
      ok({ id: "story_1", title: "测试", beats: [] }),
    );
    mocks.characterService.getAll.mockResolvedValue(ok([]));
    mocks.sceneService.getAll.mockResolvedValue(ok([]));
    mocks.planStory.mockResolvedValue(err(new Error("AI 规划失败")));

    const result = await autoPlanStoryboardTool.execute(
      { title: "测试", description: "简介" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("规划分镜失败");
    expect(result.error).toContain("AI 规划失败");
  });

  it("12. 正常流程：创建 → 规划 → 校验", async () => {
    const beats = [
      { id: "b1", title: "开场", content: "城市全景", duration: 8, characterIds: [], sceneId: undefined },
      { id: "b2", title: "冲突", content: "", duration: 5, characterIds: ["c_invalid"], sceneId: "s_invalid" },
    ];
    mocks.storyService.create.mockResolvedValue(
      ok({ id: "story_1", title: "测试", beats: [] }),
    );
    mocks.characterService.getAll.mockResolvedValue(ok([{ id: "char_1", name: "角色" }]));
    mocks.sceneService.getAll.mockResolvedValue(ok([{ id: "scene_1", name: "场景" }]));
    mocks.planStory.mockResolvedValue(ok({ beats, autoFixedCount: 0 }));
    mocks.storyService.update.mockResolvedValue(ok(undefined));

    const result = await autoPlanStoryboardTool.execute(
      { title: "测试", description: "简介" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      storyId: string;
      beatCount: number;
      beats: unknown[];
      validationIssues: Array<{ beatId: string; issue: string; severity: string }>;
    };
    expect(data.storyId).toBe("story_1");
    expect(data.beatCount).toBe(2);
    // b2 有空 content + 无效角色/场景引用 → 应该校验出问题
    expect(data.validationIssues).toBeDefined();
    const issueTexts = data.validationIssues.map((i) => i.issue);
    expect(issueTexts.some((t) => t.includes("分镜缺少描述"))).toBe(true);
    expect(issueTexts.some((t) => t.includes("角色引用无效"))).toBe(true);
    expect(issueTexts.some((t) => t.includes("场景引用无效"))).toBe(true);
  });
});

// ============================================================
// 4. auto_generate_beat_full
// ============================================================
describe("auto_generate_beat_full", () => {
  it("13. 故事不存在时返回错误", async () => {
    mocks.storyService.getById.mockResolvedValue(err(new Error("Not found")));

    const result = await autoGenerateBeatFullTool.execute(
      { storyId: "missing", beatId: "b1" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("获取故事失败");
  });

  it("14. 分镜不存在时返回错误", async () => {
    mocks.storyService.getById.mockResolvedValue(
      ok({ id: "s1", title: "故事", beats: [{ id: "b1", content: "c" }] }),
    );

    const result = await autoGenerateBeatFullTool.execute(
      { storyId: "s1", beatId: "missing_beat" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("未找到分镜");
  });

  it("15. workflow 失败时返回错误", async () => {
    mocks.storyService.getById.mockResolvedValue(
      ok({ id: "s1", title: "故事", beats: [{ id: "b1", content: "c" }] }),
    );
    mocks.characterService.getAll.mockResolvedValue(ok([]));
    mocks.sceneService.getAll.mockResolvedValue(ok([]));
    mocks.generateBeatFullWorkflow.mockResolvedValue(err(new Error("视频生成失败")));

    const result = await autoGenerateBeatFullTool.execute(
      { storyId: "s1", beatId: "b1" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("分镜全自动生成失败");
  });

  it("16. 正常流程：生成关键帧/首尾帧/视频任务", async () => {
    const beats = [{ id: "b1", content: "开场", duration: 8 }];
    mocks.storyService.getById.mockResolvedValue(
      ok({ id: "s1", title: "故事", beats }),
    );
    mocks.characterService.getAll.mockResolvedValue(ok([]));
    mocks.sceneService.getAll.mockResolvedValue(ok([]));
    mocks.generateBeatFullWorkflow.mockResolvedValue(
      ok({
        keyframe: { imageUrl: "https://kf.png" },
        framePair: { firstFrameUrl: "https://f1.png", lastFrameUrl: "https://f2.png" },
        videoTaskId: "task_123",
        videoMode: "first_frame_anchor",
      }),
    );
    mocks.storyService.update.mockResolvedValue(ok(undefined));

    const result = await autoGenerateBeatFullTool.execute(
      { storyId: "s1", beatId: "b1" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      beatId: string;
      keyframeUrl: string;
      videoTaskId: string;
      steps: string[];
    };
    expect(data.beatId).toBe("b1");
    expect(data.keyframeUrl).toBe("https://kf.png");
    expect(data.videoTaskId).toBe("task_123");
    expect(data.steps).toEqual(["关键帧", "首尾帧", "视频任务"]);
    // 应该更新故事 beats
    expect(mocks.storyService.update).toHaveBeenCalled();
  });
});

// ============================================================
// 5. auto_generate_video_full
// ============================================================
describe("auto_generate_video_full", () => {
  it("17. 故事无分镜时返回错误", async () => {
    mocks.storyService.getById.mockResolvedValue(
      ok({ id: "s1", title: "故事", beats: [] }),
    );

    const result = await autoGenerateVideoFullTool.execute(
      { storyId: "s1" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("故事没有分镜");
  });

  it("18. 单分镜生成失败不阻断整体流程", async () => {
    const beats = [
      { id: "b1", content: "分镜1", duration: 5 },
      { id: "b2", content: "分镜2", duration: 5 },
    ];
    mocks.storyService.getById.mockResolvedValue(
      ok({ id: "s1", title: "故事", beats, characters: [] }),
    );
    mocks.characterService.getAll.mockResolvedValue(ok([]));
    mocks.sceneService.getAll.mockResolvedValue(ok([]));
    // 第一次失败，第二次成功
    mocks.generateBeatFullWorkflow
      .mockResolvedValueOnce(err(new Error("生成失败")))
      .mockResolvedValueOnce(
        ok({
          keyframe: { imageUrl: "https://kf.png" },
          framePair: { firstFrameUrl: "https://f1.png", lastFrameUrl: "https://f2.png" },
          videoTaskId: "task_ok",
          videoMode: "first_frame_anchor",
        }),
      );
    mocks.storyService.update.mockResolvedValue(ok(undefined));
    // 轮询直接返回完成
    mocks.videoProvider.queryVideoStatus.mockResolvedValue({
      success: true,
      data: { status: "completed", videoUrl: "https://video.mp4" },
    });
    // 字幕工具不存在（优雅降级）
    mocks.toolRegistry.has.mockReturnValue(false);

    const result = await autoGenerateVideoFullTool.execute(
      { storyId: "s1", addSubtitles: false, addMusic: false },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      totalBeats: number;
      completedBeats: number;
      failedBeats: string[];
    };
    expect(data.totalBeats).toBe(2);
    expect(data.completedBeats).toBe(1);
    expect(data.failedBeats).toContain("b1");
  });
});

// ============================================================
// 6. auto_find_and_import_asset
// ============================================================
describe("auto_find_and_import_asset", () => {
  it("19. 搜索失败时返回错误", async () => {
    mocks.toolRegistry.has.mockReturnValue(true);
    mocks.toolExecutor.execute.mockResolvedValue({
      success: false,
      error: "搜索 API 未配置",
    });

    const result = await autoFindAndImportAssetTool.execute(
      { query: "赛博朋克", assetType: "character" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("搜索图片失败");
  });

  it("20. 无搜索结果时返回空列表", async () => {
    mocks.toolExecutor.execute.mockResolvedValue({
      success: true,
      data: { total: 0, items: [] },
    });

    const result = await autoFindAndImportAssetTool.execute(
      { query: "不存在的素材", assetType: "scene" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { searchResults: unknown[]; message: string };
    expect(data.searchResults).toEqual([]);
    expect(data.message).toContain("未找到");
  });

  it("21. autoImport=false 时返回结果列表不自动导入", async () => {
    mocks.toolExecutor.execute.mockResolvedValue({
      success: true,
      data: {
        total: 2,
        items: [
          { title: "图片1", imageUrl: "https://1.png" },
          { title: "图片2", imageUrl: "https://2.png" },
        ],
      },
    });

    const result = await autoFindAndImportAssetTool.execute(
      { query: "角色", assetType: "character", autoImport: false },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      searchResults: Array<{ index: number; title: string }>;
      importedAsset: unknown;
      message: string;
    };
    expect(data.searchResults).toHaveLength(2);
    expect(data.searchResults[0].title).toBe("图片1");
    expect(data.importedAsset).toBeUndefined();
    expect(data.message).toContain("autoImport=false");
    // 只调用了搜索，没调用下载
    expect(mocks.toolExecutor.execute).toHaveBeenCalledTimes(1);
  });

  it("22. autoImport=true 时自动下载第一个结果", async () => {
    // 第一次：搜索；第二次：下载
    mocks.toolExecutor.execute
      .mockResolvedValueOnce({
        success: true,
        data: {
          total: 1,
          items: [{ title: "素材A", imageUrl: "https://a.png" }],
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { id: "asset_1", path: "/local/a.png" },
      });

    const result = await autoFindAndImportAssetTool.execute(
      { query: "素材", assetType: "prop", autoImport: true },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { importedAsset: { id: string } };
    expect(data.importedAsset).toBeDefined();
    expect(data.importedAsset.id).toBe("asset_1");
    expect(mocks.toolExecutor.execute).toHaveBeenCalledTimes(2);
  });

  it("23. 自动导入失败时返回失败", async () => {
    mocks.toolExecutor.execute
      .mockResolvedValueOnce({
        success: true,
        data: {
          total: 1,
          items: [{ title: "素材", imageUrl: "https://broken.png" }],
        },
      })
      .mockResolvedValueOnce({
        success: false,
        error: "下载失败",
      });

    const result = await autoFindAndImportAssetTool.execute(
      { query: "素材", assetType: "character", autoImport: true },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("导入失败");
  });
});

// ============================================================
// 7. auto_fix_common_errors
// ============================================================
describe("auto_fix_common_errors", () => {
  it("24. config_missing 错误且配置完整时测试连接", async () => {
    mocks.textProvider.generateText.mockResolvedValue({
      success: true,
      data: {
        text: JSON.stringify({
          errorType: "config_missing",
          confidence: 0.9,
          suggestedAction: "检查配置",
        }),
      },
    });
    // getConfig 依次返回 apiBaseUrl 和 apiKey（均非空 → 进入测试连接分支）
    mocks.getConfig
      .mockResolvedValueOnce("https://api.test.com")
      .mockResolvedValueOnce("sk-test1234567890");

    const result = await autoFixCommonErrorsTool.execute(
      { errorDescription: "API 调用失败" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { errorType: string; fixed: boolean };
    expect(data.errorType).toBe("config_missing");
    expect(data.fixed).toBe(true);
  });

  it("25. model_not_found 错误时列出可用模型", async () => {
    mocks.textProvider.generateText.mockResolvedValue({
      success: true,
      data: {
        text: JSON.stringify({
          errorType: "model_not_found",
          confidence: 0.95,
          suggestedAction: "使用可用模型",
        }),
      },
    });
    mocks.loadConfig.mockResolvedValue({
      providers: [
        { id: "p1", models: [{ id: "gpt-4" }, { id: "gpt-3.5" }] },
      ],
    });

    const result = await autoFixCommonErrorsTool.execute(
      { errorDescription: "model gpt-5 not found" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { errorType: string; fixAction: string };
    expect(data.errorType).toBe("model_not_found");
    expect(data.fixAction).toContain("gpt-4");
    expect(data.fixAction).toContain("gpt-3.5");
  });

  it("26. quota_exceeded 错误时提示用户手动处理", async () => {
    mocks.textProvider.generateText.mockResolvedValue({
      success: true,
      data: {
        text: JSON.stringify({
          errorType: "quota_exceeded",
          confidence: 0.9,
          suggestedAction: "升级套餐",
        }),
      },
    });

    const result = await autoFixCommonErrorsTool.execute(
      { errorDescription: "429 Too Many Requests" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { errorType: string; fixed: boolean; message: string };
    expect(data.errorType).toBe("quota_exceeded");
    expect(data.fixed).toBe(false);
    expect(data.message).toContain("配额超限");
  });

  it("27. video_generation_failed 且有 taskId 时查询任务状态", async () => {
    mocks.textProvider.generateText.mockResolvedValue({
      success: true,
      data: {
        text: JSON.stringify({
          errorType: "video_generation_failed",
          confidence: 0.85,
          suggestedAction: "恢复任务",
        }),
      },
    });
    mocks.videoProvider.queryVideoStatus.mockResolvedValue({
      success: true,
      data: {
        status: "completed",
        videoUrl: "https://video.example.com/v.mp4",
      },
    });

    const result = await autoFixCommonErrorsTool.execute(
      {
        errorDescription: "视频生成失败",
        errorContext: { taskId: "task_123" },
      },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { errorType: string; fixed: boolean; message: string };
    expect(data.errorType).toBe("video_generation_failed");
    expect(data.fixed).toBe(true);
    expect(data.message).toContain("task_123");
    expect(data.message).toContain("video.example.com");
  });

  it("28. AI 分析返回非 JSON 时按 unknown 处理", async () => {
    mocks.textProvider.generateText.mockResolvedValue({
      success: true,
      data: { text: "无法判断错误类型" },
    });

    const result = await autoFixCommonErrorsTool.execute(
      { errorDescription: "奇怪的错误" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { errorType: string };
    expect(data.errorType).toBe("unknown");
  });
});

// ============================================================
// 8. auto_create_from_novel
// ============================================================
describe("auto_create_from_novel", () => {
  it("29. 无输入时返回错误", async () => {
    const result = await autoCreateFromNovelTool.execute({}, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("必须提供");
  });

  it("30. novelFilePath 读取失败时返回错误", async () => {
    mocks.readFile.mockResolvedValue({
      success: false,
      error: "文件不存在",
    });

    const result = await autoCreateFromNovelTool.execute(
      { novelFilePath: "/missing/novel.txt" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("读取小说文件失败");
  });

  it("31. novelFilePath 读取成功后正常分析", async () => {
    mocks.readFile.mockResolvedValue({
      success: true,
      data: new TextEncoder().encode("小说内容").buffer,
    });
    mocks.textProvider.generateText.mockResolvedValue({
      success: true,
      data: {
        text: JSON.stringify({
          title: "测试小说",
          description: "简介",
          genre: "剧情",
          characters: [{ name: "主角", gender: "男" }],
          scenes: [{ name: "场景1" }],
          plotPoints: ["开端", "发展", "高潮"],
        }),
      },
    });
    mocks.characterService.create.mockResolvedValue(ok({ id: "c1", name: "主角" }));
    mocks.sceneService.create.mockResolvedValue(ok({ id: "s1", name: "场景1" }));
    mocks.storyService.create.mockResolvedValue(
      ok({ id: "story_1", title: "测试小说" }),
    );
    // AI 分镜规划返回数组
    mocks.textProvider.generateText
      .mockResolvedValueOnce({
        success: true,
        data: {
          text: JSON.stringify({
            title: "测试小说",
            description: "简介",
            genre: "剧情",
            characters: [{ name: "主角", gender: "男" }],
            scenes: [{ name: "场景1" }],
            plotPoints: ["开端", "发展", "高潮"],
          }),
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          text: JSON.stringify([
            { title: "分镜1", description: "开场", duration: 8 },
          ]),
        },
      });
    mocks.storyService.update.mockResolvedValue(ok(undefined));

    const result = await autoCreateFromNovelTool.execute(
      { novelFilePath: "/novel.txt", maxBeats: 1 },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      storyId: string;
      createdCharacters: unknown[];
      createdScenes: unknown[];
      beatCount: number;
    };
    expect(data.storyId).toBe("story_1");
    expect(data.createdCharacters).toHaveLength(1);
    expect(data.createdScenes).toHaveLength(1);
    expect(data.beatCount).toBe(1);
  });

  it("32. AI 分析失败时返回错误", async () => {
    mocks.textProvider.generateText.mockResolvedValue({
      success: true,
      data: { text: "not json" },
    });

    const result = await autoCreateFromNovelTool.execute(
      { novelText: "小说内容" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("AI 分析小说失败");
  });
});

// ============================================================
// 9. auto_polish_video
// ============================================================
describe("auto_polish_video", () => {
  it("33. 无 storyId 时用 AI 生成字幕", async () => {
    mocks.textProvider.generateText.mockResolvedValue({
      success: true,
      data: {
        text: JSON.stringify([
          { text: "字幕1", startTime: 0, endTime: 3 },
        ]),
      },
    });
    mocks.toolRegistry.has.mockReturnValue(true);
    mocks.toolExecutor.execute.mockResolvedValue({
      success: true,
      data: { outputPath: "/out/sub.mp4" },
    });

    const result = await autoPolishVideoTool.execute(
      { videoPath: "/in/v.mp4" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      outputPath: string;
      addedSubtitles: boolean;
      steps: string[];
    };
    expect(data.addedSubtitles).toBe(true);
    expect(data.outputPath).toBe("/out/sub.mp4");
    expect(data.steps).toContain("字幕");
  });

  it("34. addSubtitles=false 时跳过字幕", async () => {
    const result = await autoPolishVideoTool.execute(
      { videoPath: "/v.mp4", addSubtitles: false },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { addedSubtitles: boolean; steps: string[] };
    expect(data.addedSubtitles).toBe(false);
    expect(data.steps).not.toContain("字幕");
  });

  it("35. 字幕工具不可用时优雅降级", async () => {
    mocks.textProvider.generateText.mockResolvedValue({
      success: true,
      data: {
        text: JSON.stringify([{ text: "字幕", startTime: 0, endTime: 3 }]),
      },
    });
    mocks.toolRegistry.has.mockReturnValue(false);

    const result = await autoPolishVideoTool.execute(
      { videoPath: "/v.mp4" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { addedSubtitles: boolean };
    // 工具不存在 → executeTool 返回失败 → addedSubtitles=false
    expect(data.addedSubtitles).toBe(false);
  });

  it("36. colorGrade 非 none 时优雅降级（视频不支持调色）", async () => {
    const result = await autoPolishVideoTool.execute(
      { videoPath: "/v.mp4", addSubtitles: false, colorGrade: "cinematic" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { colorGraded: boolean };
    expect(data.colorGraded).toBe(false);
  });

  it("37. addMusic=true 且配乐工具失败时优雅降级", async () => {
    mocks.toolRegistry.has.mockReturnValue(true);
    mocks.toolExecutor.execute.mockResolvedValue({
      success: false,
      error: "音乐生成未实现",
    });

    const result = await autoPolishVideoTool.execute(
      { videoPath: "/v.mp4", addSubtitles: false, addMusic: true },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { addedMusic: boolean };
    expect(data.addedMusic).toBe(false);
  });
});
