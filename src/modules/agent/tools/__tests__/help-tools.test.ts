/**
 * Help Tools 单元测试
 *
 * 测试 6 个教学帮助工具：
 * - explain_feature：解释项目功能（字典命中 / textProvider 生成 / fallback）
 * - show_tutorial：显示教程（按主题/级别）
 * - get_help：获取帮助文档（搜索/分类）
 * - list_available_commands：列出可用工具（从 toolRegistry 动态获取）
 * - suggest_next_action：建议下一步操作（基于项目状态 + LLM）
 * - get_keyboard_shortcuts：获取快捷键列表
 *
 * Mock 策略：
 * - container.textProvider / container.videoTaskStorage
 * - toolRegistry（动态导入）
 * - characterService / sceneService / storyService（动态导入）
 * - TOOL_TIMEOUTS 常量
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  textProvider: { generateText: vi.fn() },
  videoTaskStorage: { getVideoTasks: vi.fn() },
  toolRegistry: { getToolDescriptions: vi.fn() },
  characterService: { getAll: vi.fn() },
  sceneService: { getAll: vi.fn() },
  storyService: { getAll: vi.fn() },
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    textProvider: mocks.textProvider,
    videoTaskStorage: mocks.videoTaskStorage,
  },
}));

vi.mock("../../services/tool-executor", () => ({
  TOOL_TIMEOUTS: {
    query: 30_000,
    mutation: 60_000,
    generation: 300_000,
    videoTask: 1_800_000,
    download: 600_000,
  },
}));

vi.mock("../../services/tool-registry", () => ({
  toolRegistry: mocks.toolRegistry,
}));

// 动态 import("@/modules/character") 等也可以被 vi.mock 拦截
vi.mock("@/modules/character", () => ({
  characterService: mocks.characterService,
}));

vi.mock("@/modules/scene", () => ({
  sceneService: mocks.sceneService,
}));

vi.mock("@/modules/story", () => ({
  storyService: mocks.storyService,
}));

import {
  explainFeatureTool,
  showTutorialTool,
  getHelpTool,
  listAvailableCommandsTool,
  suggestNextActionTool,
  getKeyboardShortcutsTool,
  helpTools,
} from "../help-tools";
import type { ToolContext } from "../../domain/types";

function makeCtx(): ToolContext {
  return {
    sessionId: "test-session",
    onProgress: vi.fn(),
  };
}

/** 构造成功的 Result<T> */
function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

