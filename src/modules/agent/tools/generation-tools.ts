/**
 * AI 生成工具（Generation Tools）
 *
 * 包含工具：
 * - generate_character_image：生成角色图片（并更新角色 thumbnailPath）
 * - generate_scene_image：生成场景图片（并更新场景 thumbnailPath）
 * - generate_prop_image：生成道具图片（仅返回 URL，不入库）
 * - analyze_image：分析图片（风格/构图/元素/色彩）
 * - generate_text：生成文本（非流式，用于子任务）
 * - generate_music：生成配乐（当前不支持，优雅降级）
 * - generate_voiceover：生成旁白配音（当前不支持，优雅降级）
 * - text_to_speech：文字转语音（当前不支持，优雅降级）
 * - transcribe_audio：音频转文字（当前不支持，优雅降级）
 *
 * 设计要点：
 * - 通过 DI container 获取 imageProvider / textProvider
 * - characterService / sceneService 通过动态 import 获取（避免循环依赖）
 * - ApiResponse 模式：{ success, data?, error? }
 * - Result 模式（characterService/sceneService）：{ ok, value } | { ok: false, error }
 * - 音频类工具当前无可用 provider，返回清晰错误信息和配置建议
 */

import type { ToolImpl } from "../domain/types";
import { TOOL_TIMEOUTS } from "../services/tool-executor";
import { container } from "@/infrastructure/di";
import type { Character, Scene } from "@/domain/schemas";

// ============= 辅助函数 =============

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

/** 构建音频类工具不支持的统一返回结果 */
function unsupportedAudioResult(capability: string, suggestion: string): {
  success: false;
  error: string;
  data: { suggestion: string; capability: string };
} {
  return {
    success: false,
    error: `当前未配置支持${capability}的 provider。请在设置中配置支持 ${capability} 能力的 API。`,
    data: { suggestion, capability },
  };
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
          sceneId: { type: "string", description: "场景 ID（必填）" },
          customPrompt: {
            type: "string",
            description: "自定义提示词，覆盖场景设定。",
          },
          style: { type: "string", description: "风格覆盖。仅在自动构建提示词时生效。" },
          size: {
            type: "string",
            enum: ["square", "square_hd", "landscape_4_3", "landscape_16_9"],
            description: "图片尺寸比例，默认 landscape_4_3",
            default: "landscape_4_3",
          },
          providerId: { type: "string", description: "指定图片生成 provider ID" },
          modelId: { type: "string", description: "指定图片生成 model ID" },
        },
        required: ["sceneId"],
      },
    },
  },
  domain: "generation",
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

/** 生成文本 */
export const generateTextTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "generate_text",
      description:
        "生成文本（非流式）。适用于子任务场景，如生成角色背景故事、场景描述建议、剧情梗概、提示词优化等。" +
        "注意：这是非流式接口，一次性返回完整文本。如需流式输出请使用 Agent Loop 自身的推理能力。",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "文本生成提示词（必填）" },
          maxTokens: { type: "number", description: "最大 token 数，默认 2048", default: 2048 },
          temperature: {
            type: "number",
            description: "温度（0-2），默认 0.7。越高越有创造性，越低越确定。",
            default: 0.7,
          },
          providerId: { type: "string", description: "指定文本生成 provider ID" },
          modelId: { type: "string", description: "指定文本生成 model ID" },
        },
        required: ["prompt"],
      },
    },
  },
  domain: "generation",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args) {
    const prompt = String(args.prompt);
    const maxTokens = args.maxTokens != null ? Number(args.maxTokens) : 2048;
    const temperature = args.temperature != null ? Number(args.temperature) : 0.7;
    const providerId = args.providerId ? String(args.providerId) : undefined;
    const modelId = args.modelId ? String(args.modelId) : undefined;

    const result = await container.textProvider.generateText(prompt, {
      maxTokens,
      temperature,
      providerId,
      modelId,
    });
    if (!result.success) {
      return { success: false, error: result.error || "文本生成失败" };
    }

    return {
      success: true,
      data: {
        text: result.data.text,
      },
    };
  },
};

