/**
 * AI 生成工具 — 图片类（Image Tools）
 *
 * 包含工具：
 * - generate_character_image：生成角色图片（并更新角色 thumbnailPath）
 * - generate_scene_image：生成场景图片（并更新场景 thumbnailPath）
 * - generate_prop_image：生成道具图片（仅返回 URL，不入库）
 * - analyze_image：分析图片（风格/构图/元素/色彩）
 *
 * 设计要点：
 * - 通过 DI container 获取 imageProvider
 * - characterService / sceneService 通过动态 import 获取（避免循环依赖）
 * - ApiResponse 模式：{ success, data?, error? }
 * - Result 模式（characterService/sceneService）：{ ok, value } | { ok: false, error }
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import { container } from "@/infrastructure/di";
import type { Character, Scene } from "@/domain/schemas";

// ============= 提示词构建辅助 =============

/**
 * 基于角色设定自动构建图片生成提示词。
 * 当角色没有现成的 imageGenerationPrompt / prompt 时使用。
 */
function buildCharacterPromptFromFields(character: Character, styleOverride?: string): string {
  const parts: string[] = [];
  const style = styleOverride || character.style;
  if (style) parts.push(style);
  if (character.name) parts.push(`character: ${character.name}`);
  if (character.gender) parts.push(character.gender);
  if (character.age) parts.push(`${character.age} years old`);
  if (character.description) parts.push(character.description);

  const app = character.appearance;
  if (app) {
    const appParts: string[] = [];
    if (app.hairColor) appParts.push(`hair color: ${app.hairColor}`);
    if (app.hairStyle) appParts.push(`hair style: ${app.hairStyle}`);
    if (app.eyeColor) appParts.push(`eye color: ${app.eyeColor}`);
    if (app.height) appParts.push(`height: ${app.height}`);
    if (app.build) appParts.push(`build: ${app.build}`);
    if (app.clothing) appParts.push(`clothing: ${app.clothing}`);
    if (appParts.length > 0) parts.push(appParts.join(", "));
  }
  return parts.join(", ");
}

/**
 * 基于场景设定自动构建图片生成提示词。
 */
function buildScenePromptFromFields(scene: Scene, styleOverride?: string): string {
  const parts: string[] = [];
  if (styleOverride) parts.push(styleOverride);
  if (scene.name) parts.push(`scene: ${scene.name}`);
  if (scene.type) parts.push(scene.type);
  if (scene.timeOfDay) parts.push(`time of day: ${scene.timeOfDay}`);
  if (scene.weather) parts.push(`weather: ${scene.weather}`);
  if (scene.mood) parts.push(`mood: ${scene.mood}`);
  if (scene.lighting) parts.push(`lighting: ${scene.lighting}`);
  if (scene.description) parts.push(scene.description);
  if (scene.elements?.length) parts.push(`elements: ${scene.elements.join(", ")}`);
  if (scene.colors?.length) parts.push(`colors: ${scene.colors.join(", ")}`);
  return parts.join(", ");
}

// ============= 工具实现 =============