/** 构造 VideoTask mock 对象（用于 suggest_next_action 测试） */
function makeTask(overrides?: Record<string, unknown>) {
  return {
    taskId: "task_1",
    status: "pending",
    progress: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    prompt: "测试",
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ============================================================
// 1. explain_feature
// ============================================================
describe("explain_feature", () => {
  it("1. featureName 为空时返回失败", async () => {
    const result = await explainFeatureTool.execute({ featureName: "" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("featureName 不能为空");
    expect(mocks.textProvider.generateText).not.toHaveBeenCalled();
  });

  it("2. 字典命中 shot-page 返回静态文档", async () => {
    const result = await explainFeatureTool.execute(
      { featureName: "shot-page" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      feature: string;
      description: string;
      usageTips: string[];
      relatedFeatures: string[];
    };
    expect(data.feature).toBe("shot-page");
    expect(data.description).toContain("分镜页面");
    expect(Array.isArray(data.usageTips)).toBe(true);
    expect(data.usageTips.length).toBeGreaterThan(0);
    expect(data.relatedFeatures).toContain("story-page");
    // 不应调用 LLM
    expect(mocks.textProvider.generateText).not.toHaveBeenCalled();
  });

  it("3. 字典未命中时调用 textProvider 生成并解析 JSON", async () => {
    mocks.textProvider.generateText.mockResolvedValue({
      success: true,
      data: {
        text: JSON.stringify({
          description: "自定义功能描述",
          usageTips: ["提示1", "提示2"],
          relatedFeatures: ["feature_a"],
        }),
      },
    });

    const result = await explainFeatureTool.execute(
      { featureName: "custom-feature" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      feature: string;
      description: string;
      usageTips: string[];
      relatedFeatures: string[];
    };
    expect(data.feature).toBe("custom-feature");
    expect(data.description).toBe("自定义功能描述");
    expect(data.usageTips).toEqual(["提示1", "提示2"]);
    expect(data.relatedFeatures).toEqual(["feature_a"]);
    expect(mocks.textProvider.generateText).toHaveBeenCalledTimes(1);
  });

  it("4. textProvider 返回非 JSON 时使用 fallback", async () => {
    mocks.textProvider.generateText.mockResolvedValue({
      success: true,
      data: { text: "无法解析的内容" },
    });

    const result = await explainFeatureTool.execute(
      { featureName: "unknown-feature" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      feature: string;
      description: string;
      usageTips: string[];
      relatedFeatures: string[];
    };
    expect(data.feature).toBe("unknown-feature");
    expect(data.description).toContain("未能找到");
    expect(data.usageTips).toEqual([]);
    expect(data.relatedFeatures).toEqual([]);
  });

  it("5. textProvider 抛异常时使用 fallback", async () => {
    mocks.textProvider.generateText.mockRejectedValue(new Error("LLM down"));

    const result = await explainFeatureTool.execute(
      { featureName: "missing-feature" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { description: string };
    expect(data.description).toContain("未能找到");
  });
});

// ============================================================
// 2. show_tutorial
// ============================================================
describe("show_tutorial", () => {
  it("6. topic 为空时返回失败", async () => {
    const result = await showTutorialTool.execute({ topic: "" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("topic 不能为空");
  });

  it("7. 字典命中 getting_started/beginner 返回分步教程", async () => {
    const result = await showTutorialTool.execute(
      { topic: "getting_started", level: "beginner" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      topic: string;
      level: string;
      steps: Array<{ step: number; title: string; description: string; tips?: string[] }>;
      duration: string;
    };
    expect(data.topic).toBe("getting_started");
    expect(data.level).toBe("beginner");
    expect(data.steps.length).toBeGreaterThan(0);
    expect(data.steps[0].step).toBe(1);
    expect(data.steps[0].title).toBeDefined();
    expect(data.duration).toBe("5 分钟");
    // 不应调用 LLM
    expect(mocks.textProvider.generateText).not.toHaveBeenCalled();
  });

  it("8. 指定 level 不存在时回退到 beginner", async () => {
    const result = await showTutorialTool.execute(
      { topic: "getting_started", level: "nonexistent" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      level: string;
      steps: Array<{ title: string }>;
    };
    // 仍然返回 beginner 的步骤
    expect(data.steps.length).toBeGreaterThan(0);
  });

  it("9. 字典未命中时用 textProvider 生成教程", async () => {
    mocks.textProvider.generateText.mockResolvedValue({
      success: true,
      data: {
        text: JSON.stringify({
          steps: [
            { title: "步骤1", description: "描述1", tips: ["提示1"] },
            { title: "步骤2", description: "描述2" },
          ],
          duration: "约 10 分钟",
        }),
      },
    });

    const result = await showTutorialTool.execute(
      { topic: "custom_topic", level: "advanced" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      topic: string;
      level: string;
      steps: Array<{ step: number; title: string; tips?: string[] }>;
      duration: string;
    };
    expect(data.topic).toBe("custom_topic");
    expect(data.level).toBe("advanced");
    expect(data.steps).toHaveLength(2);
    expect(data.steps[0].step).toBe(1);
    expect(data.steps[0].tips).toEqual(["提示1"]);
    expect(data.duration).toBe("约 10 分钟");
  });

  it("10. textProvider 失败时使用 fallback（暂无教程）", async () => {
    mocks.textProvider.generateText.mockResolvedValue({
      success: false,
      error: "LLM 不可用",
    });

    const result = await showTutorialTool.execute(
      { topic: "unknown_topic" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      steps: Array<{ title: string; description: string }>;
      duration: string;
    };
    expect(data.steps).toHaveLength(1);
    expect(data.steps[0].title).toBe("暂无教程");
    expect(data.duration).toBe("—");
  });
});

// ============================================================
// 3. get_help
// ============================================================
describe("get_help", () => {
  it("11. 无 query 和 category 时返回目录（不含完整 content）", async () => {
    const result = await getHelpTool.execute({}, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as {
      articles: Array<{ title: string; category: string; summary: string; content: string }>;
      total: number;
    };
    expect(data.total).toBeGreaterThan(0);
    expect(data.articles.length).toBe(data.total);
    // 目录模式 content 应为空字符串
    expect(data.articles[0].content).toBe("");
  });

  it("12. 按 category=faq 过滤返回完整内容", async () => {
    const result = await getHelpTool.execute({ category: "faq" }, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as {
      articles: Array<{ title: string; category: string; content: string }>;
      total: number;
    };
    expect(data.total).toBeGreaterThan(0);
    for (const a of data.articles) {
      expect(a.category).toBe("faq");
      // 有筛选条件时返回完整内容
      expect(a.content.length).toBeGreaterThan(0);
    }
  });

  it("13. 按 query 关键词搜索", async () => {
    const result = await getHelpTool.execute({ query: "API" }, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as {
      articles: Array<{ title: string }>;
      total: number;
    };
    expect(data.total).toBeGreaterThan(0);
    // 至少有一个标题或内容包含 "API"（不区分大小写）
    const hasMatch = data.articles.some((a) => a.title.toLowerCase().includes("api"));
    expect(hasMatch).toBe(true);
  });

  it("14. query 无匹配结果时返回空数组", async () => {
    const result = await getHelpTool.execute({ query: "zzz_nonexistent_zzz" }, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as { articles: unknown[]; total: number };
    expect(data.total).toBe(0);
    expect(data.articles).toEqual([]);
  });

  it("15. 同时指定 query 和 category 时双重过滤", async () => {
    const result = await getHelpTool.execute(
      { category: "features", query: "角色" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      articles: Array<{ title: string; category: string }>;
    };
    for (const a of data.articles) {
      expect(a.category).toBe("features");
    }
    expect(data.articles.length).toBeGreaterThan(0);
  });
});

// ============================================================
// 4. list_available_commands
// ============================================================
describe("list_available_commands", () => {
  it("16. 无 domain 过滤返回所有工具", async () => {
    mocks.toolRegistry.getToolDescriptions.mockReturnValue([
      { name: "create_character", domain: "asset", description: "创建角色" },
      { name: "generate_video", domain: "video", description: "生成视频" },
      { name: "explain_feature", domain: "help", description: "解释功能" },
    ]);

    const result = await listAvailableCommandsTool.execute({}, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as {
      total: number;
      commands: Array<{ name: string; domain: string; description: string }>;
    };
    expect(data.total).toBe(3);
    expect(data.commands[0].name).toBe("create_character");
    expect(data.commands[0].description).toBe("创建角色");
    expect(mocks.toolRegistry.getToolDescriptions).toHaveBeenCalledWith();
  });

  it("17. 按 domain 过滤", async () => {
    mocks.toolRegistry.getToolDescriptions.mockReturnValue([
      { name: "create_character", domain: "asset", description: "创建角色" },
      { name: "generate_video", domain: "video", description: "生成视频" },
    ]);

    const result = await listAvailableCommandsTool.execute(
      { domain: "video" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      total: number;
      commands: Array<{ name: string; domain: string }>;
    };
    expect(data.total).toBe(1);
    expect(data.commands[0].domain).toBe("video");
  });

  it("18. includeDescriptions=false 时不返回 description", async () => {
    mocks.toolRegistry.getToolDescriptions.mockReturnValue([
      { name: "tool1", domain: "asset", description: "工具描述" },
    ]);

    const result = await listAvailableCommandsTool.execute(
      { includeDescriptions: false },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      commands: Array<{ name: string; domain: string; description?: string }>;
    };
    expect(data.commands[0].name).toBe("tool1");
    expect(data.commands[0].description).toBeUndefined();
  });

  it("19. toolRegistry 抛异常时返回失败", async () => {
    mocks.toolRegistry.getToolDescriptions.mockImplementation(() => {
      throw new Error("registry error");
    });

    const result = await listAvailableCommandsTool.execute({}, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("获取工具列表失败");
    expect(result.error).toContain("registry error");
  });
});

// ============================================================
// 5. suggest_next_action
// ============================================================
describe("suggest_next_action", () => {
  it("20. 项目空时返回 fallback 高优先级建议（创建角色/场景）", async () => {
    // 所有 service 查询失败（fallback 到 0）
    mocks.characterService.getAll.mockResolvedValue(ok([]));
    mocks.sceneService.getAll.mockResolvedValue(ok([]));
    mocks.storyService.getAll.mockResolvedValue(ok([]));
    mocks.videoTaskStorage.getVideoTasks.mockResolvedValue([]);
    // textProvider 返回失败 → 走 fallback
    mocks.textProvider.generateText.mockResolvedValue({
      success: false,
      error: "LLM 不可用",
    });

    const result = await suggestNextActionTool.execute({}, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as {
      suggestions: Array<{ action: string; priority: string; toolName?: string }>;
    };
    expect(data.suggestions.length).toBeGreaterThan(0);
    // 应该有高优先级的"创建角色"建议
    const highPriority = data.suggestions.filter((s) => s.priority === "high");
    expect(highPriority.length).toBeGreaterThan(0);
    const actions = data.suggestions.map((s) => s.action);
    expect(actions.some((a) => a.includes("角色"))).toBe(true);
  });

  it("21. 有失败的视频任务时返回恢复建议", async () => {
    mocks.characterService.getAll.mockResolvedValue(ok([{ id: "c1" }]));
    mocks.sceneService.getAll.mockResolvedValue(ok([{ id: "s1" }]));
    mocks.storyService.getAll.mockResolvedValue(ok([{ id: "story1" }]));
    mocks.videoTaskStorage.getVideoTasks.mockResolvedValue([
      makeTask({ taskId: "t1", status: "failed" }),
      makeTask({ taskId: "t2", status: "failed" }),
      makeTask({ taskId: "t3", status: "completed" }),
    ]);
    // LLM 失败 → 走 fallback
    mocks.textProvider.generateText.mockResolvedValue({
      success: false,
      error: "down",
    });

    const result = await suggestNextActionTool.execute({}, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as {
      suggestions: Array<{ action: string; reason: string; priority: string; toolName?: string }>;
    };
    const recoverSuggestion = data.suggestions.find((s) => s.toolName === "recover_video_task");
    expect(recoverSuggestion).toBeDefined();
    expect(recoverSuggestion?.priority).toBe("high");
    expect(recoverSuggestion?.reason).toContain("2");
  });

  it("22. textProvider 返回有效 JSON 建议时直接使用", async () => {
    mocks.characterService.getAll.mockResolvedValue(ok([]));
    mocks.sceneService.getAll.mockResolvedValue(ok([]));
    mocks.storyService.getAll.mockResolvedValue(ok([]));
    mocks.videoTaskStorage.getVideoTasks.mockResolvedValue([]);
    mocks.textProvider.generateText.mockResolvedValue({
      success: true,
      data: {
        text: JSON.stringify([
          {
            action: "配置 API 密钥",
            reason: "尚未配置任何 API",
            priority: "high",
            toolName: "configure_api_provider",
          },
          {
            action: "查看教程",
            reason: "新手建议先看教程",
            priority: "low",
          },
        ]),
      },
    });

    const result = await suggestNextActionTool.execute(
      { context: { current_page: "home", user_goal: "开始创作" } },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      suggestions: Array<{ action: string; reason: string; priority: string; toolName?: string }>;
    };
    expect(data.suggestions).toHaveLength(2);
    expect(data.suggestions[0].action).toBe("配置 API 密钥");
    expect(data.suggestions[0].priority).toBe("high");
    expect(data.suggestions[0].toolName).toBe("configure_api_provider");
    expect(data.suggestions[1].toolName).toBeUndefined();
  });

  it("23. textProvider 返回无效 priority 时降级为 medium", async () => {
    mocks.characterService.getAll.mockResolvedValue(ok([]));
    mocks.sceneService.getAll.mockResolvedValue(ok([]));
    mocks.storyService.getAll.mockResolvedValue(ok([]));
    mocks.videoTaskStorage.getVideoTasks.mockResolvedValue([]);
    mocks.textProvider.generateText.mockResolvedValue({
      success: true,
      data: {
        text: JSON.stringify([
          {
            action: "测试操作",
            reason: "原因",
            priority: "invalid_priority",
          },
        ]),
      },
    });

    const result = await suggestNextActionTool.execute({}, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as {
      suggestions: Array<{ priority: string }>;
    };
    expect(data.suggestions[0].priority).toBe("medium");
  });

  it("24. textProvider 返回非数组时走 fallback", async () => {
    mocks.characterService.getAll.mockResolvedValue(ok([]));
    mocks.sceneService.getAll.mockResolvedValue(ok([]));
    mocks.storyService.getAll.mockResolvedValue(ok([]));
    mocks.videoTaskStorage.getVideoTasks.mockResolvedValue([]);
    mocks.textProvider.generateText.mockResolvedValue({
      success: true,
      data: { text: "not a json array" },
    });

    const result = await suggestNextActionTool.execute({}, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as {
      suggestions: Array<{ action: string }>;
    };
    // 走 fallback，至少有一个建议
    expect(data.suggestions.length).toBeGreaterThan(0);
  });

  it("25. 项目已有角色和故事时给出『生成分镜画面』建议", async () => {
    mocks.characterService.getAll.mockResolvedValue(ok([{ id: "c1" }]));
    mocks.sceneService.getAll.mockResolvedValue(ok([{ id: "s1" }]));
    mocks.storyService.getAll.mockResolvedValue(ok([{ id: "story1" }]));
    mocks.videoTaskStorage.getVideoTasks.mockResolvedValue([]);
    mocks.textProvider.generateText.mockResolvedValue({
      success: false,
      error: "LLM 不可用",
    });

    const result = await suggestNextActionTool.execute({}, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as {
      suggestions: Array<{ action: string; toolName?: string }>;
    };
    const generateAction = data.suggestions.find((s) => s.toolName === "generate_video");
    expect(generateAction).toBeDefined();
    expect(generateAction?.action).toContain("分镜");
  });
});

// ============================================================
// 6. get_keyboard_shortcuts
// ============================================================
describe("get_keyboard_shortcuts", () => {
  it("26. 默认返回所有快捷键", async () => {
    const result = await getKeyboardShortcutsTool.execute({}, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as {
      shortcuts: Array<{ key: string; description: string; context: string }>;
    };
    expect(data.shortcuts.length).toBeGreaterThan(0);
    // 包含不同 context
    const contexts = new Set(data.shortcuts.map((s) => s.context));
    expect(contexts.has("global")).toBe(true);
    expect(contexts.has("editor")).toBe(true);
    expect(contexts.has("shot_page")).toBe(true);
  });

  it("27. 按 context=global 过滤", async () => {
    const result = await getKeyboardShortcutsTool.execute(
      { context: "global" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      shortcuts: Array<{ context: string }>;
    };
    expect(data.shortcuts.length).toBeGreaterThan(0);
    for (const s of data.shortcuts) {
      expect(s.context).toBe("global");
    }
  });

  it("28. context=all 等同于不传", async () => {
    const result = await getKeyboardShortcutsTool.execute(
      { context: "all" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      shortcuts: Array<{ context: string }>;
    };
    // 应该包含多种 context
    const contexts = new Set(data.shortcuts.map((s) => s.context));
    expect(contexts.size).toBeGreaterThan(1);
  });

  it("29. 按 context=shot_page 过滤", async () => {
    const result = await getKeyboardShortcutsTool.execute(
      { context: "shot_page" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      shortcuts: Array<{ key: string; context: string }>;
    };
    expect(data.shortcuts.length).toBeGreaterThan(0);
    for (const s of data.shortcuts) {
      expect(s.context).toBe("shot_page");
    }
    // 验证包含 Ctrl+Enter
    const keys = data.shortcuts.map((s) => s.key);
    expect(keys).toContain("Ctrl+Enter");
  });
});

// ============================================================
// 7. helpTools 数组导出
// ============================================================
describe("helpTools 数组", () => {
  it("30. 包含 6 个工具", () => {
    expect(helpTools).toHaveLength(6);
    expect(helpTools).toContain(explainFeatureTool);
    expect(helpTools).toContain(showTutorialTool);
    expect(helpTools).toContain(getHelpTool);
    expect(helpTools).toContain(listAvailableCommandsTool);
    expect(helpTools).toContain(suggestNextActionTool);
    expect(helpTools).toContain(getKeyboardShortcutsTool);
  });

  it("31. 所有工具的 domain 为 help", () => {
    for (const tool of helpTools) {
      expect(tool.domain).toBe("help");
    }
  });
});
