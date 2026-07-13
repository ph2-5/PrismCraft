/**
 * 子流程工具 — 角色相关（Subworkflow Character Tools）
 *
 * 包含工具：
 * - auto_create_character：一句话创建完整角色（推理设定 → 创建 → 生成图片）
 */

import type { ToolImpl } from "../domain/types";
import { TOOL_TIMEOUTS } from "../services/tool-executor";
import { container } from "@/infrastructure/di";
import { generateJsonWithAI, toStringArray } from "./subworkflow-helpers";

/** 1. 一句话创建完整角色（推理设定 → 创建 → 生成图片） */
export const autoCreateCharacterTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "auto_create_character",
      description:
        "一站式工具：用一句话描述自动创建完整角色。内部流程：1) 用 AI 推理生成角色完整设定（姓名/性别/年龄/性格/外观/自定义提示词）；2) 调用 characterService 创建角色记录；3) 如 autoGenerateImage=true（默认），调用 imageProvider 生成角色图片并更新缩略图。" +
        "适用于：用户要求「帮我创建一个赛博朋克风格的女性侦探」、「一句话建角色」等场景。" +
        "注意：此工具会调用 LLM 和图片生成 API，执行时间较长（通常 30 秒到 2 分钟）。",
      parameters: {
        type: "object",
        properties: {
          description: {
            type: "string",
            maxLength: 2000,
            description: "用户对角色的描述（必填，如「赛博朋克风格的女性侦探，冷酷干练」）",
          },
          autoGenerateImage: {
            type: "boolean",
            description: "是否自动生成角色图片，默认 true",
            default: true,
          },
          style: {
            type: "string",
            maxLength: 200,
            description: "风格覆盖（可选，如「日式动漫」、「写实」）。不提供则由 AI 推断",
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
    const styleOverride = args.style ? String(args.style) : undefined;
    const steps: string[] = [];

    // Step 1: 用 textProvider 推理生成角色设定
    ctx.onProgress?.("正在用 AI 推理角色设定…");
    const prompt = `你是一位角色设计师。请根据以下描述生成角色完整设定的 JSON。

用户描述：${description}

请严格按照以下 JSON 格式输出，不要输出任何其他内容：
{
  "name": "角色姓名（中文）",
  "gender": "性别（男性/女性/中性/无性别）",
  "age": 25,
  "personality": "性格特征，可用、分隔多个",
  "appearance": {
    "hairColor": "发色",
    "hairStyle": "发型",
    "eyeColor": "瞳色",
    "height": "身高",
    "build": "体型",
    "clothing": "服装描述"
  },
  "customPrompt": "用于 AI 图片生成的英文提示词，描述角色外观"
}

要求：
1. 姓名要有特色，符合角色风格
2. 外观要详细具体，便于生成图片
3. customPrompt 用英文，包含角色全貌、服装、风格等关键信息`;
    const settings = await generateJsonWithAI(prompt);
    if (!settings) {
      return { success: false, error: "AI 推理角色设定失败：无法解析返回的 JSON" };
    }
    steps.push("推理设定");

    // Step 2: 创建角色
    ctx.onProgress?.("正在创建角色记录…");
    const { characterService } = await import("@/modules/character");
    const appearance = (settings.appearance as Record<string, unknown> | undefined) ?? {};
    const style = styleOverride ?? (settings.style ? String(settings.style) : "");
    const createResult = await characterService.create({
      name: String(settings.name ?? `角色_${Date.now()}`),
      description,
      gender: String(settings.gender ?? ""),
      style,
      age: settings.age != null ? Number(settings.age) : undefined,
      personality: toStringArray(settings.personality),
      appearance: {
        hairColor: String(appearance.hairColor ?? ""),
        hairStyle: String(appearance.hairStyle ?? ""),
        eyeColor: String(appearance.eyeColor ?? ""),
        height: String(appearance.height ?? ""),
        build: String(appearance.build ?? ""),
        clothing: String(appearance.clothing ?? ""),
      },
      prompt: String(settings.customPrompt ?? ""),
    });
    if (!createResult.ok) {
      return {
        success: false,
        error: `创建角色失败：${createResult.error.message}`,
        data: { steps },
      };
    }
    const character = createResult.value;
    steps.push("创建角色");

    // Step 3: 生成图片（可选）
    let imageUrl: string | undefined;
    if (autoGenerateImage) {
      ctx.onProgress?.("正在生成角色图片…");
      try {
        const imagePrompt =
          String(settings.customPrompt ?? "") || `${character.name}, ${description}`;
        const imageResult = await container.imageProvider.generateImage(imagePrompt, "character", {
          purpose: "character",
        });
        if (imageResult.success && imageResult.data) {
          imageUrl = imageResult.data.imageUrl;
          // 更新角色缩略图
          const updateResult = await characterService.update(character.id, {
            id: character.id,
            thumbnailPath: imageUrl,
            generatedImage: imageUrl,
          });
          if (!updateResult.ok) {
            // 图片生成成功但更新失败，不阻断流程
            ctx.onProgress?.(`警告：角色图片已生成但更新记录失败：${updateResult.error.message}`);
          }
          steps.push("生成图片");
        } else {
          ctx.onProgress?.(`警告：角色图片生成失败：${imageResult.error ?? "未知错误"}`);
        }
      } catch (e) {
        ctx.onProgress?.(`警告：角色图片生成异常：${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return {
      success: true,
      data: {
        characterId: character.id,
        name: character.name,
        imageUrl,
        steps,
      },
    };
  },
};
