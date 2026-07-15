/**
 * 反空泛词汇过滤器（Task 1.4 v5.3 增强）
 *
 * 借鉴 seedance-2.0（MIT 许可）的 seedance-antislop SKILL 模式。
 *
 * 核心原则：空泛质量词（masterpiece/best quality/4k/8k）对 AI 视频生成无实际意义，
 * 反而占用 token 预算。过滤并替换为具体视觉描述，提升 prompt 有效性。
 *
 * 替换策略：
 * - "masterpiece" → 删除（空泛，无视觉信息）
 * - "best quality" → 删除
 * - "4k/8k" → "高分辨率"（保留分辨率意图，但更通用）
 * - "highly detailed" → "细节丰富"（中文等价物）
 * - "professional" → "专业级构图"（具体化）
 *
 * 本文件属于 shared-logic 层，零外部依赖。
 */

export interface AntislopReplacement {
  original: string;
  replacement: string;
  reason: string;
}

export interface AntislopResult {
  filtered: string;
  replacements: AntislopReplacement[];
}

// === 空泛词汇表 → 替换规则 ===
// replacement 为空字符串表示直接删除
const SLOP_TABLE: Array<{ slop: string; replacement: string; reason: string }> = [
  // 空泛质量词（直接删除）
  { slop: "masterpiece", replacement: "", reason: "空泛质量词，无视觉信息" },
  { slop: "best quality", replacement: "", reason: "空泛质量词，无视觉信息" },
  { slop: "top quality", replacement: "", reason: "空泛质量词，无视觉信息" },
  { slop: "high quality", replacement: "", reason: "空泛质量词，无视觉信息" },
  { slop: "ultra quality", replacement: "", reason: "空泛质量词，无视觉信息" },
  { slop: "award winning", replacement: "", reason: "空泛质量词，无视觉信息" },
  { slop: "trending on artstation", replacement: "", reason: "平台引流词，无视觉信息" },
  { slop: "professional", replacement: "专业级构图", reason: "具体化为构图描述" },
  { slop: "professional grade", replacement: "专业级构图", reason: "具体化为构图描述" },
  // 分辨率词（通用化）
  { slop: "4k", replacement: "高分辨率", reason: "通用化分辨率描述" },
  { slop: "8k", replacement: "高分辨率", reason: "通用化分辨率描述" },
  { slop: "uhd", replacement: "高分辨率", reason: "通用化分辨率描述" },
  { slop: "hdr", replacement: "高动态范围", reason: "具体化动态范围描述" },
  // 细节词（中文等价）
  { slop: "highly detailed", replacement: "细节丰富", reason: "替换为中文等价物" },
  { slop: "extremely detailed", replacement: "细节丰富", reason: "替换为中文等价物" },
  { slop: "intricate details", replacement: "细节丰富", reason: "替换为中文等价物" },
  { slop: "sharp focus", replacement: "焦点清晰", reason: "替换为中文等价物" },
  { slop: "ultra detailed", replacement: "细节丰富", reason: "替换为中文等价物" },
  // 质量修饰词（直接删除）
  { slop: "amazing", replacement: "", reason: "空泛形容词，无视觉信息" },
  { slop: "stunning", replacement: "", reason: "空泛形容词，无视觉信息" },
  { slop: "beautiful", replacement: "", reason: "空泛形容词，无视觉信息" },
  { slop: "gorgeous", replacement: "", reason: "空泛形容词，无视觉信息" },
  { slop: "fantastic", replacement: "", reason: "空泛形容词，无视觉信息" },
  { slop: "incredible", replacement: "", reason: "空泛形容词，无视觉信息" },
  { slop: "epic", replacement: "史诗级构图", reason: "具体化为构图描述" },
];

/**
 * 过滤 prompt 中的空泛词汇，替换为具体视觉描述。
 *
 * @param input 用户原始 prompt
 * @returns 过滤结果，包含过滤后文本和所有替换记录
 */
export function filterAntislop(input: string): AntislopResult {
  const replacements: AntislopReplacement[] = [];
  let result = input;

  // 大小写不敏感匹配，但保留原文记录
  const lowerInput = input.toLowerCase();

  for (const { slop, replacement, reason } of SLOP_TABLE) {
    const lowerSlop = slop.toLowerCase();
    if (lowerInput.includes(lowerSlop)) {
      // 记录替换
      replacements.push({
        original: slop,
        replacement,
        reason,
      });
      // 大小写不敏感替换：用正则匹配原 slop 的所有大小写变体
      const escapedSlop = escapeRegExp(slop);
      const regex = new RegExp(escapedSlop, "gi");
      result = result.replace(regex, replacement);
    }
  }

  // 清理多余的逗号和空格（删除空替换后可能留下）
  result = cleanupPunctuation(result);

  return { filtered: result, replacements };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanupPunctuation(text: string): string {
  return text
    // 清理连续逗号：",," → ","
    .replace(/,{2,}/g, ",")
    // 清理逗号前后多余空格：" , " → ", "
    .replace(/\s*,\s*/g, ", ")
    // 清理行首逗号
    .replace(/^,\s*/, "")
    // 清理行尾逗号
    .replace(/,\s*$/, "")
    // 清理多个连续空格
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * 判断 prompt 是否含空泛词汇（用于 UI 提示）。
 */
export function hasSlop(input: string): boolean {
  const lower = input.toLowerCase();
  return SLOP_TABLE.some(({ slop }) => lower.includes(slop.toLowerCase()));
}

/**
 * 列出所有已注册的空泛词汇（用于 UI 展示和教育用户）。
 */
export function listSlopVocabulary(): Array<{ slop: string; replacement: string; reason: string }> {
  return SLOP_TABLE.map(({ slop, replacement, reason }) => ({
    slop,
    replacement,
    reason,
  }));
}
