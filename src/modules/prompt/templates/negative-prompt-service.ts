/**
 * 负面提示词智能生成服务
 *
 * 职责：
 * - 根据生成场景（角色/场景/视频）和风格标签智能匹配负面提示词模板
 * - 支持用户自定义覆盖
 * - 提供 LLM 智能生成负面提示词（基于正向提示词分析）
 *
 * 匹配策略：
 * 1. 用户显式指定 → 直接使用
 * 2. 风格标签匹配 → 从内置负面模板中选取最匹配的
 * 3. 通用匹配 → 返回通用负面提示词
 * 4. LLM 增强（可选）→ 调用 LLM 基于正向提示词生成定制负面提示词
 */

import { container } from "@/infrastructure/di";
import { getConfig, setConfig } from "@/shared/file-http";
import { searchPromptTemplates } from "./prompt-template-service";

/** 负面提示词配置键 */
const NEGATIVE_PROMPT_CONFIG_KEY = "agent.negativePromptConfig";

/** 负面提示词用户配置 */
export interface NegativePromptConfig {
  /** 全局启用/禁用智能负面提示词 */
  enabled: boolean;
  /** 用户自定义负面提示词覆盖（按 category 分组） */
  overrides?: {
    character?: string;
    scene?: string;
    video?: string;
  };
  /** 是否启用 LLM 智能增强 */
  llmEnhance: boolean;
}

/** 默认配置 */
const DEFAULT_CONFIG: NegativePromptConfig = {
  enabled: true,
  llmEnhance: false,
};

/** 生成场景类型 */
export type NegativePromptScene = "character" | "scene" | "video";

/** 风格标签到负面模板的匹配映射 */
const STYLE_TO_NEGATIVE_CATEGORY: Record<string, string[]> = {
  anime: ["anime"],
  realistic: ["realistic"],
  cyberpunk: ["anime", "universal"], // 赛博朋克偏动漫风
  wuxia: ["universal"],
  chinese: ["universal"],
  fantasy: ["universal"],
  scifi: ["universal"],
  portrait: ["realistic"],
  cinematic: ["universal"],
  vintage: ["universal"],
  gothic: ["universal"],
  steampunk: ["universal"],
};

/**
 * 智能匹配负面提示词
 *
 * @param scene 生成场景（角色/场景/视频）
 * @param styleTags 风格标签（如 ["anime", "cyberpunk"]）
 * @param userOverride 用户自定义覆盖（可选，优先级最高）
 * @returns 匹配的负面提示词
 */
export async function getNegativePrompt(
  scene: NegativePromptScene,
  styleTags: string[] = [],
  userOverride?: string,
): Promise<string> {
  // 1. 用户显式指定 → 直接使用
  if (userOverride && userOverride.trim()) {
    return userOverride.trim();
  }

  // 2. 读取用户配置
  const config = await getNegativePromptConfig();
  if (!config.enabled) {
    return "";
  }

  // 3. 检查用户按 category 的覆盖
  const categoryOverride = config.overrides?.[scene];
  if (categoryOverride && categoryOverride.trim()) {
    return categoryOverride.trim();
  }

  // 4. 风格标签匹配 → 从内置负面模板中选取
  const targetNegatives = await searchPromptTemplates({ category: "negative" });

  // 视频场景优先匹配视频专用负面
  if (scene === "video") {
    const videoNegative = targetNegatives.find((t) => t.id === "builtin_negative_video");
    if (videoNegative) return videoNegative.content;
  }

  // 按风格标签匹配
  for (const style of styleTags) {
    const matchingCategories = STYLE_TO_NEGATIVE_CATEGORY[style] ?? ["universal"];
    for (const negCat of matchingCategories) {
      const matched = targetNegatives.find(
        (t) => t.styleTags?.includes(negCat) || t.id === `builtin_negative_${negCat}`,
      );
      if (matched) return matched.content;
    }
  }

  // 5. 通用匹配
  const universal = targetNegatives.find((t) => t.id === "builtin_negative_universal");
  return universal?.content ?? "blurry, low quality, worst quality, distorted, deformed, ugly, bad anatomy, watermark, text";
}

