/**
 * Task 2A.23: 分镜连续性策略
 *
 * Kimi 对话尾部建议的三种分镜类型策略：
 * - continuous_action：连续动作（同场景同角色），强尾帧约束 + preferExtend
 * - angle_switch：同场景换角度，弱尾帧约束 + 作为场景参考
 * - scene_transition：转场新场景，无尾帧约束 + 仅场景参考
 *
 * 策略影响：
 * 1. 生成时的尾帧使用方式（strong/weak/none）
 * 2. prompt 中的连续性约束指令
 * 3. QC 时的相似度阈值（连续动作更严格）
 *
 * 纯类型 + 工厂函数 + 描述函数 — 无外部依赖，可单元测试。
 */

/** 分镜策略类型 */
export type ShotStrategyType = "continuous_action" | "angle_switch" | "scene_transition";

/** 尾帧使用强度 */
export type LastFrameUsage = "strong" | "weak" | "none";

/** 分镜策略 */
export interface ShotStrategy {
  type: ShotStrategyType;
  /** 尾帧使用强度 */
  useLastFrame: LastFrameUsage;
  /** 是否优先 extend 续写（仅 continuous_action） */
  preferExtend?: boolean;
  /** 是否作为场景参考（仅 angle_switch） */
  asSceneReference?: boolean;
  /** 是否仅用场景参考（仅 scene_transition） */
  sceneRefOnly?: boolean;
}

/**
 * 从 StoryBeat.shotType / shotInstruction 推断策略。
 *
 * 推断规则（保守默认）：
 * - shotType 为 closeup/extreme_close → continuous_action（特写通常是连续动作）
 * - shotType 为 wide/extreme_wide → scene_transition（远景通常是场景建立镜头）
 * - 其他 → angle_switch（默认）
 *
 * 注意：这是保守推断，用户可手动覆盖。
 */
export function inferStrategyFromShotType(shotType?: string): ShotStrategy {
  if (!shotType) {
    return { type: "angle_switch", useLastFrame: "weak", asSceneReference: true };
  }

  const normalized = shotType.toLowerCase();
  // 特写/近景 → 连续动作
  if (normalized.includes("close") || normalized === "medium") {
    return {
      type: "continuous_action",
      useLastFrame: "strong",
      preferExtend: true,
    };
  }

  // 远景/全景 → 场景转场
  if (normalized.includes("wide") || normalized.includes("birdseye") || normalized.includes("wormseye")) {
    return {
      type: "scene_transition",
      useLastFrame: "none",
      sceneRefOnly: true,
    };
  }

  // 其他（low/high 等 angle） → 换角度
  return {
    type: "angle_switch",
    useLastFrame: "weak",
    asSceneReference: true,
  };
}

/**
 * 按显式类型创建策略。
 */
export function createStrategy(type: ShotStrategyType): ShotStrategy {
  switch (type) {
    case "continuous_action":
      return { type, useLastFrame: "strong", preferExtend: true };
    case "angle_switch":
      return { type, useLastFrame: "weak", asSceneReference: true };
    case "scene_transition":
      return { type, useLastFrame: "none", sceneRefOnly: true };
  }
}

/**
 * 人类可读的策略描述（用于 UI 展示）。
 */
export function describeStrategy(strategy: ShotStrategy): string {
  switch (strategy.type) {
    case "continuous_action":
      return "连续动作（强尾帧约束 + 优先 extend 续写）";
    case "angle_switch":
      return "换角度（弱尾帧约束 + 场景参考）";
    case "scene_transition":
      return "场景转场（无尾帧约束 + 仅场景参考）";
  }
}

/**
 * 策略对应的 QC 阈值调整系数。
 *
 * - continuous_action：阈值更严格（×1.1），因为连续动作要求高一致性
 * - angle_switch：默认阈值（×1.0）
 * - scene_transition：阈值更宽松（×0.9），因为场景变化本身合理
 */
export function getStrategyThresholdMultiplier(strategy: ShotStrategy): number {
  switch (strategy.type) {
    case "continuous_action":
      return 1.1;
    case "angle_switch":
      return 1.0;
    case "scene_transition":
      return 0.9;
  }
}

/**
 * 判断策略是否需要尾帧约束。
 */
export function usesLastFrame(strategy: ShotStrategy): boolean {
  return strategy.useLastFrame !== "none";
}

/**
 * 判断策略是否是连续动作（需要最强一致性约束）。
 */
export function isContinuousAction(strategy: ShotStrategy): boolean {
  return strategy.type === "continuous_action";
}
