/**
 * Story Tools 单元测试
 *
 * 覆盖 13 个故事工具：
 * - list_stories / get_story / create_story / update_story / delete_story
 * - plan_story / validate_story_plan / generate_style_guide / generate_frame_prompts
 * - generate_story_ideas / suggest_character_backstory / suggest_scene_description
 * - check_story_consistency
 *
 * Mock 策略：
 * - container（textProvider / imageProvider）
 * - storyService / characterService / sceneService（动态 import）
 * - planStory（@/modules/story/planning）
 * - generateStyleGuide / generateFramePrompts / batchGenerateFramePrompts（@/modules/story）
 * - TOOL_TIMEOUTS（../../services/tool-executor）
 *
 * 测试重点：参数解析、Result 模式错误传播、分页/过滤逻辑、降级路径
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// vi.hoisted：mock 变量在 vi.mock 工厂执行前就已定义
const mocks = vi.hoisted(() => ({
  textProvider: { generateText: vi.fn() },
  imageProvider: { generateImage: vi.fn(), analyzeImage: vi.fn() },
  storyService: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  characterService: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  sceneService: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  planStory: vi.fn(),
  generateStyleGuide: vi.fn(),
  generateFramePrompts: vi.fn(),
  batchGenerateFramePrompts: vi.fn(),
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    textProvider: mocks.textProvider,
    imageProvider: mocks.imageProvider,
  },
}));

vi.mock("@/modules/story", () => ({
  storyService: mocks.storyService,
  generateStyleGuide: mocks.generateStyleGuide,
  generateFramePrompts: mocks.generateFramePrompts,
  batchGenerateFramePrompts: mocks.batchGenerateFramePrompts,
}));

vi.mock("@/modules/story/planning", () => ({
  planStory: mocks.planStory,
}));

vi.mock("@/modules/character", () => ({
  characterService: mocks.characterService,
}));

vi.mock("@/modules/scene", () => ({
  sceneService: mocks.sceneService,
}));

vi.mock("../../services/tool-executor", () => ({
  TOOL_TIMEOUTS: {
    query: 5000,
    mutation: 30000,
    generation: 120000,
    videoTask: 600000,
    download: 60000,
  },
}));

import {
  listStoriesTool,
  getStoryTool,
  createStoryTool,
  updateStoryTool,
  deleteStoryTool,
  planStoryTool,
  validateStoryPlanTool,
  generateStyleGuideTool,
  generateFramePromptsTool,
  generateStoryIdeasTool,
  suggestCharacterBackstoryTool,
  suggestSceneDescriptionTool,
  checkStoryConsistencyTool,
  storyTools,
} from "../story-tools";
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

/** 构造 ApiResponse 成功 */
function apiOk<T>(data: T) {
  return { success: true as const, data };
}

