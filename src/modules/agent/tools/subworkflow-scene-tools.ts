/**
 * 子流程工具 — 场景相关（Subworkflow Scene Tools）
 *
 * 包含工具：
 * - auto_create_scene：一句话创建完整场景（推理设定 → 创建 → 生成图片）
 */

import type { ToolImpl } from "../domain/types";
import { TOOL_TIMEOUTS } from "../domain/constants";
import { container } from "@/infrastructure/di";
import { generateJsonWithAI } from "./subworkflow-helpers";

/** 2. 一句话创建完整场景（推理设定 → 创建 → 生成图片） */
export const autoCreateSceneTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "auto_create_scene",
      description:
        "一站式工具：用一句话描述自动创建完整场景。内部流程：1) 用 AI 推理生成场景完整设定（名称/类型/时间/天气/情绪/光照/自定义提示词）；2) 调用 sceneService 创建场景记录；3) 如 autoGenerateImage=true（默认），调用 imageProvider 生成场景图片并更新缩略图。" +
        "适用于：用户要求「帮我创建一个雨夜赛博朋克街道场景」、「一句话建场景」等场景。" +
        "注意：此工具会调用 LLM 和图片生成 API，执行时间较长。",
      parameters: {
        type: "object",
        properties: {
          description: {
            type: "string",
            maxLength: 2000,
            description: "用户对场景的描述（必填，如「雨夜的赛博朋克街道，霓虹灯闪烁」）",
          },
          autoGenerateImage: {
            type: "boolean",
            description: "是否自动生成场景图片，默认 true",
            default: true,
          },
          style: {
            type: "string",
            maxLength: 200,
            description: "风格覆盖（可选）。不提供则由 AI 推断",
          },
        },
        required: ["description"],
      },
    },
  },
  domain: "workflow",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args, ctx) {
    const description = String(args.description);
    const autoGenerateImage = args.autoGenerateImage !== false;
    const steps: string[] = [];

    // Step 1: 用 textProvider 推理生成场景设定
    ctx.onProgress?.("正在用 AI 推理场景设定…");
    const prompt = `你是一位场景设计师。请根据以下描述生成场景完整设定的 JSON。

用户描述：${description}

请严格按照以下 JSON 格式输出，不要输出任何其他内容：
{
  "name": "场景名称（中文）",
  "type": "场景类型（如：室内、室外、城市、自然）",
  "timeOfDay": "时间（如：白天、黄昏、夜晚）",
  "weather": "天气（如：晴天、雨天、雪天）",
  "mood": "情绪氛围（如：温馨、紧张、神秘）",
  "lighting": "光照描述（如：霓虹灯、月光、阳光）",
  "customPrompt": "用于 AI 图片生成的英文提示词，描述场景全貌"
}

要求：
1. 名称要简洁有特色
2. 各字段要具体，便于生成图片
3. customPrompt 用英文，包含场景、光照、氛围等关键信息`;
    const settings = await generateJsonWithAI(prompt);
    if (!settings) {
      return { success: false, error: "AI 推理场景设定失败：无法解析返回的 JSON" };
    }
    steps.push("推理设定");

    // Step 2: 创建场景
    ctx.onProgress?.("正在创建场景记录…");
    const { sceneService } = await import("@/modules/scene");
    const createResult = await sceneService.create({
      name: String(settings.name ?? `场景_${Date.now()}`),
      description,
      type: String(settings.type ?? ""),
      timeOfDay: String(settings.timeOfDay ?? ""),
      weather: String(settings.weather ?? ""),
      mood: String(settings.mood ?? ""),
      lighting: String(settings.lighting ?? ""),
      elements: [],
      colors: [],
      prompt: String(settings.customPrompt ?? ""),
    });
    if (!createResult.ok) {
      return {
        success: false,
        error: `创建场景失败：${createResult.error.message}`,
        data: { steps },
      };
    }
    const scene = createResult.value;
    steps.push("创建场景");

    // Step 3: 生成图片（可选）
    let imageUrl: string | undefined;
    if (autoGenerateImage) {
      ctx.onProgress?.("正在生成场景图片…");
      try {
        const imagePrompt =
          String(settings.customPrompt ?? "") || `${scene.name}, ${description}`;
        const imageResult = await container.imageProvider.generateImage(imagePrompt, "scene", {
          purpose: "scene",
        });
        if (imageResult.success && imageResult.data) {
          imageUrl = imageResult.data.imageUrl;
          const updateResult = await sceneService.update(scene.id, {
            id: scene.id,
            thumbnailPath: imageUrl,
            generatedImage: imageUrl,
          });
          if (!updateResult.ok) {
            ctx.onProgress?.(`警告：场景图片已生成但更新记录失败：${updateResult.error.message}`);
          }
          steps.push("生成图片");
        } else {
          ctx.onProgress?.(`警告：场景图片生成失败：${imageResult.error ?? "未知错误"}`);
        }
      } catch (e) {
        ctx.onProgress?.(`警告：场景图片生成异常：${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return {
      success: true,
      data: {
        sceneId: scene.id,
        name: scene.name,
        imageUrl,
        steps,
      },
    };
  },
};
