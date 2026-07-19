/**
 * Task 2A.19 — 工作流模式类型
 *
 * 定义半自动/全自动工作流模式的类型，以及 retake-protocol 的判定结果。
 *
 * 设计来源：seedance-2.0 仓库 references/retake-protocol.md 五等级 triage
 *
 * 核心概念：
 * - WorkflowMode：半自动（每步暂停可编辑）或全自动（仅关键节点暂停）
 * - RetakeVerdict：生成失败时的判定结果，决定下一步操作
 * - 五等级 triage：keep / minor_fix / retake_single_var / retake_full / replan
 *
 * 依赖方向：仅依赖同模块（零外部依赖）
 */

// ============================================================================
// 工作流模式
// ============================================================================

/**
 * 工作流模式。
 *
 * - semi-auto: 半自动，每个步骤完成后暂停，用户可编辑后继续
 * - full-auto: 全自动，仅在选段 + 角色冲突节点暂停，其余自动执行
 *
 * 与 Task 2A.16 的 aiAssistLevel（quick/standard/professional）正交：
 * - aiAssistLevel 决定"使用多少 AI 功能"（哪些阶段跳过）
 * - workflowMode 决定"AI 执行时是否暂停等待用户"
 *
 * 组合示例：
 * - professional + semi-auto: 专业模式 + 每步暂停（最细致的控制）
 * - quick + full-auto: 快速模式 + 全自动（最快出结果）
 */
export type WorkflowMode = "semi-auto" | "full-auto";

// ============================================================================
// Retake 判定
// ============================================================================

/**
 * Retake 判定类型（五等级 triage）。
 *
 * 分数区间：
 * - keep (90-100): 保留，质量达标
 * - minor_fix (70-89): 小修，如调整 prompt 措辞
 * - retake_single_var (50-69): 单变量重试，只改一个维度
 * - retake_full (30-49): 完全重试，重新生成
 * - replan (0-29): 重新规划，回到 ShotContract 阶段
 */
export type RetakeVerdictType =
  | "keep"
  | "minor_fix"
  | "retake_single_var"
  | "retake_full"
  | "replan";

/**
 * 失败维度（用于单变量重试时定位问题）。
 *
 * - camera: 镜头/景别/运动问题
 * - lighting: 灯光/氛围问题
 * - motion: 动作/动态问题
 * - character: 角色/外观问题
 * - composition: 构图/画面问题
 * - safety: 内容安全问题（触发安全过滤）
 */
export type FailedDimension =
  | "camera"
  | "lighting"
  | "motion"
  | "character"
  | "composition"
  | "safety";

/**
 * Retake 判定结果。
 *
 * 由 retake-protocol.ts 的 evaluate 函数产出，包含下一步操作建议。
 */
export interface RetakeVerdict {
  /** 判定类型（五等级之一） */
  verdict: RetakeVerdictType;
  /** 质量分数 0-100 */
  score: number;
  /** 失败维度（可选，单变量重试时用于定位） */
  failedDimension?: FailedDimension;
  /** 单变量重试时调整的变量名（如 "prompt.camera_angle"） */
  singleVariable?: string;
  /** 剩余重试次数（耗尽后提示用户手动介入） */
  attemptBudget: number;
}

// ============================================================================
// 分数阈值常量
// ============================================================================

/**
 * 五等级 triage 的分数阈值。
 *
 * 规则：
 * - score >= 90 → keep
 * - score >= 70 → minor_fix
 * - score >= 50 → retake_single_var
 * - score >= 30 → retake_full
 * - score < 30 → replan
 */
export const RETAKE_THRESHOLDS = {
  keep: 90,
  minor_fix: 70,
  retake_single_var: 50,
  retake_full: 30,
} as const;

/**
 * 默认重试预算（每次 retake 递减 1）。
 */
export const DEFAULT_ATTEMPT_BUDGET = 3;

// ============================================================================
// Pipeline 步骤定义
// ============================================================================

/**
 * Pipeline 步骤状态。
 *
 * 用于 auto-pipeline 和 semi-pipeline 跟踪每个步骤的执行情况。
 */
export type StepStatus =
  | "pending"     // 未开始
  | "running"     // 执行中
  | "awaiting_user" // 等待用户确认（仅 full-auto 的关键节点）
  | "awaiting_edit" // 等待用户编辑（仅 semi-auto）
  | "completed"   // 已完成
  | "failed"      // 失败（触发 retake-protocol）
  | "skipped";    // 已跳过（如 quick 模式跳过某些阶段）

/**
 * Pipeline 步骤定义。
 */
export interface PipelineStep {
  /** 步骤唯一 ID（如 "select_segments" / "character_conflict"） */
  id: string;
  /** 步骤名称（用于 UI 显示） */
  name: string;
  /** 步骤状态 */
  status: StepStatus;
  /**
   * 是否为关键节点（仅 full-auto 模式下暂停）。
   * semi-auto 模式下所有步骤都暂停。
   */
  isCriticalNode: boolean;
  /** 执行结果（成功时填充） */
  result?: unknown;
  /** 错误信息（失败时填充） */
  error?: string;
  /** Retake 判定（失败时填充） */
  retakeVerdict?: RetakeVerdict;
}

// ============================================================================
// 工作流状态
// ============================================================================

/**
 * 工作流执行状态。
 *
 * 由 auto-pipeline / semi-pipeline 维护，UI 通过此状态显示进度。
 */
export interface WorkflowState {
  /** 当前工作流模式 */
  mode: WorkflowMode;
  /** 所有步骤 */
  steps: PipelineStep[];
  /** 当前步骤索引 */
  currentStepIdx: number;
  /** 是否正在执行 */
  isRunning: boolean;
  /** 是否暂停等待用户 */
  isPaused: boolean;
  /** 全局重试预算 */
  globalAttemptBudget: number;
}

/**
 * 工作流事件类型。
 *
 * 用于 auto-pipeline / semi-pipeline 通知 UI 状态变化。
 */
export type WorkflowEvent =
  | { type: "step_started"; stepId: string }
  | { type: "step_completed"; stepId: string; result?: unknown }
  | { type: "step_failed"; stepId: string; error: string; verdict: RetakeVerdict }
  | { type: "awaiting_user"; stepId: string; reason: "critical_node" | "edit_required" }
  | { type: "user_confirmed"; stepId: string }
  | { type: "user_edited"; stepId: string; edits: unknown }
  | { type: "retake_started"; stepId: string; attempt: number }
  | { type: "budget_exhausted"; stepId: string }
  | { type: "workflow_completed" }
  | { type: "workflow_aborted"; reason: string };