/** 生成配乐 */
export const generateMusicTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "generate_music",
      description:
        "生成背景配乐。当前项目暂未集成音频生成 provider，调用会返回不支持提示和配置建议。" +
        "适用于：用户要求「生成背景音乐」、「配乐」、「BGM」等场景。",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "音乐风格描述，如「悬疑紧张的背景音乐」、「温馨欢快的旋律」",
          },
          duration: { type: "number", description: "时长（秒），默认 30", default: 30 },
          providerId: { type: "string", description: "指定音频 provider ID" },
          modelId: { type: "string", description: "指定音频 model ID" },
        },
        required: ["prompt"],
      },
    },
  },
  domain: "generation",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute() {
    return unsupportedAudioResult(
      "音频生成",
      "可配置 Suno API 或类似音频生成服务，并在能力映射中添加 audio 能力。",
    );
  },
};

/** 生成旁白配音 */
export const generateVoiceoverTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "generate_voiceover",
      description:
        "生成旁白配音。当前项目暂未集成语音合成 provider，调用会返回不支持提示和配置建议。" +
        "适用于：用户要求「生成旁白」、「配音」、「朗读这段文字」等场景。",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "旁白文本（必填）" },
          voice: {
            type: "string",
            description: "声音类型，如「男声」、「女声」、「中性」",
          },
          speed: {
            type: "number",
            description: "语速（0.5-2.0），默认 1.0",
            default: 1.0,
          },
          providerId: { type: "string", description: "指定语音 provider ID" },
          modelId: { type: "string", description: "指定语音 model ID" },
        },
        required: ["text"],
      },
    },
  },
  domain: "generation",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute() {
    return unsupportedAudioResult(
      "语音合成",
      "可配置 TTS 服务（如 Azure TTS、阿里云语音合成）并在能力映射中添加 audio 能力。",
    );
  },
};

/** 文字转语音 */
export const textToSpeechTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "text_to_speech",
      description:
        "文字转语音。当前项目暂未集成 TTS provider，调用会返回不支持提示和配置建议。" +
        "适用于：用户要求「把这段文字转成语音」、「朗读」等场景。",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "要转换的文本（必填）" },
          voice: { type: "string", description: "声音类型" },
          language: { type: "string", description: "语言代码，默认 zh", default: "zh" },
          providerId: { type: "string", description: "指定 TTS provider ID" },
          modelId: { type: "string", description: "指定 TTS model ID" },
        },
        required: ["text"],
      },
    },
  },
  domain: "generation",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute() {
    return unsupportedAudioResult(
      "文字转语音",
      "可配置 TTS 服务（如 OpenAI TTS、Azure 语音服务）并在能力映射中添加 audio 能力。",
    );
  },
};

/** 音频转文字 */
export const transcribeAudioTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "transcribe_audio",
      description:
        "音频转文字（语音识别）。当前项目暂未集成 ASR provider，调用会返回不支持提示和配置建议。" +
        "适用于：用户要求「把这段音频转成文字」、「识别语音」等场景。",
      parameters: {
        type: "object",
        properties: {
          audioUrl: { type: "string", description: "音频文件 URL（必填）" },
          language: { type: "string", description: "音频语言代码，如 zh、en" },
          providerId: { type: "string", description: "指定 ASR provider ID" },
          modelId: { type: "string", description: "指定 ASR model ID" },
        },
        required: ["audioUrl"],
      },
    },
  },
  domain: "generation",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute() {
    return unsupportedAudioResult(
      "语音识别",
      "可配置 ASR 服务（如 OpenAI Whisper、阿里云语音识别）并在能力映射中添加 audio 能力。",
    );
  },
};

/** 导出所有生成工具 */
export const generationTools: ToolImpl[] = [
  generateCharacterImageTool,
  generateSceneImageTool,
  generatePropImageTool,
  analyzeImageTool,
  generateTextTool,
  generateMusicTool,
  generateVoiceoverTool,
  textToSpeechTool,
  transcribeAudioTool,
];
