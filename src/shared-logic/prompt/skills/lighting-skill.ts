/**
 * Lighting Skill — 光照/氛围专项指令构建器（Task 4.7 v5.3 增强）
 *
 * 借鉴 seedance-2.0（MIT 许可）的 seedance-lighting SKILL 模式。
 *
 * 触发场景：用户消息含光照相关关键词（光线/灯光/氛围/暖光/冷光/霓虹等）。
 * 行为：构建光照专项指令片段，覆盖光照类型 + 氛围关键词映射。
 *
 * 本文件属于 shared-logic 层，零外部依赖。
 */

import type { AgentContext, Skill } from "./index";
import type { LightingType, LightingInstruction } from "./extended-types";

// === 光照类型描述表 ===
const LIGHTING_DESCRIPTIONS: Record<LightingType, string> = {
  natural: "自然光（日光/月光，柔和均匀，适合写实场景）",
  low_key: "低调光（暗调，强对比，营造神秘/压抑/戏剧氛围）",
  high_key: "高调光（亮调，弱对比，营造温馨/明亮/轻松氛围）",
  golden_hour: "黄金时刻（日出/日落前后，暖橙色，营造温暖/浪漫氛围）",
  neon: "霓虹光（彩色光污染，适合赛博朋克/夜店/未来场景）",
  mixed: "混合光（多种光源叠加，适合复杂室内场景）",
};

// === 氛围关键词 → 光照类型映射 ===
const MOOD_TO_LIGHTING: Record<string, LightingInstruction> = {
  温馨: { type: "golden_hour", moodKeyword: "温馨" },
  浪漫: { type: "golden_hour", moodKeyword: "浪漫" },
  神秘: { type: "low_key", moodKeyword: "神秘" },
  压抑: { type: "low_key", moodKeyword: "压抑" },
  戏剧: { type: "low_key", moodKeyword: "戏剧" },
  活力: { type: "high_key", moodKeyword: "活力" },
  明亮: { type: "high_key", moodKeyword: "明亮" },
  轻松: { type: "high_key", moodKeyword: "轻松" },
  赛博朋克: { type: "neon", moodKeyword: "赛博朋克" },
  未来: { type: "neon", moodKeyword: "未来" },
  夜店: { type: "neon", moodKeyword: "夜店" },
};

export const lightingSkill: Skill = {
  id: "lighting",
  matchers: [
    "光线",
    "灯光",
    "光照",
    "氛围",
    "暖光",
    "冷光",
    "霓虹",
    "自然光",
    "高调",
    "低调",
    "黄金时刻",
    "lighting",
    "light",
    "neon",
  ],

  buildInstructions(ctx: AgentContext): string {
    const recommended = detectMoodRecommendation(ctx.userMessage);

    return [
      "## 光照专项指令（Lighting Skill）",
      "",
      "本片段构建光照语言指令，覆盖光照类型 + 氛围关键词映射。",
      "",
      "### 光照类型（Lighting Type）",
      ...Object.entries(LIGHTING_DESCRIPTIONS).map(([k, v]) => `- ${k}：${v}`),
      "",
      "### 氛围关键词 → 光照类型映射",
      ...Object.entries(MOOD_TO_LIGHTING).map(
        ([mood, inst]) => `- ${mood} → ${inst.type}`,
      ),
      "",
      "### 构建规则",
      "- 光照类型与情绪匹配：温馨/浪漫→golden_hour；神秘/压抑→low_key；活力→high_key；赛博朋克→neon",
      "- 一个镜头只用 1 种主光照类型（mixed 除外）",
      "- 自然光场景可补充时间（如「自然光，黄昏」增强氛围）",
      "- 霓虹光需说明色彩（如「霓虹光，紫蓝色」）",
      "- 输出格式：「光照类型，[补充描述]」如「黄金时刻，暖橙色」",
      recommended
        ? `\n### 当前推荐\n根据用户消息检测到氛围关键词「${recommended.moodKeyword}」，推荐：\n- 光照：${LIGHTING_DESCRIPTIONS[recommended.type]}`
        : "",
    ].filter(Boolean).join("\n");
  },
};

function detectMoodRecommendation(message: string): LightingInstruction | null {
  for (const [mood, inst] of Object.entries(MOOD_TO_LIGHTING)) {
    if (message.includes(mood)) {
      return inst;
    }
  }
  return null;
}

// === 导出构建函数 ===

export function buildLightingInstruction(
  type: LightingType,
  supplement?: string,
): string {
  const base = LIGHTING_DESCRIPTIONS[type];
  return supplement ? `${base}，${supplement}` : base;
}

export function recommendLightingByMood(mood: string): LightingInstruction | null {
  return MOOD_TO_LIGHTING[mood] ?? null;
}
