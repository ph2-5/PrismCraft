/**
 * suggest_next_action 工具实现
 *
 * 建议下一步操作。基于当前项目状态（角色数、场景数、故事数、视频任务状态）和用户上下文，
 * 使用 AI 推理生成个性化建议。返回建议列表，每条包含操作、原因、优先级和相关工具名。
 *
 * 设计要点：
 * - 查询项目状态（角色/场景/故事/视频任务）后用 textProvider 推理
 * - LLM 不可用或返回无效结果时，按状态维度生成 fallback 建议
 * - 所有状态查询 try/catch，失败时视为 0
 *
 * 重构说明：
 * 原始 execute（~150 行，圈复杂度 >20）已按状态维度拆分为独立函数：
 * - 4 个项目状态查询函数（queryCharacterCount / querySceneCount / queryStoryCount / queryVideoTaskStatus）
 * - 用户上下文解析（parseUserContext）
 * - LLM 提示词构建（buildSuggestionPrompt）
 * - LLM 建议生成与解析（generateLlmSuggestions）
 * - 5 个按状态维度的 fallback 建议构建器
 * - fallback 建议聚合（buildFallbackSuggestions）
 *
 * 特权访问声明：通过 DI container 直接访问 textProvider 和 videoTaskStorage。
 * 详见 MODULE.md "Agent 特权访问声明" 章节。
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import { container } from "@/infrastructure/di";
import { safeParseJson } from "./help-tools-shared";

// ============= 类型定义 =============

/** 项目状态汇总 */
interface ProjectState {
  characterCount: number;
  sceneCount: number;
  storyCount: number;
  videoTaskSummary: string;
  failedTaskCount: number;
}

/** 用户上下文 */
interface UserContext {
  currentPage: string;
  lastAction: string;
  userGoal: string;
}

/** 操作建议 */
interface Suggestion {
  action: string;
  reason: string;
  priority: "high" | "medium" | "low";
  toolName?: string;
}

// ============= 项目状态查询（按状态维度拆分） =============

/** 查询角色数量 */
async function queryCharacterCount(): Promise<number> {
  try {
    const { characterService } = await import("@/modules/character");
    const r = await characterService.getAll();
    return r.ok ? r.value.length : 0;
  } catch {
    return 0;
  }
}

/** 查询场景数量 */
async function querySceneCount(): Promise<number> {
  try {
    const { sceneService } = await import("@/modules/scene");
    const r = await sceneService.getAll();
    return r.ok ? r.value.length : 0;
  } catch {
    return 0;
  }
}

/** 查询故事数量 */
async function queryStoryCount(): Promise<number> {
  try {
    const { storyService } = await import("@/modules/storyboard");
    const r = await storyService.getAll();
    return r.ok ? r.value.length : 0;
  } catch {
    return 0;
  }
}

/** 查询视频任务状态汇总 */
async function queryVideoTaskStatus(): Promise<{ summary: string; failedCount: number }> {
  const empty = { summary: "无视频任务", failedCount: 0 };
  try {
    const tasks = await container.videoTaskStorage.getVideoTasks();
    const pending = tasks.filter(
      (t) => t.status === "pending" || t.status === "generating",
    ).length;
    const completed = tasks.filter((t) => t.status === "completed").length;
    const failedCount = tasks.filter((t) => t.status === "failed").length;
    return {
      summary: `共 ${tasks.length} 个任务（进行中 ${pending}，已完成 ${completed}，失败 ${failedCount}）`,
      failedCount,
    };
  } catch {
    return empty;
  }
}

/** 查询项目状态（聚合 4 个状态维度） */
async function queryProjectState(): Promise<ProjectState> {
  const [characterCount, sceneCount, storyCount, videoTaskStatus] = await Promise.all([
    queryCharacterCount(),
    querySceneCount(),
    queryStoryCount(),
    queryVideoTaskStatus(),
  ]);
  return {
    characterCount,
    sceneCount,
    storyCount,
    videoTaskSummary: videoTaskStatus.summary,
    failedTaskCount: videoTaskStatus.failedCount,
  };
}

