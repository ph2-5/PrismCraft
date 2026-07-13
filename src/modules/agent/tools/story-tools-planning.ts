/**
 * 故事规划工具（Story Planning Tools）
 *
 * 从 story-tools.ts 拆分而来，包含分镜规划与校验工具：
 * - plan_story：AI 规划故事分镜
 * - validate_story_plan：校验分镜计划
 *
 * 设计要点：
 * - 调用 storyService 的 public API（Result<T> 模式）
 * - 调用 planStory（story 模块的规划函数）
 * - 错误处理完善，service 失败时返回友好错误信息
 */

import type { ToolImpl } from "../domain/types";
import { TOOL_TIMEOUTS } from "../services/tool-executor";

// ============= 工具实现 =============

/** AI 规划故事分镜 */
export const planStoryTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "plan_story",
      description:
        "调用 AI 根据故事标题、描述、关联的角色和场景自动规划分镜（story beats）。" +
        "生成后会自动更新故事的 beats 字段。支持增强生成模式和严格模式。" +
        "适用于：用户要求「规划分镜」、「生成故事分镜」、「AI 帮我分镜」等场景。" +
        "注意：此工具会调用 LLM，执行时间较长（通常 30 秒到 2 分钟）。",
      parameters: {
        type: "object",
        properties: {
          storyId: { type: "string", maxLength: 100, description: "故事 ID（必填）" },
          maxBeats: {
            type: "number",
            minimum: 1,
            maximum: 50,
            description: "最大分镜数，默认 6。生成的分镜超过此数量时会被裁剪。",
            default: 6,
          },
          enhancedGeneration: {
            type: "boolean",
            description: "是否启用增强生成模式（更详细的分镜描述），默认 false",
          },
          strictMode: {
            type: "boolean",
            description: "是否启用严格模式（更严格的校验规则），默认 false",
          },
        },
        required: ["storyId"],
      },
    },
  },
  domain: "story",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args) {
    const { storyService } = await import("@/modules/storyboard");
    const { planStory } = await import("@/modules/storyboard");
    const { characterService } = await import("@/modules/character");
    const { sceneService } = await import("@/modules/scene");

    const storyId = String(args.storyId);
    const maxBeats = args.maxBeats != null ? Number(args.maxBeats) : 6;
    const enhancedGeneration = args.enhancedGeneration === true;
    const strictMode = args.strictMode === true;

    // 1. 获取故事
    const storyResult = await storyService.getById(storyId);
    if (!storyResult.ok) {
      return { success: false, error: `获取故事失败：${storyResult.error.message}` };
    }

    // 2. 获取角色和场景
    const [charResult, sceneResult] = await Promise.all([
      characterService.getAll(),
      sceneService.getAll(),
    ]);
    const characters = charResult.ok ? charResult.value : [];
    const scenes = sceneResult.ok ? sceneResult.value : [];

    // 3. 调用 AI 规划分镜
    const planResult = await planStory(storyResult.value, characters, scenes, {
      enhancedGeneration,
      strictMode,
    });
    if (!planResult.ok) {
      return { success: false, error: `规划故事分镜失败：${planResult.error.message}` };
    }

    // 4. 按 maxBeats 裁剪
    const allBeats = planResult.value.beats;
    const beats = allBeats.length > maxBeats ? allBeats.slice(0, maxBeats) : allBeats;

    // 5. 更新故事的 beats
    const updateResult = await storyService.update(storyId, { id: storyId, beats });
    if (!updateResult.ok) {
      return {
        success: true,
        data: {
          beats,
          autoFixedCount: planResult.value.autoFixedCount,
          retryCount: planResult.value.retryCount,
          fixDetails: planResult.value.fixDetails,
          warning: `分镜已生成但保存到故事失败：${updateResult.error.message}`,
        },
      };
    }

    return {
      success: true,
      data: {
        beats,
        autoFixedCount: planResult.value.autoFixedCount,
        retryCount: planResult.value.retryCount,
        fixDetails: planResult.value.fixDetails,
      },
    };
  },
};

/** 校验分镜计划 */
export const validateStoryPlanTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "validate_story_plan",
      description:
        "校验故事分镜计划的完整性。检查每个分镜是否有描述、时长是否有效、角色和场景引用是否存在。" +
        "返回校验结果和问题列表（含严重级别：error/warning）。" +
        "适用于：用户要求「检查分镜」、「校验故事」、「分镜有没有问题」等场景。",
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
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const { storyService } = await import("@/modules/storyboard");
    const { characterService } = await import("@/modules/character");
    const { sceneService } = await import("@/modules/scene");

    const storyId = String(args.storyId);
    const storyResult = await storyService.getById(storyId);
    if (!storyResult.ok) {
      return { success: false, error: `获取故事失败：${storyResult.error.message}` };
    }

    const story = storyResult.value;
    const beats = story.beats || [];

    if (beats.length === 0) {
      return {
        success: true,
        data: {
          valid: false,
          issues: [{ beatId: "", issue: "故事没有任何分镜", severity: "error" }],
        },
      };
    }

    // 获取有效的角色和场景 ID
    const [charResult, sceneResult] = await Promise.all([
      characterService.getAll(),
      sceneService.getAll(),
    ]);
    const charIds = new Set(charResult.ok ? charResult.value.map((c) => c.id) : []);
    const sceneIds = new Set(sceneResult.ok ? sceneResult.value.map((s) => s.id) : []);

    const issues: Array<{ beatId: string; issue: string; severity: string }> = [];

    for (const beat of beats) {
      const desc = beat.content || beat.description;
      if (!desc || !desc.trim()) {
        issues.push({ beatId: beat.id, issue: "分镜缺少描述（content/description 均为空）", severity: "error" });
      }
      if (beat.duration == null || beat.duration <= 0) {
        issues.push({ beatId: beat.id, issue: "分镜时长无效（未设置或小于等于 0）", severity: "warning" });
      }
      for (const charId of beat.characterIds || []) {
        if (!charIds.has(charId)) {
          issues.push({ beatId: beat.id, issue: `角色引用无效：${charId}`, severity: "warning" });
        }
      }
      if (beat.sceneId && !sceneIds.has(beat.sceneId)) {
        issues.push({ beatId: beat.id, issue: `场景引用无效：${beat.sceneId}`, severity: "warning" });
      }
    }

    return {
      success: true,
      data: {
        valid: issues.filter((i) => i.severity === "error").length === 0,
        issues,
      },
    };
  },
};