/** 生成角色图片 */
export const generateCharacterImageTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "generate_character_image",
      description:
        "为指定角色生成图片。会基于角色的设定（name/style/gender/age/description/appearance）自动构建提示词，" +
        "也可通过 customPrompt 覆盖。生成成功后会自动更新角色的 thumbnailPath。" +
        "适用于：用户要求「为这个角色生成一张图片」、「画出角色形象」、「更新角色头像」等场景。",
      parameters: {
        type: "object",
        properties: {
          characterId: { type: "string", description: "角色 ID（必填）" },
          customPrompt: {
            type: "string",
            description: "自定义提示词，覆盖角色设定。如提供则忽略角色自身的 prompt 字段。",
          },
          style: { type: "string", description: "风格覆盖（如：日式动漫、写实、赛博朋克）。仅在自动构建提示词时生效。" },
          size: {
            type: "string",
            enum: ["square", "square_hd", "portrait_4_3", "portrait_16_9"],
            description: "图片尺寸比例，默认 portrait_4_3",
            default: "portrait_4_3",
          },
          providerId: { type: "string", description: "指定图片生成 provider ID（覆盖默认）" },
          modelId: { type: "string", description: "指定图片生成 model ID（覆盖默认）" },
        },
        required: ["characterId"],
      },
    },
  },
  domain: "generation",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args) {
    const characterId = String(args.characterId);
    const { characterService } = await import("@/modules/character");

    // 1. 获取角色详情
    const charResult = await characterService.getById(characterId);
    if (!charResult.ok) {
      return { success: false, error: `获取角色失败：${charResult.error.message}` };
    }
    const character = charResult.value;

    // 2. 构建提示词：customPrompt > 角色现有 prompt > 自动构建
    const customPrompt = args.customPrompt ? String(args.customPrompt) : undefined;
    const styleOverride = args.style ? String(args.style) : undefined;
    const size = args.size ? String(args.size) : "portrait_4_3";

    let prompt: string;
    if (customPrompt) {
      prompt = customPrompt;
    } else if (character.imageGenerationPrompt) {
      prompt = character.imageGenerationPrompt;
    } else if (character.prompt) {
      prompt = character.prompt;
    } else {
      prompt = buildCharacterPromptFromFields(character, styleOverride);
    }

    if (!prompt) {
      return { success: false, error: "无法构建提示词：角色缺少设定信息且未提供 customPrompt" };
    }

    // 3. 调用图片生成
    const providerId = args.providerId ? String(args.providerId) : undefined;
    const modelId = args.modelId ? String(args.modelId) : undefined;

    const result = await container.imageProvider.generateImage(prompt, "character", {
      size,
      providerId,
      modelId,
      purpose: "character",
    });
    if (!result.success) {
      return { success: false, error: result.error || "图片生成失败" };
    }

    const imageUrl = result.data.imageUrl;

    // 4. 更新角色 thumbnailPath（失败不阻断返回，标记 updated=false）
    let updated = true;
    const updateResult = await characterService.update(characterId, {
      ...character,
      thumbnailPath: imageUrl,
    });
    if (!updateResult.ok) {
      updated = false;
    }

    return {
      success: true,
      data: {
        imageUrl,
        characterId,
        prompt,
        updated,
      },
    };
  },
};

/** 生成场景图片 */
export const generateSceneImageTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "generate_scene_image",
      description:
        "为指定场景生成图片。会基于场景设定（name/type/timeOfDay/weather/mood/lighting/description）自动构建提示词，" +
        "也可通过 customPrompt 覆盖。生成成功后会自动更新场景的 thumbnailPath。" +
        "适用于：用户要求「为这个场景生成一张图片」、「画出场景画面」等场景。",
      parameters: {
        type: "object",
        properties: {
          sceneId: { type: "string", maxLength: 100, description: "场景 ID（必填）" },
          customPrompt: {
            type: "string",
            maxLength: 5000,
            description: "自定义提示词，覆盖场景设定。",
          },
          style: { type: "string", maxLength: 200, description: "风格覆盖。仅在自动构建提示词时生效。" },
          size: {
            type: "string",
            enum: ["square", "square_hd", "landscape_4_3", "landscape_16_9"],
            description: "图片尺寸比例，默认 landscape_4_3",
            default: "landscape_4_3",
          },
          providerId: { type: "string", maxLength: 100, description: "指定图片生成 provider ID" },
          modelId: { type: "string", maxLength: 100, description: "指定图片生成 model ID" },
        },
        required: ["sceneId"],
      },
    },
  },
  domain: "generation",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args) {
    const sceneId = String(args.sceneId);
    const { sceneService } = await import("@/modules/scene");

    // 1. 获取场景详情
    const sceneResult = await sceneService.getById(sceneId);
    if (!sceneResult.ok) {
      return { success: false, error: `获取场景失败：${sceneResult.error.message}` };
    }
    const scene = sceneResult.value;

    // 2. 构建提示词
    const customPrompt = args.customPrompt ? String(args.customPrompt) : undefined;
    const styleOverride = args.style ? String(args.style) : undefined;
    const size = args.size ? String(args.size) : "landscape_4_3";

    let prompt: string;
    if (customPrompt) {
      prompt = customPrompt;
    } else if (scene.imageGenerationPrompt) {
      prompt = scene.imageGenerationPrompt;
    } else if (scene.prompt) {
      prompt = scene.prompt;
    } else {
      prompt = buildScenePromptFromFields(scene, styleOverride);
    }

    if (!prompt) {
      return { success: false, error: "无法构建提示词：场景缺少设定信息且未提供 customPrompt" };
    }

    // 3. 调用图片生成
    const providerId = args.providerId ? String(args.providerId) : undefined;
    const modelId = args.modelId ? String(args.modelId) : undefined;

    const result = await container.imageProvider.generateImage(prompt, "scene", {
      size,
      providerId,
      modelId,
      purpose: "scene",
    });
    if (!result.success) {
      return { success: false, error: result.error || "图片生成失败" };
    }

    const imageUrl = result.data.imageUrl;

    // 4. 更新场景 thumbnailPath
    let updated = true;
    const updateResult = await sceneService.update(sceneId, {
      ...scene,
      thumbnailPath: imageUrl,
    });
    if (!updateResult.ok) {
      updated = false;
    }

    return {
      success: true,
      data: {
        imageUrl,
        sceneId,
        prompt,
        updated,
      },
    };
  },
};