// ============= 用户上下文解析 =============

/** 解析用户上下文参数 */
function parseUserContext(args: {
  context?:
    | { current_page?: string; last_action?: string; user_goal?: string }
    | undefined;
}): UserContext {
  const ctx = args.context ?? {};
  return {
    currentPage: ctx.current_page || "未知",
    lastAction: ctx.last_action || "未知",
    userGoal: ctx.user_goal || "未指定",
  };
}

// ============= LLM 推理 =============

/** 构建建议生成的提示词 */
function buildSuggestionPrompt(state: ProjectState, ctx: UserContext): string {
  return (
    `你是 AI 动画工作室的助手。根据当前项目状态，建议用户下一步操作。\n\n` +
    `当前项目状态：\n` +
    `- 角色数量：${state.characterCount}\n` +
    `- 场景数量：${state.sceneCount}\n` +
    `- 故事数量：${state.storyCount}\n` +
    `- 视频任务：${state.videoTaskSummary}\n\n` +
    `用户上下文：\n` +
    `- 当前页面：${ctx.currentPage}\n` +
    `- 上一步操作：${ctx.lastAction}\n` +
    `- 用户目标：${ctx.userGoal}\n\n` +
    `请返回 JSON 数组，每个元素包含：\n` +
    `- action: 建议的操作（中文，简短）\n` +
    `- reason: 建议原因（中文，1句话）\n` +
    `- priority: 优先级（"high" 或 "medium" 或 "low"）\n` +
    `- toolName: 相关工具名（可选，如 create_character、generate_video 等）\n\n` +
    `返回 2-4 条建议，按优先级从高到低排列。只返回 JSON 数组，不要其他内容。`
  );
}

/** 解析 LLM 返回的建议数组 */
function parseLlmSuggestions(
  parsed: unknown,
): Suggestion[] | null {
  if (!Array.isArray(parsed)) {
    return null;
  }
  const validPriorities = new Set(["high", "medium", "low"]);
  const suggestions = parsed
    .filter(
      (s): s is Record<string, unknown> =>
        s !== null &&
        typeof s === "object" &&
        typeof (s as { action?: unknown }).action === "string",
    )
    .map((s) => {
      const suggestion: Suggestion = {
        action: String(s.action),
        reason: String(s.reason || ""),
        priority: validPriorities.has(String(s.priority))
          ? (String(s.priority) as "high" | "medium" | "low")
          : "medium",
      };
      if (s.toolName) {
        suggestion.toolName = String(s.toolName);
      }
      return suggestion;
    });
  return suggestions.length > 0 ? suggestions : null;
}

/** 调用 textProvider 生成建议，返回解析后的建议数组（失败返回 null） */
async function generateLlmSuggestions(prompt: string): Promise<Suggestion[] | null> {
  try {
    const result = await container.textProvider.generateText(prompt, {
      maxTokens: 800,
      temperature: 0.5,
    });

    if (!result.success || !result.data?.text) {
      return null;
    }

    const parsed = safeParseJson<
      Array<{ action?: string; reason?: string; priority?: string; toolName?: string }>
    >(result.data.text);
    return parseLlmSuggestions(parsed);
  } catch {
    return null;
  }
}

// ============= Fallback 建议构建（按状态维度拆分） =============

/** 状态：无角色 → 建议创建第一个角色 */
function suggestIfNoCharacters(state: ProjectState): Suggestion | null {
  if (state.characterCount === 0) {
    return {
      action: "创建第一个角色",
      reason: "项目中还没有角色，创建角色是开始创作的基础",
      priority: "high",
      toolName: "create_character",
    };
  }
  return null;
}

