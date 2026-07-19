/**
 * Task 2A.18 — 违规修复建议生成器
 *
 * 为 ContinuityViolation 生成 suggestedFix。
 *
 * 双模式设计：
 * 1. 基于规则的同步生成（generateRuleBasedSuggestion）：确定性、可测试
 * 2. 基于 AI 的异步生成（applyAllAiSuggestions）：可选注入 aiGenerate 函数
 *
 * 规则策略：
 * - 服装/发色冲突：优先采用 isExplicit=true 的值，否则采用多数值
 * - 时间冲突：建议标记"时间跳转"或统一为多数值
 * - 氛围冲突：建议统一为多数值
 * - 道具位置冲突：建议统一为 isExplicit=true 的值
 *
 * 依赖方向：仅依赖同子域 domain/continuity-ledger
 */

import type {
  ConflictValue,
  ContinuityViolation,
} from "../domain/continuity-ledger";

/**
 * 修复建议生成器选项。
 */
export interface ViolationFixerOptions {
  /**
   * 可选的 AI 生成函数（异步）。
   *
   * 用于生成更自然的修复建议（如"将第 5 分镜角色服装改为红色，
   * 或在第 4 分镜添加换装说明"）。
   *
   * 未配置时仅使用规则生成。
   */
  aiGenerate?: (violation: ContinuityViolation) => Promise<string>;
}

/**
 * 违规修复建议生成器。
 *
 * 设计为有状态类（持有 options），便于在 UI 中复用 AI 生成器。
 */
export class ContinuityViolationFixer {
  constructor(private readonly options: ViolationFixerOptions = {}) {}

  /**
   * 同步生成基于规则的修复建议。
   *
   * 算法：
   * 1. 找出 isExplicit=true 的值（用户明确标记优先）
   * 2. 否则找出出现次数最多的值（多数优先）
   * 3. 根据 category 生成自然语言建议
   *
   * @param violation 单个违规
   * @returns 自然语言修复建议
   */
  generateRuleBasedSuggestion(violation: ContinuityViolation): string {
    const { key, conflictingValues } = violation;

    // 1. 找出推荐值
    const recommended = this.findRecommendedValue(conflictingValues);
    const recommendedShot = this.findFirstShotWithValue(
      conflictingValues,
      recommended,
    );

    // 2. 找出第一个不一致的 shot（用于"在 shot-X 添加说明"建议）
    const firstDiffShot = this.findFirstDifferentShot(
      conflictingValues,
      recommended,
    );

    // 3. 根据 category + key 后缀生成建议
    if (key.endsWith(".服装")) {
      if (firstDiffShot) {
        return `建议统一为"${recommended}"（参考分镜 ${this.formatShotId(recommendedShot)}），或在分镜 ${this.formatShotId(firstDiffShot.shotId)} 的 continuityNotes 中添加"换装说明"。`;
      }
      return `建议统一为"${recommended}"。`;
    }

    if (key.endsWith(".发色")) {
      if (firstDiffShot) {
        return `建议统一为"${recommended}"（参考分镜 ${this.formatShotId(recommendedShot)}），或在分镜 ${this.formatShotId(firstDiffShot.shotId)} 的 continuityNotes 中添加"染发说明"。`;
      }
      return `建议统一为"${recommended}"。`;
    }

    if (key.endsWith(".时间")) {
      if (firstDiffShot) {
        return `时间不一致：建议检查是否有时间跳转，如有请在分镜 ${this.formatShotId(firstDiffShot.shotId)} 的 continuityNotes 中标记"时间跳转"，否则统一为"${recommended}"。`;
      }
      return `建议统一为"${recommended}"。`;
    }

    if (key.endsWith(".氛围")) {
      return `建议统一为"${recommended}"（参考分镜 ${this.formatShotId(recommendedShot)}）。`;
    }

    if (key.endsWith(".位置")) {
      return `建议统一为"${recommended}"（参考分镜 ${this.formatShotId(recommendedShot)}）。`;
    }

    // 通用建议
    if (firstDiffShot) {
      return `建议统一为"${recommended}"，或在分镜 ${this.formatShotId(firstDiffShot.shotId)} 中添加剧情说明。`;
    }
    return `建议统一为"${recommended}"。`;
  }