/** 生成道具图片 */
export const generatePropImageTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "generate_prop_image",
      description:
        "生成道具图片。基于道具名称和描述构建提示词，仅返回图片 URL，不入库（入库由调用方决定）。" +
        "适用于：用户要求「生成一个道具」、「画一个物品」等场景。",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "道具名称（必填）" },
          description: { type: "string", description: "道具描述（必填）" },
          style: { type: "string", description: "风格（如：写实、卡通、复古）" },
          size: {
            type: "string",
            enum: ["square", "square_hd", "portrait_4_3", "landscape_4_3"],
            description: "图片尺寸比例，默认 square",
            default: "square",
          },
          providerId: { type: "string", description: "指定图片生成 provider ID" },
          modelId: { type: "string", description: "指定图片生成 model ID" },
        },
        required: ["name", "description"],
      },
    },
  },
  domain: "generation",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args) {
    const name = String(args.name);
    const description = String(args.description);
    const style = args.style ? String(args.style) : "";
    const size = args.size ? String(args.size) : "square";
    const providerId = args.providerId ? String(args.providerId) : undefined;
    const modelId = args.modelId ? String(args.modelId) : undefined;

    const prompt = `a ${style} prop: ${name}. ${description}`.replace(/\s+/g, " ").trim();

    const result = await container.imageProvider.generateImage(prompt, "prop", {
      size,
      providerId,
      modelId,
      purpose: "prop",
    });
    if (!result.success) {
      return { success: false, error: result.error || "图片生成失败" };
    }

    return {
      success: true,
      data: {
        imageUrl: result.data.imageUrl,
        name,
        prompt,
      },
    };
  },
};

/** 分析图片 */
export const analyzeImageTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "analyze_image",
      description:
        "分析图片，提取信息（风格/构图/元素/色彩等）。可用于参考图分析、风格提取、画面理解。" +
        "适用于：用户要求「分析这张图」、「提取这张图的风格」、「这张图用了什么色彩」等场景。",
      parameters: {
        type: "object",
        properties: {
          imageUrl: { type: "string", description: "图片 URL（必填）" },
          type: {
            type: "string",
            enum: ["character", "scene"],
            description: "分析类型：character 侧重角色特征，scene 侧重场景构图",
          },
          prompt: {
            type: "string",
            description: "自定义分析方向，如「分析这张图的色彩搭配」、「提取构图信息」",
          },
          providerId: { type: "string", description: "指定分析 provider ID" },
          modelId: { type: "string", description: "指定分析 model ID" },
        },
        required: ["imageUrl"],
      },
    },
  },
  domain: "generation",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args) {
    const imageUrl = String(args.imageUrl);
    const type = args.type === "character" || args.type === "scene" ? args.type : undefined;
    const prompt = args.prompt ? String(args.prompt) : undefined;
    const providerId = args.providerId ? String(args.providerId) : undefined;
    const modelId = args.modelId ? String(args.modelId) : undefined;

    const result = await container.imageProvider.analyzeImage(imageUrl, type, prompt, {
      providerId,
      modelId,
    });
    if (!result.success) {
      return { success: false, error: result.error || "图片分析失败" };
    }

    return {
      success: true,
      data: {
        analysis: result.data.analysis,
        analyzed: result.data.analyzed,
      },
    };
  },
};