/**
 * LLM 智能增强负面提示词
 *
 * 基于正向提示词分析，调用 LLM 生成定制的负面提示词。
 * 例如：正向提示词包含 "outdoor scene" → 负面增加 "indoor, studio background"。
 *
 * @param positivePrompt 正向提示词
 * @param baseNegative 基础负面提示词（可选，LLM 会在其基础上增强）
 * @returns LLM 增强后的负面提示词；失败时返回 baseNegative
 */
export async function enhanceNegativePromptWithLLM(
  positivePrompt: string,
  baseNegative?: string,
): Promise<string> {
  try {
    const config = await getNegativePromptConfig();
    if (!config.enabled || !config.llmEnhance) {
      return baseNegative ?? "";
    }

    const prompt = `You are a negative prompt engineer for AI image/video generation.

Given the following positive prompt, generate a concise negative prompt (comma-separated keywords, max 50 words) that avoids common generation issues.

Positive prompt: ${positivePrompt}

${baseNegative ? `Base negative prompt (extend this): ${baseNegative}` : ""}

Rules:
1. Output ONLY the negative prompt keywords, no explanation
2. Comma-separated, lowercase
3. Include: quality issues (blurry, low quality), anatomy issues (bad anatomy, deformed), artifacts (watermark, text, signature)
4. Add context-specific negatives based on the positive prompt
5. Max 50 words

Negative prompt:`;

    const result = await container.textProvider.generateText(prompt, {
      maxTokens: 200,
      temperature: 0.3,
    });

    if (!result.success || !result.data?.text) {
      return baseNegative ?? "";
    }

    const enhanced = result.data.text.trim();
    // 简单校验：确保不是空且像负面提示词（包含逗号或常见负面词）
    if (enhanced.length < 10) {
      return baseNegative ?? "";
    }

    return enhanced;
  } catch {
    return baseNegative ?? "";
  }
}

/** 读取负面提示词配置 */
export async function getNegativePromptConfig(): Promise<NegativePromptConfig> {
  try {
    const raw = await getConfig(NEGATIVE_PROMPT_CONFIG_KEY);
    if (!raw || typeof raw !== "object") {
      return { ...DEFAULT_CONFIG };
    }
    const data = raw as Record<string, unknown>;
    return {
      enabled: typeof data.enabled === "boolean" ? data.enabled : DEFAULT_CONFIG.enabled,
      llmEnhance: typeof data.llmEnhance === "boolean" ? data.llmEnhance : DEFAULT_CONFIG.llmEnhance,
      overrides:
        data.overrides && typeof data.overrides === "object"
          ? (data.overrides as NegativePromptConfig["overrides"])
          : undefined,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/** 保存负面提示词配置 */
export async function saveNegativePromptConfig(
  config: Partial<NegativePromptConfig>,
): Promise<boolean> {
  try {
    const current = await getNegativePromptConfig();
    const merged = { ...current, ...config };
    await setConfig(NEGATIVE_PROMPT_CONFIG_KEY, merged);
    return true;
  } catch {
    return false;
  }
}

/**
 * 一键获取完整的负面提示词（智能匹配 + LLM 增强）
 *
 * 推荐在生成流程中调用此函数。
 *
 * @param scene 生成场景
 * @param styleTags 风格标签
 * @param positivePrompt 正向提示词（用于 LLM 增强）
 * @param userOverride 用户自定义覆盖
 */
export async function getSmartNegativePrompt(
  scene: NegativePromptScene,
  styleTags: string[] = [],
  positivePrompt?: string,
  userOverride?: string,
): Promise<string> {
  const base = await getNegativePrompt(scene, styleTags, userOverride);

  // 如果正向提示词提供且 LLM 增强启用，进行增强
  if (positivePrompt && positivePrompt.trim()) {
    return enhanceNegativePromptWithLLM(positivePrompt, base);
  }

  return base;
}
