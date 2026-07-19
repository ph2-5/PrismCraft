/**
 * Task 2A.22: prompt-builder — 局部重绘 prompt 模板
 *
 * 把用户的简短重绘指令（如"把背景的树换成霓虹灯广告牌"）扩展为完整的
 * 局部重绘 prompt，自动加上"保持背景/运动/光照不变"等约束指令。
 *
 * 设计要点：
 * - 纯函数，无副作用 — 可单元测试
 * - 支持中英文双语（按用户 prompt 自动检测语言）
 * - 可配置约束级别（strict / loose）
 * - preserveUnmasked=true 时强制加入"保持 mask 外不变"指令
 *
 * 输出格式（示例）：
 *   "保持画面运动、光照、色彩不变，仅修改 mask 标记的区域内的内容：[用户指令]。
 *    保留 mask 外所有像素不变。"
 */

/** prompt 约束级别 */
export type PromptStrictness = "strict" | "loose";

/** prompt-builder 选项 */
export interface PromptBuilderOptions {
  /** 约束级别（默认 strict） */
  strictness?: PromptStrictness;
  /** 是否保持 mask 外不变（默认 true） */
  preserveUnmasked?: boolean;
  /** 视频时长（秒，可选） — 用于提醒模型保持节奏 */
  duration?: number;
  /** 强制指定语言（默认自动检测） */
  language?: "zh" | "en";
}

/** 检测文本语言（简陋实现：含中文字符视为中文，否则英文） */
export function detectLanguage(text: string): "zh" | "en" {
  if (!text) return "zh";
  // 中文字符 Unicode 范围：\u4e00-\u9fff
  const chineseChars = text.match(/[\u4e00-\u9fff]/g);
  if (chineseChars && chineseChars.length >= 1) return "zh";
  return "en";
}

/** strict 级别的中文约束前缀 */
const ZH_STRICT_PREFIX = "请严格保持画面运动轨迹、光照方向、色彩风格、构图比例不变，仅修改 mask 标记的区域内的内容：";

/** strict 级别的英文约束前缀 */
const EN_STRICT_PREFIX = "Strictly preserve the motion trajectory, lighting direction, color style, and composition ratio. Only modify the content within the mask region: ";

/** loose 级别的中文约束前缀 */
const ZH_LOOSE_PREFIX = "在保持整体画面一致性的前提下，修改 mask 标记的区域内的内容：";

/** loose 级别的英文约束前缀 */
const EN_LOOSE_PREFIX = "While maintaining overall visual consistency, modify the content within the mask region: ";

/** preserveUnmasked 的中文后缀 */
const ZH_PRESERVE_SUFFIX = "。保留 mask 外所有像素完全不变，仅重绘 mask 内的区域。";

/** preserveUnmasked 的英文后缀 */
const EN_PRESERVE_SUFFIX = ". Preserve all pixels outside the mask completely unchanged; only repaint the area inside the mask.";

/** duration 提示（中文） */
const ZH_DURATION_HINT = (sec: number) => ` 视频时长约 ${sec} 秒，保持原节奏。`;

/** duration 提示（英文） */
const EN_DURATION_HINT = (sec: number) => ` The video is approximately ${sec} seconds long; maintain the original pacing.`;

/** 空指令检查 */
export function isEmptyPrompt(prompt: string): boolean {
  return !prompt || prompt.trim().length === 0;
}

/** prompt 长度检查（Seedance 2.5 限制 2000 字符） */
export function isPromptTooLong(prompt: string, maxLength: number = 2000): boolean {
  return prompt.length > maxLength;
}

/** 截断 prompt（按字符数，避免破坏 UTF-8 多字节字符） */
export function truncatePrompt(prompt: string, maxLength: number = 2000): string {
  if (prompt.length <= maxLength) return prompt;
  // 按 maxLength 截断，但避免截断多字节字符
  // 使用 Array.from 处理 Unicode 码点
  const chars = Array.from(prompt);
  if (chars.length <= maxLength) return prompt;
  return chars.slice(0, maxLength).join("");
}

/**
 * 构建完整的局部重绘 prompt。
 *
 * @param userPrompt 用户的重绘指令（如"把背景的树换成霓虹灯广告牌"）
 * @param options 选项（约束级别、preserveUnmasked、duration、language）
 * @returns 完整的 prompt 字符串
 */
export function buildPartialEditPrompt(
  userPrompt: string,
  options: PromptBuilderOptions = {},
): string {
  if (isEmptyPrompt(userPrompt)) {
    throw new Error("PARTIAL_EDIT_PROMPT_EMPTY");
  }

  const strictness = options.strictness ?? "strict";
  const preserveUnmasked = options.preserveUnmasked ?? true;
  const duration = options.duration;
  const language = options.language ?? detectLanguage(userPrompt);

  // 1. 前缀（约束级别）
  const prefix =
    strictness === "strict"
      ? (language === "zh" ? ZH_STRICT_PREFIX : EN_STRICT_PREFIX)
      : (language === "zh" ? ZH_LOOSE_PREFIX : EN_LOOSE_PREFIX);

  // 2. 用户指令
  const userPart = userPrompt.trim();

  // 3. 后缀（preserveUnmasked）
  const suffix = preserveUnmasked
    ? (language === "zh" ? ZH_PRESERVE_SUFFIX : EN_PRESERVE_SUFFIX)
    : "";

  // 4. duration 提示
  const durationHint = duration && duration > 0
    ? (language === "zh" ? ZH_DURATION_HINT(duration) : EN_DURATION_HINT(duration))
    : "";

  // 5. 拼接（前缀 + 用户指令 + 后缀 + duration）
  const fullPrompt = `${prefix}${userPart}${suffix}${durationHint}`;

  // 6. 截断（避免超过 API 限制）
  return truncatePrompt(fullPrompt);
}

/**
 * 构建局部重绘 prompt 的简化版本（不带约束前缀）。
 * 用于 UI 预览或调试。
 */
export function buildSimplePrompt(
  userPrompt: string,
  options: { preserveUnmasked?: boolean; language?: "zh" | "en" } = {},
): string {
  if (isEmptyPrompt(userPrompt)) {
    throw new Error("SIMPLE_PROMPT_EMPTY");
  }
  const preserveUnmasked = options.preserveUnmasked ?? true;
  const language = options.language ?? detectLanguage(userPrompt);
  const suffix = preserveUnmasked
    ? (language === "zh" ? ZH_PRESERVE_SUFFIX : EN_PRESERVE_SUFFIX)
    : "";
  return `${userPrompt.trim()}${suffix}`;
}

/**
 * 检查 prompt 是否包含敏感关键词（如"裸体"、"暴力"等）。
 * 这是基础过滤，实际审核由 provider 完成。
 */
export function containsSensitiveContent(prompt: string): boolean {
  const sensitiveKeywords = [
    "裸体", "nude", "naked",
    "暴力", "violence", "gore",
    "色情", "porn", "erotic",
    "血腥", "blood", "bloody",
  ];
  const lowerPrompt = prompt.toLowerCase();
  return sensitiveKeywords.some((kw) => lowerPrompt.includes(kw.toLowerCase()));
}

/**
 * 估算 prompt 的 token 数（粗略估算）。
 * 中文字符约 1.5 token/字，英文约 0.25 token/字。
 */
export function estimateTokenCount(prompt: string): number {
  if (!prompt) return 0;
  const chineseChars = (prompt.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const otherChars = prompt.length - chineseChars;
  return Math.ceil(chineseChars * 1.5 + otherChars * 0.25);
}
