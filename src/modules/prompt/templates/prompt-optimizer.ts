/**
 * 提示词自动优化服务
 *
 * 职责：
 * - 为角色图片生成提供 LLM 提示词优化（复用场景优化的模式）
 * - 为视频生成提供 LLM 提示词优化
 * - 基于用户输入的粗描述，生成专业的英文 prompt
 *
 * 与现有 scene-prompt-service.generateScenePromptOptimization 的区别：
 * - 场景优化已存在于 modules/prompt/scene/
 * - 本服务补充角色和视频的优化能力
 *
 * 设计要点：
 * - 委托 container.textProvider 调用 LLM
 * - 失败时返回原始描述（不阻断流程）
 * - 支持风格指导（anime/realistic/cyberpunk 等）
 */

import { container } from "@/infrastructure/di";
import { errorLogger } from "@/shared/error-logger";

/** 优化结果 */
export interface OptimizedPromptResult {
  /** 优化后的提示词（英文） */
  optimizedPrompt: string;
  /** 负面提示词建议（如有） */
  negativePrompt?: string;
  /** 是否成功（false 时 optimizedPrompt 为原始输入） */
  success: boolean;
  /** 错误信息 */
  error?: string;
}

/** 角色风格指导 */
const CHARACTER_STYLE_GUIDES: Record<string, string> = {
  anime: "anime style, cel shading, vibrant colors, clean line art, expressive eyes, Japanese animation aesthetic",
  realistic: "photorealistic, cinematic portrait, professional photography, natural skin texture, realistic lighting",
  "3d": "3D render, octane render, pixar style, subsurface scattering, soft global illumination",
  cyberpunk: "cyberpunk style, neon accents, holographic elements, dystopian aesthetic, blade runner inspired",
  chibi: "chibi style, super deformed, cute proportions, big head small body, kawaii aesthetic",
  watercolor: "watercolor painting style, soft brush strokes, blended colors, artistic, hand-painted",
  sketch: "pencil sketch, monochrome, cross-hatching, detailed line work, traditional drawing",
  pixel: "pixel art, 8-bit aesthetic, limited color palette, retro game style",
};

/** 视频风格指导 */
const VIDEO_STYLE_GUIDES: Record<string, string> = {
  cinematic: "cinematic, film grain, anamorphic lens, shallow depth of field, professional color grading",
  anime: "anime animation, cel animation, smooth 2D motion, Japanese animation style",
  realistic: "photorealistic, live action, natural motion, realistic physics, documentary style",
  cyberpunk: "cyberpunk aesthetic, neon lighting, holographic effects, dystopian atmosphere",
  fantasy: "fantasy style, magical effects, ethereal lighting, otherworldly atmosphere",
  wuxia: "Chinese wuxia style, martial arts choreography, flowing robes, ink painting aesthetic",
  scifi: "science fiction, futuristic technology, space environment, advanced CGI",
  vintage: "vintage film look, 35mm grain, warm color grading, retro aesthetic",
};

/**
 * 优化角色图片提示词
 *
 * 用户输入粗描述 → LLM 生成专业英文 prompt（80-150 词）+ 负面提示词建议
 *
 * @param rawDescription 用户输入的角色描述（中文或英文）
 * @param style 风格（anime/realistic/cyberpunk 等）
 * @param options 可选参数
 */