/** 构造 ApiResponse 失败 */
function apiErr(error: string) {
  return { success: false as const, error };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ============================================================
// 1. list_stories
// ============================================================
describe("list_stories", () => {
  it("1. 正常列出所有故事（无过滤参数）", async () => {
    const stories = [
      {
        id: "s1",
        title: "故事A",
        beats: [{ id: "b1" }, { id: "b2" }],
        createdAt: 1000,
        updatedAt: 2000,
      },
      {
        id: "s2",
        title: "故事B",
        beats: [],
        createdAt: 3000,
        updatedAt: 4000,
      },
    ];
    mocks.storyService.getAll.mockResolvedValue(ok(stories));

    const result = await listStoriesTool.execute({}, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as {
      total: number;
      offset: number;
      limit: number;
      items: Array<{ id: string; title: string; beatCount: number }>;
    };
    expect(data.total).toBe(2);
    expect(data.offset).toBe(0);
    expect(data.limit).toBe(20);
    expect(data.items).toHaveLength(2);
    expect(data.items[0].beatCount).toBe(2);
    expect(data.items[1].beatCount).toBe(0);
  });

  it("2. 按标题过滤 + 分页参数生效", async () => {
    const stories = [
      { id: "s1", title: "森林冒险", beats: [], createdAt: 1, updatedAt: 2 },
      { id: "s2", title: "海底冒险", beats: [], createdAt: 3, updatedAt: 4 },
      { id: "s3", title: "城市故事", beats: [], createdAt: 5, updatedAt: 6 },
    ];
    mocks.storyService.getAll.mockResolvedValue(ok(stories));

    const result = await listStoriesTool.execute(
      { title: "冒险", limit: 10, offset: 1 },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      total: number;
      offset: number;
      limit: number;
      items: Array<{ id: string }>;
    };
    // 过滤后剩 2 条，offset 1 后取 1 条
    expect(data.total).toBe(2);
    expect(data.offset).toBe(1);
    expect(data.limit).toBe(10);
    expect(data.items).toHaveLength(1);
    expect(data.items[0].id).toBe("s2");
  });

  it("3. limit 超过 100 时被截断为 100", async () => {
    mocks.storyService.getAll.mockResolvedValue(ok([]));

    const result = await listStoriesTool.execute(
      { limit: 500 },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { limit: number };
    expect(data.limit).toBe(100);
  });

  it("4. storyService 失败时返回错误", async () => {
    mocks.storyService.getAll.mockResolvedValue(err(new Error("DB connection lost")));

    const result = await listStoriesTool.execute({}, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("获取故事列表失败");
    expect(result.error).toContain("DB connection lost");
  });
});

// ============================================================
// 2. get_story
// ============================================================
describe("get_story", () => {
  it("5. 正常获取故事详情", async () => {
    const story = {
      id: "s1",
      title: "测试故事",
      description: "简介",
      beats: [{ id: "b1", content: "开场" }],
    };
    mocks.storyService.getById.mockResolvedValue(ok(story));

    const result = await getStoryTool.execute({ storyId: "s1" }, makeCtx());

    expect(result.success).toBe(true);
    expect(mocks.storyService.getById).toHaveBeenCalledWith("s1");
    const data = result.data as { id: string; beats: unknown[] };
    expect(data.id).toBe("s1");
    expect(data.beats).toHaveLength(1);
  });

  it("6. 故事不存在时返回错误", async () => {
    mocks.storyService.getById.mockResolvedValue(err(new Error("Not found")));

    const result = await getStoryTool.execute({ storyId: "missing" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("获取故事失败");
    expect(result.error).toContain("Not found");
  });
});

// ============================================================
// 3. create_story
// ============================================================
describe("create_story", () => {
  it("7. 正常创建故事（含所有可选字段）", async () => {
    const created = {
      id: "s_new",
      title: "新故事",
      description: "描述",
      genre: "奇幻",
      targetDuration: 90,
      characters: ["c1", "c2"],
      scenes: ["sc1"],
      createdAt: 12345,
    };
    mocks.storyService.create.mockResolvedValue(ok(created));

    const result = await createStoryTool.execute(
      {
        title: "新故事",
        description: "描述",
        targetDuration: 90,
        style: "奇幻",
        characters: ["c1", "c2"],
        scenes: ["sc1"],
      },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    // 验证 style 参数被映射到 genre 字段
    const createArgs = mocks.storyService.create.mock.calls[0][0];
    expect(createArgs.genre).toBe("奇幻");
    expect(createArgs.beats).toEqual([]);
    expect(createArgs.elementIds).toEqual([]);
    const data = result.data as { id: string; genre: string; targetDuration: number };
    expect(data.id).toBe("s_new");
    expect(data.genre).toBe("奇幻");
    expect(data.targetDuration).toBe(90);
  });

  it("8. 未提供 targetDuration 时默认 60", async () => {
    mocks.storyService.create.mockResolvedValue(
      ok({ id: "s1", title: "T", description: "D", targetDuration: 60 }),
    );

    await createStoryTool.execute(
      { title: "T", description: "D" },
      makeCtx(),
    );

    const createArgs = mocks.storyService.create.mock.calls[0][0];
    expect(createArgs.targetDuration).toBe(60);
  });

  it("9. storyService.create 失败时返回错误", async () => {
    mocks.storyService.create.mockResolvedValue(err(new Error("标题重复")));

    const result = await createStoryTool.execute(
      { title: "重复", description: "D" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("创建故事失败");
    expect(result.error).toContain("标题重复");
  });
});

// ============================================================
// 4. update_story
// ============================================================
describe("update_story", () => {
  it("10. 正常更新故事（仅传部分字段）", async () => {
    mocks.storyService.update.mockResolvedValue(ok({ id: "s1" }));

    const result = await updateStoryTool.execute(
      { storyId: "s1", title: "新标题" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { updated: boolean; storyId: string };
    expect(data.updated).toBe(true);
    expect(data.storyId).toBe("s1");
    const updateArgs = mocks.storyService.update.mock.calls[0][1];
    expect(updateArgs.title).toBe("新标题");
    expect(updateArgs.description).toBeUndefined();
    expect(updateArgs.id).toBe("s1");
  });

  it("11. style 参数映射到 genre 字段", async () => {
    mocks.storyService.update.mockResolvedValue(ok({}));

    await updateStoryTool.execute(
      { storyId: "s1", style: "悬疑" },
      makeCtx(),
    );

    const updateArgs = mocks.storyService.update.mock.calls[0][1];
    expect(updateArgs.genre).toBe("悬疑");
  });

  it("12. update 失败时返回错误", async () => {
    mocks.storyService.update.mockResolvedValue(err(new Error("权限不足")));

    const result = await updateStoryTool.execute(
      { storyId: "s1", title: "X" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("更新故事失败");
    expect(result.error).toContain("权限不足");
  });
});

// ============================================================
// 5. delete_story
// ============================================================
describe("delete_story", () => {
  it("13. 正常删除故事", async () => {
    mocks.storyService.delete.mockResolvedValue(ok(undefined));

    const result = await deleteStoryTool.execute({ storyId: "s1" }, makeCtx());

    expect(result.success).toBe(true);
    expect(mocks.storyService.delete).toHaveBeenCalledWith("s1");
    const data = result.data as { deleted: boolean; storyId: string };
    expect(data.deleted).toBe(true);
    expect(data.storyId).toBe("s1");
  });

  it("14. delete 失败时返回错误", async () => {
    mocks.storyService.delete.mockResolvedValue(err(new Error("故事不存在")));

    const result = await deleteStoryTool.execute({ storyId: "missing" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("删除故事失败");
    expect(result.error).toContain("故事不存在");
  });

  it("15. 工具配置：requiresConfirmation=true", () => {
    expect(deleteStoryTool.requiresConfirmation).toBe(true);
  });
});

// ============================================================
// 6. plan_story
// ============================================================
describe("plan_story", () => {
  it("16. 正常规划分镜并更新故事", async () => {
    const story = { id: "s1", title: "故事", description: "D" };
    mocks.storyService.getById.mockResolvedValue(ok(story));
    mocks.characterService.getAll.mockResolvedValue(ok([{ id: "c1" }]));
    mocks.sceneService.getAll.mockResolvedValue(ok([{ id: "sc1" }]));
    const beats = [
      { id: "b1", content: "开场" },
      { id: "b2", content: "冲突" },
      { id: "b3", content: "结局" },
    ];
    mocks.planStory.mockResolvedValue(
      ok({ beats, autoFixedCount: 1, retryCount: 2, fixDetails: [] }),
    );
    mocks.storyService.update.mockResolvedValue(ok({}));

    const result = await planStoryTool.execute(
      { storyId: "s1", maxBeats: 2, enhancedGeneration: true, strictMode: true },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    // 验证 planStory 被调用时参数正确
    const planArgs = mocks.planStory.mock.calls[0];
    expect(planArgs[0]).toEqual(story);
    expect(planArgs[3]).toEqual({ enhancedGeneration: true, strictMode: true });
    const data = result.data as {
      beats: unknown[];
      autoFixedCount: number;
      retryCount: number;
    };
    // maxBeats=2 应裁剪 beats
    expect(data.beats).toHaveLength(2);
    expect(data.autoFixedCount).toBe(1);
    expect(data.retryCount).toBe(2);
  });

  it("17. 故事不存在时返回错误", async () => {
    mocks.storyService.getById.mockResolvedValue(err(new Error("Not found")));

    const result = await planStoryTool.execute({ storyId: "missing" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("获取故事失败");
    expect(mocks.planStory).not.toHaveBeenCalled();
  });

  it("18. planStory 失败时返回错误", async () => {
    mocks.storyService.getById.mockResolvedValue(ok({ id: "s1" }));
    mocks.characterService.getAll.mockResolvedValue(ok([]));
    mocks.sceneService.getAll.mockResolvedValue(ok([]));
    mocks.planStory.mockResolvedValue(err(new Error("AI 规划失败")));

    const result = await planStoryTool.execute({ storyId: "s1" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("规划故事分镜失败");
    expect(result.error).toContain("AI 规划失败");
  });

  it("19. 分镜生成成功但保存失败时仍返回成功 + warning", async () => {
    mocks.storyService.getById.mockResolvedValue(ok({ id: "s1" }));
    mocks.characterService.getAll.mockResolvedValue(ok([]));
    mocks.sceneService.getAll.mockResolvedValue(ok([]));
    mocks.planStory.mockResolvedValue(
      ok({ beats: [{ id: "b1" }], autoFixedCount: 0, retryCount: 0, fixDetails: [] }),
    );
    mocks.storyService.update.mockResolvedValue(err(new Error("保存失败")));

    const result = await planStoryTool.execute({ storyId: "s1" }, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as { beats: unknown[]; warning: string };
    expect(data.beats).toHaveLength(1);
    expect(data.warning).toContain("保存到故事失败");
    expect(data.warning).toContain("保存失败");
  });
});

// ============================================================
// 7. validate_story_plan
// ============================================================
describe("validate_story_plan", () => {
  it("20. 故事无分镜时返回 valid=false", async () => {
    mocks.storyService.getById.mockResolvedValue(ok({ id: "s1", beats: [] }));

    const result = await validateStoryPlanTool.execute({ storyId: "s1" }, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as {
      valid: boolean;
      issues: Array<{ issue: string; severity: string }>;
    };
    expect(data.valid).toBe(false);
    expect(data.issues).toHaveLength(1);
    expect(data.issues[0].issue).toContain("没有任何分镜");
    expect(data.issues[0].severity).toBe("error");
  });

  it("21. 分镜无问题（角色/场景引用均有效）", async () => {
    const beats = [
      {
        id: "b1",
        content: "开场描述",
        duration: 8,
        characterIds: ["c1"],
        sceneId: "sc1",
      },
    ];
    mocks.storyService.getById.mockResolvedValue(ok({ id: "s1", beats }));
    mocks.characterService.getAll.mockResolvedValue(ok([{ id: "c1" }]));
    mocks.sceneService.getAll.mockResolvedValue(ok([{ id: "sc1" }]));

    const result = await validateStoryPlanTool.execute({ storyId: "s1" }, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as { valid: boolean; issues: unknown[] };
    expect(data.valid).toBe(true);
    expect(data.issues).toEqual([]);
  });

  it("22. 分镜存在多种问题（空描述 + 无效引用）", async () => {
    const beats = [
      {
        id: "b1",
        content: "",
        duration: 0,
        characterIds: ["c_invalid"],
        sceneId: "sc_invalid",
      },
    ];
    mocks.storyService.getById.mockResolvedValue(ok({ id: "s1", beats }));
    mocks.characterService.getAll.mockResolvedValue(ok([{ id: "c1" }]));
    mocks.sceneService.getAll.mockResolvedValue(ok([{ id: "sc1" }]));

    const result = await validateStoryPlanTool.execute({ storyId: "s1" }, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as {
      valid: boolean;
      issues: Array<{ beatId: string; issue: string; severity: string }>;
    };
    // 包含 error：空描述 → valid=false
    expect(data.valid).toBe(false);
    const issueTexts = data.issues.map((i) => i.issue);
    expect(issueTexts.some((t) => t.includes("缺少描述"))).toBe(true);
    expect(issueTexts.some((t) => t.includes("时长无效"))).toBe(true);
    expect(issueTexts.some((t) => t.includes("角色引用无效"))).toBe(true);
    expect(issueTexts.some((t) => t.includes("场景引用无效"))).toBe(true);
  });

  it("23. 故事不存在时返回错误", async () => {
    mocks.storyService.getById.mockResolvedValue(err(new Error("Not found")));

    const result = await validateStoryPlanTool.execute({ storyId: "missing" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("获取故事失败");
  });
});

// ============================================================
// 8. generate_style_guide
// ============================================================
describe("generate_style_guide", () => {
  it("24. 正常生成风格指南", async () => {
    const story = {
      id: "s1",
      title: "故事",
      description: "D",
      genre: "奇幻",
      tone: "紧张",
      characters: ["c1"],
      scenes: ["sc1"],
    };
    mocks.storyService.getById.mockResolvedValue(ok(story));
    mocks.characterService.getAll.mockResolvedValue(ok([{ id: "c1", name: "角色A" }]));
    mocks.sceneService.getAll.mockResolvedValue(ok([{ id: "sc1", name: "场景A" }]));
    const styleGuide = { artStyle: "水彩", palette: ["#fff", "#000"] };
    mocks.generateStyleGuide.mockResolvedValue(ok(styleGuide));

    const result = await generateStyleGuideTool.execute(
      { storyId: "s1", styleDescription: "水彩绘本风" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual(styleGuide);
    // 验证调用参数
    const args = mocks.generateStyleGuide.mock.calls[0][0];
    expect(args.storyTitle).toBe("故事");
    expect(args.customArtStyle).toBe("水彩绘本风");
    expect(args.textProvider).toBeDefined();
    expect(args.imageProvider).toBeDefined();
    // 角色和场景应被过滤到故事关联的
    expect(args.characters).toHaveLength(1);
    expect(args.scenes).toHaveLength(1);
  });

  it("25. 故事不存在时返回错误", async () => {
    mocks.storyService.getById.mockResolvedValue(err(new Error("Not found")));

    const result = await generateStyleGuideTool.execute({ storyId: "missing" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("获取故事失败");
  });

  it("26. generateStyleGuide 失败时返回错误", async () => {
    mocks.storyService.getById.mockResolvedValue(ok({ id: "s1", title: "T" }));
    mocks.characterService.getAll.mockResolvedValue(ok([]));
    mocks.sceneService.getAll.mockResolvedValue(ok([]));
    mocks.generateStyleGuide.mockResolvedValue(err(new Error("LLM 失败")));

    const result = await generateStyleGuideTool.execute({ storyId: "s1" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("生成风格指南失败");
    expect(result.error).toContain("LLM 失败");
  });
});

// ============================================================
// 9. generate_frame_prompts
// ============================================================
describe("generate_frame_prompts", () => {
  it("27. 故事无分镜时返回错误", async () => {
    mocks.storyService.getById.mockResolvedValue(ok({ id: "s1", beats: [] }));

    const result = await generateFramePromptsTool.execute({ storyId: "s1" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("没有分镜");
    expect(result.error).toContain("plan_story");
  });

  it("28. 指定 beatId 单个生成", async () => {
    const beats = [
      { id: "b1", content: "开场" },
      { id: "b2", content: "冲突" },
    ];
    mocks.storyService.getById.mockResolvedValue(
      ok({ id: "s1", beats, characters: [], scenes: [], styleGuide: {} }),
    );
    mocks.characterService.getAll.mockResolvedValue(ok([]));
    mocks.sceneService.getAll.mockResolvedValue(ok([]));
    mocks.generateFramePrompts.mockResolvedValue(
      ok({ firstFramePrompt: "first", lastFramePrompt: "last" }),
    );

    const result = await generateFramePromptsTool.execute(
      { storyId: "s1", beatId: "b1" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      prompts: Array<{ beatId: string; firstFramePrompt: string; lastFramePrompt: string }>;
    };
    expect(data.prompts).toHaveLength(1);
    expect(data.prompts[0].beatId).toBe("b1");
    expect(data.prompts[0].firstFramePrompt).toBe("first");
    expect(data.prompts[0].lastFramePrompt).toBe("last");
  });

  it("29. 指定不存在的 beatId 时返回错误", async () => {
    mocks.storyService.getById.mockResolvedValue(
      ok({ id: "s1", beats: [{ id: "b1", content: "c" }] }),
    );
    mocks.characterService.getAll.mockResolvedValue(ok([]));
    mocks.sceneService.getAll.mockResolvedValue(ok([]));

    const result = await generateFramePromptsTool.execute(
      { storyId: "s1", beatId: "missing_beat" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("未找到分镜");
    expect(result.error).toContain("missing_beat");
  });

  it("30. 不指定 beatId 时批量生成所有分镜", async () => {
    const beats = [
      { id: "b1", content: "开场" },
      { id: "b2", content: "冲突" },
    ];
    mocks.storyService.getById.mockResolvedValue(
      ok({ id: "s1", beats, characters: [], scenes: [], styleGuide: {} }),
    );
    mocks.characterService.getAll.mockResolvedValue(ok([]));
    mocks.sceneService.getAll.mockResolvedValue(ok([]));
    const map = new Map([
      ["b1", { firstFramePrompt: "f1", lastFramePrompt: "l1" }],
      ["b2", { firstFramePrompt: "f2", lastFramePrompt: "l2" }],
    ]);
    mocks.batchGenerateFramePrompts.mockResolvedValue(ok(map));

    const result = await generateFramePromptsTool.execute({ storyId: "s1" }, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as {
      prompts: Array<{ beatId: string; firstFramePrompt: string }>;
    };
    expect(data.prompts).toHaveLength(2);
    expect(data.prompts[0].firstFramePrompt).toBe("f1");
    expect(data.prompts[1].firstFramePrompt).toBe("f2");
  });

  it("31. 批量生成失败时返回错误", async () => {
    mocks.storyService.getById.mockResolvedValue(
      ok({ id: "s1", beats: [{ id: "b1", content: "c" }], characters: [], scenes: [] }),
    );
    mocks.characterService.getAll.mockResolvedValue(ok([]));
    mocks.sceneService.getAll.mockResolvedValue(ok([]));
    mocks.batchGenerateFramePrompts.mockResolvedValue(err(new Error("LLM error")));

    const result = await generateFramePromptsTool.execute({ storyId: "s1" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("批量生成帧提示词失败");
  });
});

// ============================================================
// 10. generate_story_ideas
// ============================================================
describe("generate_story_ideas", () => {
  it("32. 正常生成多个故事创意", async () => {
    const ideas = [
      { title: "创意A", description: "A简介", keyScenes: ["s1"], suggestedDuration: 60 },
      { title: "创意B", description: "B简介", keyScenes: ["s2"], suggestedDuration: 90 },
    ];
    mocks.textProvider.generateText.mockResolvedValue(
      apiOk({ text: JSON.stringify(ideas) }),
    );

    const result = await generateStoryIdeasTool.execute(
      { theme: "友情", count: 2, style: "温馨" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { ideas: Array<{ title: string }> };
    expect(data.ideas).toHaveLength(2);
    expect(data.ideas[0].title).toBe("创意A");
    // 验证 prompt 中包含 theme 和 style
    const prompt = mocks.textProvider.generateText.mock.calls[0][0];
    expect(prompt).toContain("友情");
    expect(prompt).toContain("温馨");
    // 验证调用参数
    const opts = mocks.textProvider.generateText.mock.calls[0][1];
    expect(opts.maxTokens).toBe(2048);
    expect(opts.temperature).toBe(0.8);
  });

  it("33. count 超出范围时被夹紧到 [1,10]", async () => {
    mocks.textProvider.generateText.mockResolvedValue(apiOk({ text: "[]" }));

    await generateStoryIdeasTool.execute({ theme: "T", count: 50 }, makeCtx());

    const prompt = mocks.textProvider.generateText.mock.calls[0][0];
    // count 被夹紧为 10
    expect(prompt).toContain("10 个动画故事创意");
  });

  it("34. textProvider 返回失败时返回错误", async () => {
    mocks.textProvider.generateText.mockResolvedValue(apiErr("LLM 不可用"));

    const result = await generateStoryIdeasTool.execute({ theme: "T" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("LLM 不可用");
  });

  it("35. AI 返回非 JSON 时返回格式错误", async () => {
    mocks.textProvider.generateText.mockResolvedValue(apiOk({ text: "这不是 JSON" }));

    const result = await generateStoryIdeasTool.execute({ theme: "T" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("格式错误");
  });

  it("36. AI 返回畸形 JSON 时返回解析错误", async () => {
    // 输入需匹配 /\[[\s\S]*\]/ 但 JSON.parse 失败（含 [ ] 但内容非法）
    mocks.textProvider.generateText.mockResolvedValue(apiOk({ text: "[invalid json]" }));

    const result = await generateStoryIdeasTool.execute({ theme: "T" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("解析故事创意失败");
  });
});

// ============================================================
// 11. suggest_character_backstory
// ============================================================
describe("suggest_character_backstory", () => {
  it("37. 正常生成角色背景故事", async () => {
    const character = {
      id: "c1",
      name: "艾莉",
      gender: "女",
      age: 25,
      style: "赛博朋克",
      description: "侦探",
    };
    mocks.characterService.getById.mockResolvedValue(ok(character));
    mocks.textProvider.generateText.mockResolvedValue(apiOk({ text: "  背景故事文本  " }));

    const result = await suggestCharacterBackstoryTool.execute(
      { characterId: "c1", storyContext: "在雨夜遇见同伴" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { backstory: string };
    expect(data.backstory).toBe("背景故事文本");
    // 验证 prompt 包含角色信息和故事上下文
    const prompt = mocks.textProvider.generateText.mock.calls[0][0];
    expect(prompt).toContain("艾莉");
    expect(prompt).toContain("赛博朋克");
    expect(prompt).toContain("在雨夜遇见同伴");
  });

  it("38. 角色不存在时返回错误", async () => {
    mocks.characterService.getById.mockResolvedValue(err(new Error("Not found")));

    const result = await suggestCharacterBackstoryTool.execute(
      { characterId: "missing" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("获取角色失败");
  });

  it("39. textProvider 失败时返回错误", async () => {
    mocks.characterService.getById.mockResolvedValue(ok({ id: "c1", name: "T" }));
    mocks.textProvider.generateText.mockResolvedValue(apiErr("配额超限"));

    const result = await suggestCharacterBackstoryTool.execute(
      { characterId: "c1" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("配额超限");
  });
});

// ============================================================
// 12. suggest_scene_description
// ============================================================
describe("suggest_scene_description", () => {
  it("40. 正常生成场景描述", async () => {
    const scene = {
      id: "sc1",
      name: "雨夜街道",
      type: "室外",
      timeOfDay: "夜晚",
      weather: "雨天",
      mood: "紧张",
      lighting: "霓虹灯",
      description: "现有描述",
    };
    mocks.sceneService.getById.mockResolvedValue(ok(scene));
    mocks.textProvider.generateText.mockResolvedValue(apiOk({ text: "详细场景描述" }));

    const result = await suggestSceneDescriptionTool.execute(
      { sceneId: "sc1", storyContext: "主角抵达" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { description: string };
    expect(data.description).toBe("详细场景描述");
    // 验证 prompt
    const prompt = mocks.textProvider.generateText.mock.calls[0][0];
    expect(prompt).toContain("雨夜街道");
    expect(prompt).toContain("霓虹灯");
    expect(prompt).toContain("主角抵达");
  });

  it("41. 场景不存在时返回错误", async () => {
    mocks.sceneService.getById.mockResolvedValue(err(new Error("Not found")));

    const result = await suggestSceneDescriptionTool.execute(
      { sceneId: "missing" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("获取场景失败");
  });
});

// ============================================================
// 13. check_story_consistency
// ============================================================
describe("check_story_consistency", () => {
  it("42. 正常分析一致性（无问题）", async () => {
    const beats = [
      { id: "b1", title: "开场", content: "城市全景", duration: 8, characterIds: [], sceneId: undefined },
      { id: "b2", title: "冲突", content: "主角冲突", duration: 5, characterIds: ["c1"] },
    ];
    mocks.storyService.getById.mockResolvedValue(ok({ id: "s1", title: "故事", description: "D", beats }));
    mocks.textProvider.generateText.mockResolvedValue(
      apiOk({ text: JSON.stringify({ consistent: true, issues: [] }) }),
    );

    const result = await checkStoryConsistencyTool.execute({ storyId: "s1" }, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as { consistent: boolean; issues: unknown[] };
    expect(data.consistent).toBe(true);
    expect(data.issues).toEqual([]);
    // 验证 prompt 包含分镜摘要
    const prompt = mocks.textProvider.generateText.mock.calls[0][0];
    expect(prompt).toContain("城市全景");
    expect(prompt).toContain("主角冲突");
  });

  it("43. 故事无分镜时返回错误", async () => {
    mocks.storyService.getById.mockResolvedValue(ok({ id: "s1", beats: [] }));

    const result = await checkStoryConsistencyTool.execute({ storyId: "s1" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("没有分镜");
    expect(result.error).toContain("无法进行一致性检查");
  });

  it("44. 故事不存在时返回错误", async () => {
    mocks.storyService.getById.mockResolvedValue(err(new Error("Not found")));

    const result = await checkStoryConsistencyTool.execute({ storyId: "missing" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("获取故事失败");
  });

  it("45. AI 返回非 JSON 时返回格式错误", async () => {
    mocks.storyService.getById.mockResolvedValue(
      ok({ id: "s1", beats: [{ id: "b1", content: "c" }] }),
    );
    mocks.textProvider.generateText.mockResolvedValue(apiOk({ text: "不是 JSON" }));

    const result = await checkStoryConsistencyTool.execute({ storyId: "s1" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("格式错误");
  });

  it("46. textProvider 失败时返回错误", async () => {
    mocks.storyService.getById.mockResolvedValue(
      ok({ id: "s1", beats: [{ id: "b1", content: "c" }] }),
    );
    mocks.textProvider.generateText.mockResolvedValue(apiErr("API 故障"));

    const result = await checkStoryConsistencyTool.execute({ storyId: "s1" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("API 故障");
  });
});

// ============================================================
// 导出数组完整性检查
// ============================================================
describe("storyTools 导出", () => {
  it("47. 应包含全部 13 个工具", () => {
    expect(storyTools).toHaveLength(13);
    const names = storyTools.map((t) => t.def.function.name);
    expect(names).toContain("list_stories");
    expect(names).toContain("get_story");
    expect(names).toContain("create_story");
    expect(names).toContain("update_story");
    expect(names).toContain("delete_story");
    expect(names).toContain("plan_story");
    expect(names).toContain("validate_story_plan");
    expect(names).toContain("generate_style_guide");
    expect(names).toContain("generate_frame_prompts");
    expect(names).toContain("generate_story_ideas");
    expect(names).toContain("suggest_character_backstory");
    expect(names).toContain("suggest_scene_description");
    expect(names).toContain("check_story_consistency");
  });

  it("48. 所有工具 domain 为 story", () => {
    for (const tool of storyTools) {
      expect(tool.domain).toBe("story");
    }
  });
});
