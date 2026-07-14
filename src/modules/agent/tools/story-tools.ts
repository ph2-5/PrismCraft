/**
 * 故事创作工具（Story Tools）— 主入口（barrel）
 *
 * 本文件包含基础 CRUD 工具（list/get/create/update/delete），
 * 其他工具按功能拆分到子文件：
 * - story-tools-planning.ts：plan_story / validate_story_plan
 * - story-tools-generation.ts：generate_style_guide / generate_frame_prompts / generate_story_ideas
 * - story-tools-suggestions.ts：suggest_character_backstory / suggest_scene_description / check_story_consistency
 *
 * 工具列表：
 * - list_stories：列出所有故事（支持过滤/分页）
 * - get_story：获取故事详情（含所有分镜）
 * - create_story：创建故事
 * - update_story：更新故事
 * - delete_story：删除故事（需确认）
 * - plan_story：AI 规划故事分镜（来自 story-tools-planning）
 * - validate_story_plan：校验分镜计划（来自 story-tools-planning）
 * - generate_style_guide：生成风格指南（来自 story-tools-generation）
 * - generate_frame_prompts：生成分镜首尾帧提示词（来自 story-tools-generation）
 * - generate_story_ideas：生成故事创意（来自 story-tools-generation）
 * - suggest_character_backstory：建议角色背景故事（来自 story-tools-suggestions）
 * - suggest_scene_description：建议场景描述（来自 story-tools-suggestions）
 * - check_story_consistency：故事逻辑一致性检查（来自 story-tools-suggestions）
 *
 * 设计要点：
 * - 调用 storyService 的 public API（Result<T> 模式）
 * - Result 模式：{ ok: true, value } | { ok: false, error: Error }
 * - ApiResponse 模式：{ success: true, data } | { success: false, error: string }
 * - 错误处理完善，service 失败时返回友好错误信息
 */

import type { ToolImpl } from "../domain/types";
import { TOOL_TIMEOUTS } from "../domain/constants";
import { planStoryTool, validateStoryPlanTool } from "./story-tools-planning";
import {
  generateStyleGuideTool,
  generateFramePromptsTool,
  generateStoryIdeasTool,
} from "./story-tools-generation";
import {
  suggestCharacterBackstoryTool,
  suggestSceneDescriptionTool,
  checkStoryConsistencyTool,
} from "./story-tools-suggestions";

// ============= CRUD 工具实现 =============

/** 列出所有故事（支持过滤/分页） */
export const listStoriesTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "list_stories",
      description:
        "列出所有故事。支持按标题模糊匹配，可限制返回数量和分页。返回精简字段（id/title/beatCount/createdAt/updatedAt），" +
        "适用于：用户要求「列出故事」、「查看所有故事」、「我有几个故事」等场景。",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", minimum: 1, maximum: 100, description: "返回数量上限，默认 20，最大 100", default: 20 },
          offset: { type: "number", minimum: 0, description: "偏移量（分页），默认 0", default: 0 },
          title: { type: "string", maxLength: 500, description: "按标题模糊匹配（包含该字符串）" },
        },
      },
    },
  },
  domain: "story",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const { storyService } = await import("@/modules/storyboard");
    const result = await storyService.getAll();
    if (!result.ok) {
      return { success: false, error: `获取故事列表失败：${result.error.message}` };
    }

    let filtered = result.value;
    if (args.title) {
      const kw = String(args.title).toLowerCase();
      filtered = filtered.filter((s) => s.title.toLowerCase().includes(kw));
    }

    const offset = Number(args.offset) || 0;
    const limit = Math.min(Number(args.limit) || 20, 100);
    const paged = filtered.slice(offset, offset + limit);

    return {
      success: true,
      data: {
        total: filtered.length,
        offset,
        limit,
        items: paged.map((s) => ({
          id: s.id,
          title: s.title,
          beatCount: s.beats?.length ?? 0,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        })),
      },
    };
  },
};

/** 获取故事详情（含所有分镜） */
export const getStoryTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "get_story",
      description:
        "获取故事完整详情（含所有分镜 beats 数组、风格指南 styleGuide、角色/场景引用等所有字段）。" +
        "适用于：用户要求「查看故事详情」、「打开故事」、「故事分镜有哪些」等场景。",
      parameters: {
        type: "object",
        properties: {
          storyId: { type: "string", maxLength: 100, description: "故事 ID（必填）" },
        },
        required: ["storyId"],
      },
    },
  },
  domain: "story",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const { storyService } = await import("@/modules/storyboard");
    const id = String(args.storyId);
    const result = await storyService.getById(id);
    if (!result.ok) {
      return { success: false, error: `获取故事失败：${result.error.message}` };
    }
    return { success: true, data: result.value };
  },
};

