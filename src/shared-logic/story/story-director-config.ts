/**
 * 故事导演配置推荐（P3.3：自动故事结构 + 角色弧线分析）。
 *
 * 基于故事结构分析（叙事 beats：type / emotionIntensity / position），
 * 自动推荐导演规则配置：高潮段落自动启用 climaxIntensifyRule、
 * 抒情段落启用 lyricalWideRule、快速节奏启用 fastPacingRule，
 * 连续性规则（180 度 / 动作匹配）默认全局启用。
 *
 * 设计约束（shared-logic 层）：
 * - 纯函数，零副作用，零外部依赖（仅相对导入同层 director 的类型）
 * - 输入为结构子类型（type/emotionIntensity/position），不依赖 modules 层类型
 * - 输出可直接消费：context 喂给 applyDirectorRules / director-guidance，
 *   skipRules 用于按 beat 裁剪默认规则
 */

import type { DirectorContext, NarrativeBeatType } from "../director";

export type DirectorPacing = "slow" | "normal" | "fast";

export interface DirectorConfigBeatInput {
  type: NarrativeBeatType;
  emotionIntensity: number;
  position: number;
}

export interface BeatDirectorConfig {
  type: NarrativeBeatType;
  emotionIntensity: number;
  position: number;
  /** 该 beat 的导演上下文（可直接用于 applyDirectorRules / director-guidance） */
  context: Pick<DirectorContext, "beatType" | "emotionIntensity" | "pacing">;
  /** 自动推荐的启用规则名（如高潮 beat → climax_intensify） */
  enabledRules: string[];
  /** 该 beat 应跳过的规则名（默认规则中未启用的情绪类规则） */
  skipRules: string[];
}

export interface DirectorConfigOutput {
  /** 全局节奏建议 */
  pacing: DirectorPacing;
  /** 每个 beat 的导演建议（保持输入顺序） */
  beats: BeatDirectorConfig[];
  /** 默认全局启用的规则名（连续性规则，不随 beat 变化） */
  globalEnabledRules: string[];
}

/** 情绪类规则（按 beat 类型/情绪动态启用） */
export const EMOTION_RULES = [
  "climax_intensify",
  "lyrical_wide",
  "fast_pacing",
] as const;

/** 连续性规则（全局默认启用） */
export const CONTINUITY_RULES = [
  "one_eighty_degree_rule",
  "action_match_cut",
] as const;

/**
 * 根据各 beat 的平均情绪强度推断整体节奏（与 narrative-beats.inferOverallPacing 同规则）。
 */
export function inferPacing(beats: DirectorConfigBeatInput[]): DirectorPacing {
  if (beats.length === 0) return "normal";
  const avgIntensity = beats.reduce((sum, b) => sum + b.emotionIntensity, 0) / beats.length;
  if (avgIntensity < 0.4) return "slow";
  if (avgIntensity > 0.6) return "fast";
  return "normal";
}

/**
 * 为单个 beat 推荐启用的情绪类规则名。
 */
export function recommendEmotionRules(
  beat: DirectorConfigBeatInput,
  pacing: DirectorPacing,
): string[] {
  const enabled: string[] = [];
  // 高潮强化：高潮 beat 或高情绪强度
  if (beat.type === "climax" || beat.emotionIntensity > 0.75) {
    enabled.push("climax_intensify");
  }
  // 抒情远景：低情绪且非开端
  if (beat.emotionIntensity < 0.3 && beat.type !== "setup") {
    enabled.push("lyrical_wide");
  }
  // 快速节奏：全局 fast + 情绪中等以上
  if (pacing === "fast" && beat.emotionIntensity > 0.5) {
    enabled.push("fast_pacing");
  }
  return enabled;
}

/**
 * 自动生成导演规则配置。
 *
 * @param beats 故事结构分析的叙事节点（type/emotionIntensity/position）
 * @returns 全局节奏 + 每 beat 的导演上下文与规则推荐
 */
export function buildDirectorConfig(beats: DirectorConfigBeatInput[]): DirectorConfigOutput {
  const pacing = inferPacing(beats);

  const beatConfigs: BeatDirectorConfig[] = beats.map((beat) => {
    const enabledRules = recommendEmotionRules(beat, pacing);
    const skipRules = EMOTION_RULES.filter((rule) => !enabledRules.includes(rule));
    return {
      type: beat.type,
      emotionIntensity: beat.emotionIntensity,
      position: beat.position,
      context: {
        beatType: beat.type,
        emotionIntensity: beat.emotionIntensity,
        pacing,
      },
      enabledRules,
      skipRules,
    };
  });

  return {
    pacing,
    beats: beatConfigs,
    globalEnabledRules: [...CONTINUITY_RULES],
  };
}
