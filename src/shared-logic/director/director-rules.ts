/**
 * 导演规则引擎（Director Rules Engine）。
 *
 * 在 AI 生成分镜契约之后，应用基于经典电影语法的规则修正，
 * 提升连续镜头的连贯性与情绪表现力。
 *
 * 设计约束：
 * - 纯函数，零副作用
 * - 零外部依赖（所有类型内联定义）
 * - 可扩展：新增规则只需实现 DirectorRule 并注册到 DEFAULT_RULES
 */

export type ShotSize =
  | "extreme_close_up"
  | "close_up"
  | "medium"
  | "wide"
  | "extreme_wide";

export type ShotMovement =
  | "static"
  | "pan"
  | "tilt"
  | "tracking"
  | "dolly"
  | "handheld";

export type ShotLighting =
  | "natural"
  | "low_key"
  | "high_key"
  | "golden_hour"
  | "neon";

export type NarrativeBeatType =
  | "setup"
  | "inciting_incident"
  | "rising_action"
  | "midpoint"
  | "climax"
  | "falling_action"
  | "resolution";

export interface DirectorShotContract {
  shotSize: ShotSize;
  lens?: string;
  movement: ShotMovement;
  lighting: ShotLighting;
  duration: number;
  blocking: string;
  /** 该镜头中主要角色的屏幕侧（"left" | "right"），用于 180 度规则 */
  subjectScreenSide?: "left" | "right";
  /** 该镜头中的动作方向（"left_to_right" | "right_to_left"），用于动作匹配 */
  actionDirection?: "left_to_right" | "right_to_left";
}

export interface DirectorContext {
  beatType: NarrativeBeatType;
  emotionIntensity: number;
  /** 同一场景中的前一个 shot */
  previousShot?: DirectorShotContract;
  /** 同一场景中的后一个 shot */
  nextShot?: DirectorShotContract;
  /** 故事整体 tone */
  tone?: string;
  /** 整体节奏 */
  pacing?: "slow" | "normal" | "fast";
}

export interface DirectorRule {
  name: string;
  description: string;
  /**
   * 规则适用条件。
   *
   * @returns true 表示执行 action
   */
  condition: (shot: DirectorShotContract, ctx: DirectorContext) => boolean;
  /**
   * 规则动作。返回修改后的 shot；可直接 mutate 并返回原对象。
   */
  action: (shot: DirectorShotContract, ctx: DirectorContext) => DirectorShotContract;
}

/** 高潮强化：更多 close_up、更快节奏、更动感的运镜 */
const climaxIntensifyRule: DirectorRule = {
  name: "climax_intensify",
  description: "高潮 beat 强化特写与动感",
  condition: (_shot, ctx) => ctx.beatType === "climax" || ctx.emotionIntensity > 0.75,
  action: (shot, ctx) => {
    if (shot.shotSize !== "extreme_close_up") {
      shot.shotSize = "close_up";
    }
    if (shot.movement === "static") {
      shot.movement = ctx.emotionIntensity > 0.85 ? "handheld" : "tracking";
    }
    shot.duration = Math.max(2, Math.min(shot.duration, 4));
    return shot;
  },
};

/** 抒情段落：远景 + 固定机位 + 较长时长 */
const lyricalWideRule: DirectorRule = {
  name: "lyrical_wide",
  description: "低情绪 beat 使用远景与稳定长镜头",
  condition: (_shot, ctx) => ctx.emotionIntensity < 0.3 && ctx.beatType !== "setup",
  action: (shot) => {
    if (shot.shotSize === "close_up" || shot.shotSize === "extreme_close_up") {
      shot.shotSize = "extreme_wide";
    }
    shot.movement = "static";
    shot.duration = Math.min(8, Math.max(shot.duration, 5));
    return shot;
  },
};

/** 180 度规则：保持对话/交互双方在同一屏幕侧 */
const oneEightyDegreeRule: DirectorRule = {
  name: "one_eighty_degree_rule",
  description: "保持角色屏幕侧一致性，避免越轴",
  condition: (_shot, ctx) => !!ctx.previousShot && !!ctx.previousShot.subjectScreenSide,
  action: (shot, ctx) => {
    const prev = ctx.previousShot!;
    if (prev.subjectScreenSide && !shot.subjectScreenSide) {
      // 默认延续上一镜头的屏幕侧
      shot.subjectScreenSide = prev.subjectScreenSide;
    }
    return shot;
  },
};

/** 动作匹配：相邻镜头动作方向保持一致 */
const actionMatchCutRule: DirectorRule = {
  name: "action_match_cut",
  description: "相邻动作镜头保持方向一致",
  condition: (shot, ctx) =>
    !!ctx.previousShot &&
    !!ctx.previousShot.actionDirection &&
    !shot.actionDirection,
  action: (shot, ctx) => {
    shot.actionDirection = ctx.previousShot!.actionDirection;
    return shot;
  },
};

/** 快速节奏：压缩时长、增加 tracking */
const fastPacingRule: DirectorRule = {
  name: "fast_pacing",
  description: "快速节奏下缩短时长并使用跟随镜头",
  condition: (_shot, ctx) => ctx.pacing === "fast" && ctx.emotionIntensity > 0.5,
  action: (shot) => {
    shot.duration = Math.max(2, Math.round(shot.duration * 0.85));
    if (shot.movement === "static") {
      shot.movement = "tracking";
    }
    return shot;
  },
};

/**
 * 默认规则集。
 *
 * 按顺序应用；后面的规则可以覆盖前面的结果。
 */
export const DEFAULT_DIRECTOR_RULES: DirectorRule[] = [
  climaxIntensifyRule,
  lyricalWideRule,
  fastPacingRule,
  oneEightyDegreeRule,
  actionMatchCutRule,
];

export interface DirectorRulesOptions {
  /** 自定义规则，覆盖默认规则 */
  rules?: DirectorRule[];
  /** 要跳过的规则名 */
  skipRules?: string[];
}

/**
 * 对一组 shot contracts 应用导演规则。
 *
 * @param shots shot contract 数组（会被 mutate）
 * @param ctx 导演上下文
 * @param opts 选项
 * @returns 应用规则后的 shot contract 数组（同一引用）
 */
export function applyDirectorRules(
  shots: DirectorShotContract[],
  ctx: Omit<DirectorContext, "previousShot" | "nextShot">,
  opts: DirectorRulesOptions = {},
): DirectorShotContract[] {
  const rules = opts.rules ?? DEFAULT_DIRECTOR_RULES;
  const skipSet = new Set(opts.skipRules ?? []);

  for (let i = 0; i < shots.length; i++) {
    const previousShot = i > 0 ? shots[i - 1] : undefined;
    const nextShot = i < shots.length - 1 ? shots[i + 1] : undefined;
    const fullCtx: DirectorContext = { ...ctx, previousShot, nextShot };

    for (const rule of rules) {
      if (skipSet.has(rule.name)) continue;
      if (rule.condition(shots[i]!, fullCtx)) {
        shots[i] = rule.action(shots[i]!, fullCtx);
      }
    }
  }

  return shots;
}

/**
 * 判断两个 shot 是否可能发生越轴。
 *
 * 辅助函数，用于 UI 高亮或进一步修正。
 */
export function isCrossingAxis(
  prev: DirectorShotContract,
  curr: DirectorShotContract,
): boolean {
  if (!prev.subjectScreenSide || !curr.subjectScreenSide) return false;
  return prev.subjectScreenSide !== curr.subjectScreenSide;
}
