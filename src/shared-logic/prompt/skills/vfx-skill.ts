/**
 * VFX Skill — 粒子/破坏/能量/天气特效指令构建器（Task 4.7 v5.3 增强）
 *
 * 借鉴 seedance-2.0（MIT 许可）的 seedance-vfx SKILL 模式。
 *
 * 触发场景：用户消息含特效相关关键词（特效/粒子/火焰/烟雾/魔法/爆炸/闪电/天气等）。
 * 行为：构建特效指令片段，覆盖 4 大类：粒子 / 破坏 / 能量 / 天气。
 *
 * 本文件属于 shared-logic 层，零外部依赖。
 */

import type { AgentContext, Skill } from "./index";
import type { VfxCategory, VfxParticle, VfxWeather } from "./extended-types";

// === 粒子特效描述表 ===
const PARTICLE_DESCRIPTIONS: Record<VfxParticle, string> = {
  fire: "火焰（橙红色粒子，向上飘动，伴随发光）",
  smoke: "烟雾（灰白色粒子，缓慢扩散，半透明）",
  magic: "魔法（蓝紫色粒子，环绕主体，发光闪烁）",
  snow: "雪（白色粒子，从上落下，缓慢飘动）",
  rain: "雨（透明粒子，从上落下，快速直线）",
};

// === 破坏特效描述表 ===
const DESTRUCTION_EFFECTS: Record<string, string> = {
  破碎: "破碎（物体裂成碎片飞溅，伴随粉尘）",
  爆炸: "爆炸（火球膨胀 + 冲击波 + 碎片四散）",
  崩塌: "崩塌（大块物体坠落，灰尘弥漫）",
};

// === 能量特效描述表 ===
const ENERGY_EFFECTS: Record<string, string> = {
  光束: "光束（直线发光，从源头射向目标）",
  闪电: "闪电（分叉电弧，瞬间闪烁，蓝白色）",
  能量场: "能量场（球形发光，环绕主体，脉动）",
};

// === 天气特效描述表 ===
const WEATHER_DESCRIPTIONS: Record<VfxWeather, string> = {
  sunny: "晴天（明亮日光，蓝天，强阴影）",
  cloudy: "阴天（柔和散射光，灰白天空，弱阴影）",
  rainy: "雨天（雨滴下落，湿润反光，灰暗色调）",
  snowy: "雪天（雪花飘落，白色覆盖，冷色调）",
  foggy: "雾天（能见度低，远景模糊，朦胧氛围）",
};

export const vfxSkill: Skill = {
  id: "vfx",
  matchers: [
    "特效",
    "粒子",
    "火焰",
    "烟雾",
    "魔法",
    "雪",
    "雨",
    "破碎",
    "爆炸",
    "崩塌",
    "光束",
    "闪电",
    "能量场",
    "天气",
    "晴",
    "阴",
    "雾",
    "vfx",
    "effect",
  ],

  buildInstructions(ctx: AgentContext): string {
    const detectedCategories = detectVfxCategories(ctx.userMessage);

    return [
      "## 特效专项指令（VFX Skill）",
      "",
      "本片段构建特效指令，覆盖 4 大类：粒子 / 破坏 / 能量 / 天气。",
      "",
      "### 粒子特效（Particle）",
      ...Object.entries(PARTICLE_DESCRIPTIONS).map(([k, v]) => `- ${k}：${v}`),
      "",
      "### 破坏特效（Destruction）",
      ...Object.entries(DESTRUCTION_EFFECTS).map(([k, v]) => `- ${k}：${v}`),
      "",
      "### 能量特效（Energy）",
      ...Object.entries(ENERGY_EFFECTS).map(([k, v]) => `- ${k}：${v}`),
      "",
      "### 天气特效（Weather）",
      ...Object.entries(WEATHER_DESCRIPTIONS).map(([k, v]) => `- ${k}：${v}`),
      "",
      "### 构建规则",
      "- 一个镜头最多 2 种特效（避免视觉混乱）",
      "- 粒子特效需说明密度（如「稀疏火焰」或「密集魔法粒子」）",
      "- 破坏特效需说明规模（如「小范围爆炸」或「大型崩塌」）",
      "- 天气特效与光照配合：雨天→低调光；晴天→高调光；雾天→柔光",
      "- 输出格式：「特效类型，[补充描述]」如「火焰，密集向上」",
      detectedCategories.length > 0
        ? `\n### 当前检测\n用户消息中检测到以下特效类别：\n${detectedCategories.map((c) => `- ${c}`).join("\n")}`
        : "",
    ].filter(Boolean).join("\n");
  },
};

function detectVfxCategories(message: string): VfxCategory[] {
  const categories: VfxCategory[] = [];

  // particle：中文关键词（火焰/烟雾/魔法/雪/雨）
  const particleZh = ["火焰", "烟雾", "魔法", "雪", "雨"];
  if (particleZh.some((k) => message.includes(k))) categories.push("particle");

  // destruction：中文关键词（破碎/爆炸/崩塌）
  const destructionZh = ["破碎", "爆炸", "崩塌"];
  if (destructionZh.some((k) => message.includes(k))) categories.push("destruction");

  // energy：中文关键词（光束/闪电/能量场）
  const energyZh = ["光束", "闪电", "能量场"];
  if (energyZh.some((k) => message.includes(k))) categories.push("energy");

  // weather：中文关键词（晴/阴/雨/雪/雾）+ 英文 key
  const weatherZh = ["晴", "阴", "雨", "雪", "雾"];
  if (weatherZh.some((k) => message.includes(k))) categories.push("weather");

  return categories;
}

// === 导出构建函数 ===

export function buildParticleEffect(particle: VfxParticle, density?: string): string {
  const base = PARTICLE_DESCRIPTIONS[particle];
  return density ? `${base}，${density}` : base;
}

export function buildDestructionEffect(effect: string, scale?: string): string {
  const base = DESTRUCTION_EFFECTS[effect];
  if (!base) return effect;
  return scale ? `${base}，${scale}` : base;
}

export function buildEnergyEffect(effect: string, intensity?: string): string {
  const base = ENERGY_EFFECTS[effect];
  if (!base) return effect;
  return intensity ? `${base}，${intensity}` : base;
}

export function buildWeatherEffect(weather: VfxWeather): string {
  return WEATHER_DESCRIPTIONS[weather];
}
