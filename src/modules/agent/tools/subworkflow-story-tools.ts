/**
 * 子流程工具 — 故事相关（Subworkflow Story Tools）
 *
 * 包含工具：
 * - auto_plan_storyboard：一句话生成完整分镜计划（创建故事 → 规划分镜 → 校验）
 */

import type { ToolImpl } from "../domain/types";
import { TOOL_TIMEOUTS } from "../domain/constants";

/** 3. 一句话生成完整分镜计划（创建故事 → 规划分镜 → 校验） */
export const autoPlanStoryboardTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "auto_plan_storyboard",
      description:
        "一站式工具：用一句话生成完整分镜计划。内部流程：1) 创建故事；2) 如 autoPlan=true（默认），获取关联角色/场景并调用 planStory AI 规划分镜；3) 校验分镜计划完整性。" +
        "适用于：用户要求「帮我规划一个故事的分镜」、「一句话生成分镜计划」等场景。" +
        "注意：此工具会调用 LLM，执行时间较长（通常 30 秒到 2 分钟）。",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", maxLength: 200, description: "故事标题（必填）" },
          description: { type: "string", maxLength: 2000, description: "故事描述/简介（必填）" },
          targetDuration: {
            type: "number",
            minimum: 1,
            maximum: 300,
            description: "目标时长（秒），默认 60",
            default: 60,
          },
          characterIds: {
            type: "array",
            items: { type: "string" },
            description: "关联的角色 ID 数组（可选）",
          },
          sceneIds: {
            type: "array",
            items: { type: "string" },
            description: "关联的场景 ID 数组（可选）",
          },
          autoPlan: {
            type: "boolean",
            description: "是否自动调用 AI 规划分镜，默认 true",
            default: true,
          },
        },
        required: ["title", "description"],
      },
    },
  },
  domain: "workflow",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args, ctx) {
    const title = String(args.title);
    const description = String(args.description);
    const targetDuration = args.targetDuration != null ? Number(args.targetDuration) : 60;
    const characterIds = Array.isArray(args.characterIds) ? args.characterIds.map(String) : [];
    const sceneIds = Array.isArray(args.sceneIds) ? args.sceneIds.map(String) : [];
    const autoPlan = args.autoPlan !== false;

    // Step 1: 创建故事
    ctx.onProgress?.("正在创建故事…");
    const { storyService } = await import("@/modules/storyboard");
    const createResult = await storyService.create({
      title,
      description,
      targetDuration,
      characters: characterIds,
      scenes: sceneIds,
      beats: [],
      elementIds: [],
    });
    if (!createResult.ok) {
      return { success: false, error: `创建故事失败：${createResult.error.message}` };
    }
    const story = createResult.value;
    const storyId = story.id;

    // Step 2: 规划分镜
    if (!autoPlan) {
      return {
        success: true,
        data: {
          storyId,
          beatCount: 0,
          beats: [],
          note: "autoPlan=false，已创建故事但未规划分镜",
        },
      };
    }

    ctx.onProgress?.("正在用 AI 规划分镜…");
    const { planStory } = await import("@/modules/storyboard");
    const { characterService } = await import("@/modules/character");
    const { sceneService } = await import("@/modules/scene");

    const [charResult, sceneResult] = await Promise.all([
      characterService.getAll(),
      sceneService.getAll(),
    ]);
    const characters = charResult.ok ? charResult.value : [];
    const scenes = sceneResult.ok ? sceneResult.value : [];

    const planResult = await planStory(story, characters, scenes, {
      enhancedGeneration: false,
      strictMode: false,
    });
    if (!planResult.ok) {
      return {
        success: false,
        error: `规划分镜失败：${planResult.error.message}`,
        data: { storyId, beatCount: 0 },
      };
    }
    const beats = planResult.value.beats;

    // 保存分镜到故事
    const updateResult = await storyService.update(storyId, { id: storyId, beats });
    if (!updateResult.ok) {
      ctx.onProgress?.(`警告：分镜已生成但保存失败：${updateResult.error.message}`);
    }

    // Step 3: 校验分镜计划
    ctx.onProgress?.("正在校验分镜计划…");
    const validationIssues: Array<{ beatId: string; issue: string; severity: string }> = [];
    const charIdSet = new Set(characters.map((c) => c.id));
    const sceneIdSet = new Set(scenes.map((s) => s.id));
    for (const beat of beats) {
      const desc = beat.content || beat.description;
      if (!desc || !desc.trim()) {
        validationIssues.push({
          beatId: beat.id,
          issue: "分镜缺少描述",
          severity: "error",
        });
      }
      if (beat.duration == null || beat.duration <= 0) {
        validationIssues.push({
          beatId: beat.id,
          issue: "分镜时长无效",
          severity: "warning",
        });
      }
      for (const cid of beat.characterIds || []) {
        if (!charIdSet.has(cid)) {
          validationIssues.push({
            beatId: beat.id,
            issue: `角色引用无效：${cid}`,
            severity: "warning",
          });
        }
      }
      if (beat.sceneId && !sceneIdSet.has(beat.sceneId)) {
        validationIssues.push({
          beatId: beat.id,
          issue: `场景引用无效：${beat.sceneId}`,
          severity: "warning",
        });
      }
    }

    return {
      success: true,
      data: {
        storyId,
        beatCount: beats.length,
        beats: beats.map((b, i) => ({
          index: i,
          id: b.id,
          title: b.title,
          description: b.content || b.description,
          duration: b.duration,
          characterIds: b.characterIds,
          sceneId: b.sceneId,
        })),
        validationIssues: validationIssues.length > 0 ? validationIssues : undefined,
        autoFixedCount: planResult.value.autoFixedCount,
      },
    };
  },
};
