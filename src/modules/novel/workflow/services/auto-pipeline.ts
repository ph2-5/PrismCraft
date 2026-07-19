/**
 * Task 2A.19 — 全自动管道
 *
 * 全自动模式（full-auto），仅在关键节点暂停等待用户确认：
 * - Step 3（选段）：用户确认要处理的段落
 * - Step 5（角色冲突）：多个角色匹配冲突时让用户选择
 * 其余步骤自动执行，失败时触发 retake-protocol。
 *
 * 设计为纯状态机，不实际执行 AI 调用（由调用方注入 executor）。
 * 这样便于测试，且与 useNovelPipeline 解耦。
 *
 * 依赖方向：依赖同子域 domain/workflow-mode + retake-protocol
 */

import type {
  PipelineStep,
  WorkflowEvent,
  WorkflowMode,
  WorkflowState,
} from "../domain/workflow-mode";
import { RetakeProtocol } from "./retake-protocol";

/**
 * 步骤执行器。
 *
 * 由调用方注入实际的 AI 调用逻辑。
 */
export type StepExecutor = (step: PipelineStep) => Promise<unknown>;

/**
 * 事件回调。
 */
export type EventCallback = (event: WorkflowEvent) => void;

/**
 * 全自动管道。
 *
 * 使用方式：
 * 1. createInitialState(steps) 创建初始状态
 * 2. 循环调用 runNext(state, executor, onEvent) 推进
 * 3. 遇到 awaiting_user 事件时调用 confirmUser 推进
 * 4. 遇到 workflow_completed 事件时结束
 */
export class AutoPipeline {
  constructor(
    private readonly retakeProtocol: RetakeProtocol = new RetakeProtocol(),
  ) {}

  /**
   * 创建初始工作流状态。
   *
   * @param steps 步骤列表（每个步骤的 isCriticalNode 决定是否暂停）
   * @param attemptBudget 全局重试预算
   */
  createInitialState(
    steps: PipelineStep[],
    attemptBudget: number = 3,
  ): WorkflowState {
    return {
      mode: "full-auto",
      steps: steps.map((s) => ({ ...s, status: "pending" })),
      currentStepIdx: 0,
      isRunning: false,
      isPaused: false,
      globalAttemptBudget: attemptBudget,
    };
  }

  /**
   * 判断是否应在指定步骤暂停。
   *
   * full-auto 模式：仅 isCriticalNode=true 的步骤暂停
   */
  shouldPauseAt(step: PipelineStep, _mode: WorkflowMode = "full-auto"): boolean {
    return step.isCriticalNode;
  }

  /**
   * 执行下一步。
   *
   * 算法：
   * 1. 检查是否已到达末尾 → emit workflow_completed
   * 2. 获取当前步骤
   * 3. 若为关键节点 → emit awaiting_user，暂停
   * 4. 否则调用 executor 执行
   * 5. 成功 → emit step_completed，推进到下一步
   * 6. 失败 → 调用 retakeProtocol.evaluate，emit step_failed
   *    - 若需用户介入 → emit budget_exhausted
   *
   * @returns 新的 WorkflowState（不修改原 state）
   */
  async runNext(
    state: WorkflowState,
    executor: StepExecutor,
    onEvent?: EventCallback,
  ): Promise<WorkflowState> {
    // 1. 检查是否已到达末尾
    if (state.currentStepIdx >= state.steps.length) {
      onEvent?.({ type: "workflow_completed" });
      return { ...state, isRunning: false, isPaused: false };
    }

    const currentStep = state.steps[state.currentStepIdx]!;
    const newSteps = [...state.steps];

    // 2. 若为关键节点 → 暂停等待用户
    if (this.shouldPauseAt(currentStep, state.mode)) {
      newSteps[state.currentStepIdx] = {
        ...currentStep,
        status: "awaiting_user",
      };
      onEvent?.({
        type: "awaiting_user",
        stepId: currentStep.id,
        reason: "critical_node",
      });
      return {
        ...state,
        steps: newSteps,
        isRunning: false,
        isPaused: true,
      };
    }

    // 3. 执行步骤
    newSteps[state.currentStepIdx] = {
      ...currentStep,
      status: "running",
    };
    onEvent?.({ type: "step_started", stepId: currentStep.id });

    try {
      const result = await executor(currentStep);
      newSteps[state.currentStepIdx] = {
        ...currentStep,
        status: "completed",
        result,
      };
      onEvent?.({
        type: "step_completed",
        stepId: currentStep.id,
        result,
      });

      return {
        ...state,
        steps: newSteps,
        currentStepIdx: state.currentStepIdx + 1,
        isRunning: true,
        isPaused: false,
      };
    } catch (error) {
      // 4. 失败 → 触发 retake-protocol
      const errorMsg = error instanceof Error ? error.message : String(error);
      const verdict = this.retakeProtocol.evaluate({
        score: 50, // 默认中等分数，实际应由 executor 返回
        attemptBudget: state.globalAttemptBudget,
      });

      newSteps[state.currentStepIdx] = {
        ...currentStep,
        status: "failed",
        error: errorMsg,
        retakeVerdict: verdict,
      };

      onEvent?.({
        type: "step_failed",
        stepId: currentStep.id,
        error: errorMsg,
        verdict,
      });

      // 预算耗尽 → 要求用户介入
      if (this.retakeProtocol.requiresUserIntervention(verdict)) {
        onEvent?.({ type: "budget_exhausted", stepId: currentStep.id });
        return {
          ...state,
          steps: newSteps,
          isRunning: false,
          isPaused: true,
          globalAttemptBudget: verdict.attemptBudget,
        };
      }

      // 仍有预算 → 继续下一步（实际 retake 由调用方决定）
      return {
        ...state,
        steps: newSteps,
        currentStepIdx: state.currentStepIdx + 1,
        isRunning: true,
        isPaused: false,
        globalAttemptBudget: verdict.attemptBudget,
      };
    }
  }

  /**
   * 用户确认关键节点（仅 full-auto 模式的 critical node）。
   *
   * 将步骤状态从 awaiting_user 改为 completed，并推进到下一步。
   */
  confirmUser(state: WorkflowState, onEvent?: EventCallback): WorkflowState {
    if (state.currentStepIdx >= state.steps.length) return state;

    const currentStep = state.steps[state.currentStepIdx]!;
    if (currentStep.status !== "awaiting_user") return state;

    const newSteps = [...state.steps];
    newSteps[state.currentStepIdx] = {
      ...currentStep,
      status: "completed",
    };

    onEvent?.({ type: "user_confirmed", stepId: currentStep.id });

    return {
      ...state,
      steps: newSteps,
      currentStepIdx: state.currentStepIdx + 1,
      isPaused: false,
      isRunning: true,
    };
  }

  /**
   * 中止工作流。
   */
  abort(state: WorkflowState, reason: string, onEvent?: EventCallback): WorkflowState {
    onEvent?.({ type: "workflow_aborted", reason });
    return {
      ...state,
      isRunning: false,
      isPaused: false,
    };
  }
}

/**
 * 单例实例。
 *
 * 构造函数已默认注入 RetakeProtocol 单例，无需额外参数。
 */
export const autoPipeline = new AutoPipeline();