  /**
   * 找出推荐值。
   *
   * 优先级：
   * 1. isExplicit=true 的值（用户明确标记优先）
   * 2. 出现次数最多的值（多数优先）
   * 3. 第一个值（回退）
   */
  private findRecommendedValue(values: ConflictValue[]): string {
    // 1. 优先 isExplicit=true
    const explicit = values.find((v) => v.isExplicit);
    if (explicit) return explicit.value;

    // 2. 多数值
    const counts = new Map<string, number>();
    for (const v of values) {
      counts.set(v.value, (counts.get(v.value) ?? 0) + 1);
    }
    let maxCount = 0;
    let maxValue = values[0]!.value;
    for (const [value, count] of counts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        maxValue = value;
      }
    }
    return maxValue;
  }

  /**
   * 找出第一个拥有推荐值的 shot（用于"参考分镜"建议）。
   */
  private findFirstShotWithValue(
    values: ConflictValue[],
    targetValue: string,
  ): string {
    const found = values.find((v) => v.value === targetValue);
    return found?.shotId ?? values[0]!.shotId;
  }

  /**
   * 找出第一个与推荐值不同的 shot（用于"添加说明"建议）。
   */
  private findFirstDifferentShot(
    values: ConflictValue[],
    targetValue: string,
  ): ConflictValue | undefined {
    return values.find((v) => v.value !== targetValue);
  }

  /**
   * 格式化 shot ID 为 UI 友好显示。
   *
   * 输入 "shot-3" → 输出 "shot-3"（保持原样，便于测试稳定）
   */
  private formatShotId(shotId: string): string {
    return shotId;
  }

  /**
   * 为单个 violation 添加规则建议（同步）。
   */
  applySuggestion(violation: ContinuityViolation): ContinuityViolation {
    if (violation.suggestedFix) {
      // 已有建议，不覆盖
      return violation;
    }
    return {
      ...violation,
      suggestedFix: this.generateRuleBasedSuggestion(violation),
    };
  }

  /**
   * 为所有 violation 添加规则建议（同步）。
   *
   * @param violations 违规列表
   * @returns 添加了 suggestedFix 的新列表（不修改原数组）
   */
  applyAllSuggestions(violations: ContinuityViolation[]): ContinuityViolation[] {
    return violations.map((v) => this.applySuggestion(v));
  }

  /**
   * 异步为单个 violation 生成 AI 建议。
   *
   * 未配置 aiGenerate 时返回 undefined。
   *
   * @param violation 单个违规
   * @returns AI 生成的建议，或 undefined
   */
  async generateAiSuggestion(
    violation: ContinuityViolation,
  ): Promise<string | undefined> {
    if (!this.options.aiGenerate) return undefined;
    try {
      return await this.options.aiGenerate(violation);
    } catch {
      // AI 失败时回退到规则建议
      return this.generateRuleBasedSuggestion(violation);
    }
  }

  /**
   * 异步为所有 violation 添加 AI 建议。
   *
   * 未配置 aiGenerate 时回退到规则建议。
   *
   * @param violations 违规列表
   * @returns 添加了 suggestedFix 的新列表
   */
  async applyAllAiSuggestions(
    violations: ContinuityViolation[],
  ): Promise<ContinuityViolation[]> {
    if (!this.options.aiGenerate) {
      return this.applyAllSuggestions(violations);
    }

    const results = await Promise.all(
      violations.map(async (v) => {
        if (v.suggestedFix) return v; // 已有建议不覆盖
        const aiSuggestion = await this.generateAiSuggestion(v);
        return aiSuggestion ? { ...v, suggestedFix: aiSuggestion } : v;
      }),
    );
    return results;
  }
}

/**
 * 单例实例（无 AI 配置，仅规则建议）。
 *
 * 需要使用 AI 建议时通过 new ContinuityViolationFixer({ aiGenerate }) 创建新实例。
 */
export const continuityViolationFixer = new ContinuityViolationFixer();
