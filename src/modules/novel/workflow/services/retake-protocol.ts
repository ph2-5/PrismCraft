/**
 * Task 2A.19 — Retake 协议
 *
 * 借鉴 seedance-2.0 仓库 references/retake-protocol.md 的五等级 triage + 单变量 retake 模式。
 *
 * 五等级 triage：
 * - 90-100 分：keep（保留）
 * - 70-89 分：minor_fix（小修，如调整 prompt 措辞）
 * - 50-69 分：retake_single_var（单变量重试，只改一个维度）
 * - 30-49 分：retake_full（完全重试）
 * - 0-29 分：replan（重新规划，回到 ShotContract 阶段）
 *
 * 单变量 retake：
 * - 失败时仅调整一个维度（如 camera_angle / lighting / motion）
 * - 避免完全重试的代价，提升成功率
 * - 每次 retake 递减 attemptBudget，耗尽后提示用户手动介入
 *
 * 依赖方向：仅依赖同子域 domain/workflow-mode
 */

import type {
  FailedDimension,
  RetakeVerdict,
  RetakeVerdictType,
} from "../domain/workflow-mode";
import {
  DEFAULT_ATTEMPT_BUDGET,
  RETAKE_THRESHOLDS,
} from "../domain/workflow-mode";

/**
 * Retake 评估输入。
 */
export interface RetakeInput {
  /** 质量分数 0-100 */
  score: number;
  /** 失败维度（可选，单变量重试时用于定位） */
  failedDimension?: FailedDimension;
  /** 当前剩余重试次数 */
  attemptBudget: number;
}

/**
 * 单变量重试的建议变量名映射。
 *
 * 根据失败维度推荐调整的变量名（用于 RetakeVerdict.singleVariable）。
 */
const SINGLE_VAR_BY_DIMENSION: Record<FailedDimension, string> = {
  camera: "prompt.camera_angle",
  lighting: "prompt.lighting",
  motion: "prompt.motion",
  character: "prompt.character_appearance",
  composition: "prompt.composition",
  safety: "prompt.safety_filter",
};

/**
 * Retake 协议。
 *
 * 无状态类（pure functions），便于测试。
 */
export class RetakeProtocol {
  /**
   * 根据分数和失败维度生成 RetakeVerdict。
   *
   * 算法：
   * 1. 按分数阈值判定 verdict 类型
   * 2. 若为 retake_single_var 且有 failedDimension，填充 singleVariable
   * 3. 若 verdict 类型为 keep / minor_fix，不消耗 attemptBudget
   * 4. 若 verdict 类型为 retake_*，递减 attemptBudget
   * 5. 若 attemptBudget 已为 0，强制升级为 replan（要求用户介入）
   *
   * @param input 评估输入
   * @returns RetakeVerdict 判定结果
   */
  evaluate(input: RetakeInput): RetakeVerdict {
    const { score, failedDimension, attemptBudget } = input;
    const clampedScore = Math.max(0, Math.min(100, score));

    // 1. 按分数阈值判定 verdict 类型
    const verdictType = this.scoreToVerdict(clampedScore);

    // 2. 填充 singleVariable（仅 retake_single_var 时）
    const singleVariable =
      verdictType === "retake_single_var" && failedDimension
        ? SINGLE_VAR_BY_DIMENSION[failedDimension]
        : undefined;

    // 3. 计算新的 attemptBudget
    // retake_* 类型消耗 1 次预算；keep / minor_fix / replan 不消耗
    const consumesBudget =
      verdictType === "retake_single_var" || verdictType === "retake_full";
    const newBudget = consumesBudget ? Math.max(0, attemptBudget - 1) : attemptBudget;

    // 4. 若需 retake 但预算已耗尽，强制升级为 replan
    const finalVerdict: RetakeVerdictType =
      consumesBudget && attemptBudget === 0 ? "replan" : verdictType;

    return {
      verdict: finalVerdict,
      score: clampedScore,
      failedDimension,
      singleVariable:
        finalVerdict === "retake_single_var" ? singleVariable : undefined,
      attemptBudget: newBudget,
    };
  }

  /**
   * 分数 → verdict 类型映射。
   *
   * 阈值：
   * - >= 90 → keep
   * - >= 70 → minor_fix
   * - >= 50 → retake_single_var
   * - >= 30 → retake_full
   * - < 30 → replan
   */
  private scoreToVerdict(score: number): RetakeVerdictType {
    if (score >= RETAKE_THRESHOLDS.keep) return "keep";
    if (score >= RETAKE_THRESHOLDS.minor_fix) return "minor_fix";
    if (score >= RETAKE_THRESHOLDS.retake_single_var) return "retake_single_var";
    if (score >= RETAKE_THRESHOLDS.retake_full) return "retake_full";
    return "replan";
  }

  /**
   * 执行单变量重试。
   *
   * 在原 verdict 基础上调整 singleVariable，并消耗 1 次预算。
   *
   * @param verdict 原 verdict
   * @param variable 新的单变量名
   * @returns 新 verdict
   */
  retakeSingleVar(
    verdict: RetakeVerdict,
    variable: string,
  ): RetakeVerdict {
    if (verdict.attemptBudget <= 0) {
      // 预算耗尽，强制 replan
      return {
        ...verdict,
        verdict: "replan",
        singleVariable: undefined,
      };
    }

    return {
      ...verdict,
      verdict: "retake_single_var",
      singleVariable: variable,
      attemptBudget: verdict.attemptBudget - 1,
    };
  }

  /**
   * 执行完全重试。
   *
   * 消耗 1 次预算。
   *
   * @param verdict 原 verdict
   * @returns 新 verdict
   */
  retakeFull(verdict: RetakeVerdict): RetakeVerdict {
    if (verdict.attemptBudget <= 0) {
      return {
        ...verdict,
        verdict: "replan",
        singleVariable: undefined,
      };
    }

    return {
      ...verdict,
      verdict: "retake_full",
      singleVariable: undefined,
      attemptBudget: verdict.attemptBudget - 1,
    };
  }

  /**
   * 检查是否还有重试预算。
   */
  hasBudget(verdict: RetakeVerdict): boolean {
    return verdict.attemptBudget > 0;
  }

  /**
   * 判断 verdict 是否需要用户介入。
   *
   * - replan: 需要用户重新规划
   * - 预算耗尽且仍需 retake: 需要用户介入
   */
  requiresUserIntervention(verdict: RetakeVerdict): boolean {
    if (verdict.verdict === "replan") return true;
    if (
      (verdict.verdict === "retake_single_var" ||
        verdict.verdict === "retake_full") &&
      verdict.attemptBudget <= 0
    ) {
      return true;
    }
    return false;
  }

  /**
   * 创建初始 verdict（用于首次评估前）。
   */
  createInitialVerdict(attemptBudget: number = DEFAULT_ATTEMPT_BUDGET): RetakeVerdict {
    return {
      verdict: "keep",
      score: 100,
      attemptBudget,
    };
  }
}

/**
 * 单例实例。
 */
export const retakeProtocol = new RetakeProtocol();