export async function optimizeCharacterPrompt(
  rawDescription: string,
  style: string = "anime",
  options?: { providerId?: string; modelId?: string },
): Promise<OptimizedPromptResult> {
  if (!rawDescription || !rawDescription.trim()) {
    return { optimizedPrompt: "", success: false, error: "描述为空" };
  }

  const styleGuide = CHARACTER_STYLE_GUIDES[style] ?? CHARACTER_STYLE_GUIDES.anime;

  const prompt = `You are a professional AI character designer. Convert the following character description into a high-quality English prompt for AI image generation.

User description: ${rawDescription}

Style guide: ${styleGuide}

Requirements:
1. Output a single paragraph of 80-150 words
2. Include: physical appearance (hair, eyes, face, body), clothing, expression, pose
3. Add quality tags: masterpiece, best quality, highly detailed, 8k
4. Add lighting and composition: cinematic lighting, portrait composition
5. Do NOT include negative prompts in this section
6. Output ONLY the prompt text, no explanation

Character prompt:`;

  try {
    const result = await container.textProvider.generateText(prompt, {
      maxTokens: 300,
      temperature: 0.7,
      providerId: options?.providerId,
      modelId: options?.modelId,
    });

    if (!result.success || !result.data?.text) {
      return {
        optimizedPrompt: rawDescription,
        success: false,
        error: result.error ?? "LLM 调用失败",
      };
    }

    const optimized = result.data.text.trim();
    if (optimized.length < 20) {
      return {
        optimizedPrompt: rawDescription,
        success: false,
        error: "优化结果过短",
      };
    }

    return {
      optimizedPrompt: optimized,
      success: true,
    };
  } catch (e) {
    errorLogger.warn("[prompt-optimizer] 角色提示词优化失败", e);
    return {
      optimizedPrompt: rawDescription,
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * 优化视频提示词
 *
 * 用户输入粗描述 → LLM 生成专业英文视频 prompt（含运镜、动作、氛围）
 *
 * @param rawDescription 用户输入的视频场景描述
 * @param style 风格（cinematic/anime/realistic 等）
 * @param options 可选参数
 */
export async function optimizeVideoPrompt(
  rawDescription: string,
  style: string = "cinematic",
  options?: {
    providerId?: string;
    modelId?: string;
    duration?: number;
    cameraMovement?: string;
  },
): Promise<OptimizedPromptResult> {
  if (!rawDescription || !rawDescription.trim()) {
    return { optimizedPrompt: "", success: false, error: "描述为空" };
  }

  const styleGuide = VIDEO_STYLE_GUIDES[style] ?? VIDEO_STYLE_GUIDES.cinematic;
  const durationHint = options?.duration ? `${options.duration} seconds` : "5 seconds";
  const cameraHint = options?.cameraMovement ?? "smooth camera movement";

  const prompt = `You are a professional AI video prompt engineer. Convert the following description into a high-quality English prompt for AI video generation.

User description: ${rawDescription}

Style guide: ${styleGuide}
Duration: ${durationHint}
Camera: ${cameraHint}

Requirements:
1. Output a single paragraph of 80-150 words
2. Include: scene description, subject action, camera movement, lighting, atmosphere
3. Add quality tags: cinematic quality, 4k, ultra detailed, smooth motion
4. Specify motion: how subjects and camera move during the clip
5. Output ONLY the prompt text, no explanation

Video prompt:`;

  try {
    const result = await container.textProvider.generateText(prompt, {
      maxTokens: 300,
      temperature: 0.7,
      providerId: options?.providerId,
      modelId: options?.modelId,
    });

    if (!result.success || !result.data?.text) {
      return {
        optimizedPrompt: rawDescription,
        success: false,
        error: result.error ?? "LLM 调用失败",
      };
    }

    const optimized = result.data.text.trim();
    if (optimized.length < 20) {
      return {
        optimizedPrompt: rawDescription,
        success: false,
        error: "优化结果过短",
      };
    }

    return {
      optimizedPrompt: optimized,
      success: true,
    };
  } catch (e) {
    errorLogger.warn("[prompt-optimizer] 视频提示词优化失败", e);
    return {
      optimizedPrompt: rawDescription,
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * 通用提示词优化
 *
 * 适用于任意场景的提示词增强，不限定角色/视频/场景。
 */
export async function optimizePrompt(
  rawDescription: string,
  options?: {
    style?: string;
    target?: "image" | "video";
    providerId?: string;
    modelId?: string;
  },
): Promise<OptimizedPromptResult> {
  const target = options?.target ?? "image";
  const style = options?.style ?? "cinematic";

  if (target === "video") {
    return optimizeVideoPrompt(rawDescription, style, {
      providerId: options?.providerId,
      modelId: options?.modelId,
    });
  }

  return optimizeCharacterPrompt(rawDescription, style, {
    providerId: options?.providerId,
    modelId: options?.modelId,
  });
}

/** 获取支持的角色风格列表 */
export function getCharacterStyles(): Array<{ value: string; label: string }> {
  return [
    { value: "anime", label: "动漫" },
    { value: "realistic", label: "写实" },
    { value: "3d", label: "3D 渲染" },
    { value: "cyberpunk", label: "赛博朋克" },
    { value: "chibi", label: "Q版" },
    { value: "watercolor", label: "水彩" },
    { value: "sketch", label: "素描" },
    { value: "pixel", label: "像素" },
  ];
}

/** 获取支持的视频风格列表 */
export function getVideoStyles(): Array<{ value: string; label: string }> {
  return [
    { value: "cinematic", label: "电影级" },
    { value: "anime", label: "动漫" },
    { value: "realistic", label: "写实" },
    { value: "cyberpunk", label: "赛博朋克" },
    { value: "fantasy", label: "奇幻" },
    { value: "wuxia", label: "仙侠" },
    { value: "scifi", label: "科幻" },
    { value: "vintage", label: "复古" },
  ];
}