/** 状态：无场景 → 建议创建第一个场景 */
function suggestIfNoScenes(state: ProjectState): Suggestion | null {
  if (state.sceneCount === 0) {
    return {
      action: "创建第一个场景",
      reason: "项目中还没有场景，创建场景为画面提供环境",
      priority: "high",
      toolName: "create_scene",
    };
  }
  return null;
}

/** 状态：无故事但已有角色 → 建议创建故事 */
function suggestIfNoStoryButHasCharacters(state: ProjectState): Suggestion | null {
  if (state.storyCount === 0 && state.characterCount > 0) {
    return {
      action: "创建故事",
      reason: "已有角色，可以开始创作故事并拆分分镜",
      priority: "medium",
      toolName: "create_story",
    };
  }
  return null;
}

/** 状态：已有故事 → 建议生成分镜画面 */
function suggestIfHasStory(state: ProjectState): Suggestion | null {
  if (state.storyCount > 0) {
    return {
      action: "生成分镜画面",
      reason: "已有故事，可以为分镜生成关键帧或视频",
      priority: "medium",
      toolName: "generate_video",
    };
  }
  return null;
}

/** 状态：有失败的视频任务 → 建议恢复 */
function suggestIfHasFailedTasks(state: ProjectState): Suggestion | null {
  if (state.failedTaskCount > 0) {
    return {
      action: "恢复失败的视频任务",
      reason: `有 ${state.failedTaskCount} 个失败的视频任务，可以尝试恢复或重试`,
      priority: "high",
      toolName: "recover_video_task",
    };
  }
  return null;
}

/** 通用建议（无特定状态匹配时） */
function suggestDefaultAction(): Suggestion {
  return {
    action: "浏览分镜页面",
    reason: "项目已有基础资产，可以在分镜页面开始创作",
    priority: "medium",
  };
}

/** 基于项目状态构建 fallback 建议 */
function buildFallbackSuggestions(state: ProjectState): Suggestion[] {
  const builders: Array<(state: ProjectState) => Suggestion | null> = [
    suggestIfNoCharacters,
    suggestIfNoScenes,
    suggestIfNoStoryButHasCharacters,
    suggestIfHasStory,
    suggestIfHasFailedTasks,
  ];

  const suggestions = builders
    .map((build) => build(state))
    .filter((s): s is Suggestion => s !== null);

  // 如果没有特定建议，给出通用建议
  if (suggestions.length === 0) {
    suggestions.push(suggestDefaultAction());
  }

  return suggestions;
}

// ============= 工具实现 =============

/** 建议下一步操作（基于当前项目状态） */
export const suggestNextActionTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "suggest_next_action",
      description:
        "建议下一步操作。基于当前项目状态（角色数、场景数、故事数、视频任务状态）和用户上下文，" +
        "使用 AI 推理生成个性化建议。返回建议列表，每条包含操作、原因、优先级和相关工具名。",
      parameters: {
        type: "object",
        properties: {
          context: {
            type: "object",
            description: "用户上下文（可选）",
            properties: {
              current_page: { type: "string", description: "当前所在页面", maxLength: 200 },
              last_action: { type: "string", description: "上一步操作", maxLength: 500 },
              user_goal: { type: "string", description: "用户目标", maxLength: 1000 },
            },
          },
        },
      },
    },
  },
  domain: "help",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args) {
    // 1. 查询当前项目状态（4 个状态维度并行查询）
    const state = await queryProjectState();

    // 2. 解析用户上下文
    const ctx = parseUserContext(args);

    // 3. 用 textProvider 生成建议
    const prompt = buildSuggestionPrompt(state, ctx);
    const llmSuggestions = await generateLlmSuggestions(prompt);
    if (llmSuggestions && llmSuggestions.length > 0) {
      return { success: true, data: { suggestions: llmSuggestions } };
    }

    // 4. fallback - 基于项目状态生成简单建议
    const suggestions = buildFallbackSuggestions(state);
    return { success: true, data: { suggestions } };
  },
};
