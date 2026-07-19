/**
 * Task 2A.19 — 工作流子域桶文件
 *
 * 导出半自动/全自动工作流的所有类型、常量、类和 UI 组件。
 *
 * 公共 API：
 * - 类型：WorkflowMode, RetakeVerdict, PipelineStep, WorkflowState, WorkflowEvent, ...
 * - 常量：RETAKE_THRESHOLDS, DEFAULT_ATTEMPT_BUDGET
 * - 类：RetakeProtocol, AutoPipeline, SemiPipeline
 * - 单例：retakeProtocol, autoPipeline, semiPipeline
 * - UI：WorkflowModeSelector
 */

// ============================================================================
// Domain — 类型与常量
// ============================================================================

export type {
  WorkflowMode,
  RetakeVerdictType,
  FailedDimension,
  RetakeVerdict,
  StepStatus,
  PipelineStep,
  WorkflowState,
  WorkflowEvent,
} from "./domain/workflow-mode";

export {
  RETAKE_THRESHOLDS,
  DEFAULT_ATTEMPT_BUDGET,
} from "./domain/workflow-mode";

// ============================================================================
// Services — Retake 协议
// ============================================================================

export {
  RetakeProtocol,
  retakeProtocol,
} from "./services/retake-protocol";
export type { RetakeInput } from "./services/retake-protocol";

// ============================================================================
// Services — 全自动管道
// ============================================================================

export {
  AutoPipeline,
  autoPipeline,
} from "./services/auto-pipeline";
export type { StepExecutor, EventCallback } from "./services/auto-pipeline";

// ============================================================================
// Services — 半自动管道
// ============================================================================

export {
  SemiPipeline,
  semiPipeline,
} from "./services/semi-pipeline";

// ============================================================================
// Presentation — UI 组件
// ============================================================================

export { WorkflowModeSelector } from "./presentation/WorkflowModeSelector";
export type { WorkflowModeSelectorProps } from "./presentation/WorkflowModeSelector";
