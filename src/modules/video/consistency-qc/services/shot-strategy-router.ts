/**
 * Task 2A.23: shot-strategy-router — 分镜策略路由
 *
 * 职责：
 *   1. routeStrategy(beat): 从 StoryBeat 推断或读取显式策略
 *   2. applyStrategyToPrompt(strategy, prompt): 把策略约束追加到 prompt
 *   3. getEffectiveThreshold(strategy, policy): 计算策略调整后的阈值
 *
 * INV-5: ShotStrategy 不改 prompt 语义
 *   - applyStrategyToPrompt 仅追加约束指令（如"保持与上一镜尾帧一致"）
 *   - 不修改用户原始 prompt 内容
 *
 * StoryBeat.shotType 已 @deprecated，推荐使用 shotInstruction.shotSize
 *   - routeStrategy 优先读取 shotInstruction.shotSize
 *   - fallback 到 beat.shotType（向后兼容）
 *   - 都缺失时使用默认策略 angle_switch
 */

import type { StoryBeat } from "@/domain/schemas";
import {
  inferStrategyFromShotType,
  createStrategy,
  getStrategyThresholdMultiplier,
  describeStrategy,
  type ShotStrategy,
  type ShotStrategyType,
} from "../domain/shot-strategy";
import type { DriftPolicy } from "../domain/drift-policy";

/** 用户显式指定的策略覆盖（用于 UI 手动切换） */
export interface StrategyOverride {
  type: ShotStrategyType;
  /** 是否锁定（防止 AI 推断覆盖） */
  locked?: boolean;
}

/**
 * 从 StoryBeat 路由出合适的分镜策略。
 *
 * 解析顺序：
 *   1. 显式覆盖（override 参数，UI 手动切换）
 *   2. beat.shotInstruction.shotSize（推荐字段）
 *   3. beat.shotType（deprecated，向后兼容）
 *   4. 默认 angle_switch
 *
 * @param beat StoryBeat 实例
 * @param override 用户显式指定的策略
 */
export function routeStrategy(
  beat: StoryBeat | undefined,
  override?: StrategyOverride,
): ShotStrategy {
  // 1. 显式覆盖优先
  if (override) {
    return createStrategy(override.type);
  }

  // 2. beat 缺失 → 默认 angle_switch
  if (!beat) {
    return createStrategy("angle_switch");
  }

  // 3. PR 3：仅读 shotInstruction.shotSize（依赖 migration v8 已迁移数据）
  const shotSize = beat.shotInstruction?.shotSize;
  if (shotSize) {
    return inferStrategyFromShotType(shotSize);
  }

  // 4. 默认 angle_switch
  return createStrategy("angle_switch");
}

/**
 * 把策略约束追加到 prompt。
 *
 * INV-5: 仅追加约束指令，不修改原始 prompt 内容。
 *
 * 不同策略的追加内容：
 *   - continuous_action: "保持与上一镜尾帧的视觉连续性，角色外观/姿势自然延续。"
 *   - angle_switch: "保持角色外观一致，可调整镜头角度和构图。"
 *   - scene_transition: "新场景建立镜头，可重新定义环境，但角色身份保持一致。"
 *
 * 若 prompt 已包含相同约束关键词，不重复追加（避免冗余）。
 */
export function applyStrategyToPrompt(
  strategy: ShotStrategy,
  prompt: string,
): string {
  if (!prompt || prompt.trim().length === 0) {
    return prompt;
  }

  const constraint = getStrategyConstraint(strategy);
  if (!constraint) return prompt;

  // 检查是否已包含关键约束词（避免重复）
  if (containsConstraintKeyword(prompt, strategy.type)) {
    return prompt;
  }

  return `${prompt}\n\n${constraint}`;
}

/** 获取策略对应的约束指令文本 */
function getStrategyConstraint(strategy: ShotStrategy): string {
  switch (strategy.type) {
    case "continuous_action":
      return "[连续动作约束] 保持与上一镜尾帧的视觉连续性，角色外观、服装、姿势自然延续，避免突然变化。";
    case "angle_switch":
      return "[换角度约束] 保持角色外观一致（脸型、服装、配饰），可调整镜头角度和构图。";
    case "scene_transition":
      return "[场景转场约束] 新场景建立镜头，可重新定义环境与构图，但角色身份（脸型、发色、服装主体）保持一致。";
  }
}

/** 检查 prompt 是否已包含策略关键词 */
function containsConstraintKeyword(prompt: string, strategyType: ShotStrategyType): boolean {
  const lower = prompt.toLowerCase();
  switch (strategyType) {
    case "continuous_action":
      return lower.includes("连续动作") || lower.includes("尾帧") || lower.includes("visual continuity");
    case "angle_switch":
      return lower.includes("换角度") || lower.includes("外观一致") || lower.includes("angle switch");
    case "scene_transition":
      return lower.includes("场景转场") || lower.includes("新场景") || lower.includes("scene transition");
  }
}

/**
 * 计算策略调整后的有效阈值。
 *
 * - continuous_action：阈值更严格（×1.1），更易触发 drift_warning/critical
 * - angle_switch：默认阈值（×1.0）
 * - scene_transition：阈值更宽松（×0.9），更不易触发
 *
 * 注意：阈值不能超过 [0, 1] 范围，乘以系数后需 clamp。
 */
export function getEffectiveThreshold(
  strategy: ShotStrategy,
  policy: DriftPolicy,
): { warningThreshold: number; criticalThreshold: number } {
  const multiplier = getStrategyThresholdMultiplier(strategy);
  return {
    warningThreshold: clamp01(policy.warningThreshold * multiplier),
    criticalThreshold: clamp01(policy.criticalThreshold * multiplier),
  };
}

/** 限制数值在 [0, 1] 范围 */
function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * 生成策略的人类可读描述（用于 UI 展示和日志）。
 */
export function describeRoutedStrategy(strategy: ShotStrategy): string {
  return describeStrategy(strategy);
}

/**
 * 判断是否需要使用尾帧作为参考（用于视频生成参数构造）。
 *
 * 仅 continuous_action（strong）和 angle_switch（weak）需要尾帧。
 * scene_transition（none）不需要。
 */
export function shouldUseLastFrame(strategy: ShotStrategy): boolean {
  return strategy.useLastFrame !== "none";
}

/**
 * 获取尾帧使用强度（用于生成参数）。
 */
export function getLastFrameUsage(strategy: ShotStrategy): "strong" | "weak" | "none" {
  return strategy.useLastFrame;
}

/**
 * 判断策略是否锁定（用户手动指定，不应被 AI 推断覆盖）。
 */
export function isStrategyLocked(override?: StrategyOverride): boolean {
  return override?.locked === true;
}

/**
 * 构建带策略信息的 prompt 完整描述（用于日志和 debug）。
 */
export function buildStrategyAwarePrompt(
  strategy: ShotStrategy,
  prompt: string,
): { prompt: string; strategyDescription: string; constraintAppended: boolean } {
  const originalPrompt = prompt;
  const augmentedPrompt = applyStrategyToPrompt(strategy, prompt);
  return {
    prompt: augmentedPrompt,
    strategyDescription: describeStrategy(strategy),
    constraintAppended: augmentedPrompt !== originalPrompt,
  };
}