/** 创建故事 */
export const createStoryTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "create_story",
      description:
        "创建一个新故事。需要提供标题和描述，可指定目标时长、风格主题、角色 ID 数组和场景 ID 数组。" +
        "创建后故事为空（无分镜），可后续调用 plan_story 生成分镜。" +
        "适用于：用户要求「创建一个故事」、「新建故事」、「开始一个新动画项目」等场景。",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", maxLength: 200, description: "故事标题（必填，不能为空）" },
          description: { type: "string", maxLength: 2000, description: "故事描述/简介（必填）" },
          targetDuration: {
            type: "number",
            minimum: 1,
            maximum: 300,
            description: "目标时长（秒），默认 60",
            default: 60,
          },
          style: {
            type: "string",
            maxLength: 200,
            description: "风格主题（如：剧情、喜剧、悬疑、奇幻），映射到故事的 genre 字段",
          },
          characters: {
            type: "array",
            items: { type: "string" },
            description: "角色 ID 数组（关联已有角色）",
          },
          scenes: {
            type: "array",
            items: { type: "string" },
            description: "场景 ID 数组（关联已有场景）",
          },
        },
        required: ["title", "description"],
      },
    },
  },
  domain: "story",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const { storyService } = await import("@/modules/storyboard");
    const title = String(args.title);
    const description = String(args.description);
    const targetDuration = args.targetDuration != null ? Number(args.targetDuration) : 60;
    const style = args.style ? String(args.style) : undefined;
    const characters = Array.isArray(args.characters) ? args.characters.map(String) : [];
    const scenes = Array.isArray(args.scenes) ? args.scenes.map(String) : [];

    const result = await storyService.create({
      title,
      description,
      genre: style,
      targetDuration,
      characters,
      scenes,
      beats: [],
      elementIds: [],
    });
    if (!result.ok) {
      return { success: false, error: `创建故事失败：${result.error.message}` };
    }

    return {
      success: true,
      data: {
        id: result.value.id,
        title: result.value.title,
        description: result.value.description,
        genre: result.value.genre,
        targetDuration: result.value.targetDuration,
        characters: result.value.characters,
        scenes: result.value.scenes,
        createdAt: result.value.createdAt,
      },
    };
  },
};

/** 更新故事 */
export const updateStoryTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "update_story",
      description:
        "更新故事信息（标题、描述、目标时长、风格主题）。仅更新提供的字段，未提供的字段保持不变。" +
        "适用于：用户要求「修改故事标题」、「更新故事描述」、「改一下故事风格」等场景。",
      parameters: {
        type: "object",
        properties: {
          storyId: { type: "string", maxLength: 100, description: "故事 ID（必填）" },
          title: { type: "string", maxLength: 200, description: "新标题" },
          description: { type: "string", maxLength: 2000, description: "新描述" },
          targetDuration: { type: "number", minimum: 1, maximum: 300, description: "新目标时长（秒）" },
          style: {
            type: "string",
            maxLength: 200,
            description: "新风格主题（映射到 genre 字段）",
          },
        },
        required: ["storyId"],
      },
    },
  },
  domain: "story",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  async execute(args) {
    const { storyService } = await import("@/modules/storyboard");
    const storyId = String(args.storyId);

    const result = await storyService.update(storyId, {
      id: storyId,
      ...(args.title != null ? { title: String(args.title) } : {}),
      ...(args.description != null ? { description: String(args.description) } : {}),
      ...(args.targetDuration != null ? { targetDuration: Number(args.targetDuration) } : {}),
      ...(args.style != null ? { genre: String(args.style) } : {}),
    });
    if (!result.ok) {
      return { success: false, error: `更新故事失败：${result.error.message}` };
    }
    return { success: true, data: { updated: true, storyId } };
  },
};

/** 删除故事（需确认） */
export const deleteStoryTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "delete_story",
      description:
        "删除故事及其所有分镜。删除前会自动保存一份版本备份。此操作不可逆，需要用户确认。" +
        "适用于：用户要求「删除故事」、「移除这个动画项目」等场景。",
      parameters: {
        type: "object",
        properties: {
          storyId: { type: "string", maxLength: 100, description: "故事 ID（必填）" },
        },
        required: ["storyId"],
      },
    },
  },
  domain: "story",
  timeoutMs: TOOL_TIMEOUTS.mutation,
  requiresConfirmation: true,
  dangerLevel: "destructive",
  async execute(args) {
    const { storyService } = await import("@/modules/storyboard");
    const id = String(args.storyId);
    const result = await storyService.delete(id);
    if (!result.ok) {
      return { success: false, error: `删除故事失败：${result.error.message}` };
    }
    return { success: true, data: { deleted: true, storyId: id } };
  },
};

// ============= Re-export 拆分工具（保持向后兼容） =============
// 注意：上方已 import 这些符号用于构建 storyTools 数组，这里通过本地绑定重新导出

export {
  planStoryTool,
  validateStoryPlanTool,
  generateStyleGuideTool,
  generateFramePromptsTool,
  generateStoryIdeasTool,
  suggestCharacterBackstoryTool,
  suggestSceneDescriptionTool,
  checkStoryConsistencyTool,
};

// ============= 导出所有故事工具 =============

export const storyTools: ToolImpl[] = [
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
];
