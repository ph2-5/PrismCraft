/**
 * Task 2A.19 — 半自动管道
 *
 * 半自动模式（semi-auto），每个步骤完成后暂停等待用户编辑：
 * - 每个步骤执行后进入 awaiting_edit 状态
 * - 用户可编辑结果后调用 applyEdit 推进到下一步
 * - 失败时同样触发 retake-protocol
 *
 * 与 AutoPipeline 的区别：
 * - shouldPauseAt 始终返回 true（所有步骤都暂停）
 * - 状态使用 awaiting_edit 而非 awaiting_user
 * - 用户调用 applyEdit（携带 edits）而非 confirmUser
 *
 * 设计为纯状态机，不实际执行 AI 调用（由调用方注入 executor）。
 *
 * 依赖方向：依赖同子域 domain/workflow-mode + retake-protocol
 */

import type {
  PipelineStep,
  WorkflowMode,
  WorkflowState,
} from "../domain/workflow-mode";
import { RetakeProtocol } from "./retake-protocol";
import type { EventCallback, StepExecutor } from "./auto-pipeline";

/**
 * 半自动管道。
 *
 * 使用方式：
 * 1. createInitialState(steps) 创建初始状态
 * 2. 循环调用 runNext(state, executor, onEvent) 执行并暂停
 * 3. 用户编辑后调用 applyEdit(state, edits, onEvent) 推进
 * 4. 遇到 workflow_completed 事件时结束
 */
export class SemiPipeline {
  constructor(
    private readonly retakeProtocol: RetakeProtocol = new RetakeProtocol(),
  ) {}

  /**
   * 创建初始工作流状态。
   *
   * @param steps 步骤列表
   * @param attemptBudget 全局重试预算
   */
  createInitialState(
    steps: PipelineStep[],
    attemptBudget: number = 3,
  ): WorkflowState {
    return {
      mode: "semi-auto",
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
   * semi-auto 模式：所有步骤都暂停（始终返回 true）
   */
  shouldPauseAt(_step: PipelineStep, _mode: WorkflowMode = "semi-auto"): boolean {
    return true;
  }

  /**
   * 执行下一步。
   *
   * 算法：
   * 1. 检查是否已到达末尾 → emit workflow_completed
   * 2. 执行步骤
   * 3. 成功 → 设置为 awaiting_edit，emit awaiting_user（reason=edit_required）
   * 4. 失败 → 触发 retake-protocol，emit step_failed
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

    // 2. 执行步骤
    newSteps[state.currentStepIdx] = {
      ...currentStep,
      status: "running",
    };
    onEvent?.({ type: "step_started", stepId: currentStep.id });

    try {
      const result = await executor(currentStep);
      newSteps[state.currentStepIdx] = {
        ...currentStep,
        status: "awaiting_edit",
        result,
      };
      onEvent?.({
        type: "awaiting_user",
        stepId: currentStep.id,
        reason: "edit_required",
      });

      return {
        ...state,
        steps: newSteps,
        isRunning: false,
        isPaused: true,
      };
    } catch (error) {
      // 3. 失败 → 触发 retake-protocol
      const errorMsg = error instanceof Error ? error.message : String(error);
      const verdict = this.retakeProtocol.evaluate({
        score: 50,
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

      // 仍有预算 → 当前步骤仍标记为 failed，等待用户决定 retake 或跳过
      return {
        ...state,
        steps: newSteps,
        isRunning: false,
        isPaused: true,
        globalAttemptBudget: verdict.attemptBudget,
      };
    }
  }

  /**
   * 用户应用编辑。
   *
   * 将步骤状态从 awaiting_edit 改为 completed，并推进到下一步。
   *
   * @param state 当前状态
   * @param edits 用户编辑内容（可选，仅用于事件通知）
   * @param onEvent 事件回调
   */
  applyEdit(
    state: WorkflowState,
    edits?: unknown,
    onEvent?: EventCallback,
  ): WorkflowState {
    if (state.currentStepIdx >= state.steps.length) return state;

    const currentStep = state.steps[state.currentStepIdx]!;
    if (currentStep.status !== "awaiting_edit") return state;

    const newSteps = [...state.steps];
    newSteps[state.currentStepIdx] = {
      ...currentStep,
      status: "completed",
    };

    onEvent?.({ type: "user_edited", stepId: currentStep.id, edits });

    return {
      ...state,
      steps: newSteps,
      currentStepIdx: state.currentStepIdx + 1,
      isPaused: false,
      isRunning: true,
    };
  }

  /**
   * 跳过当前步骤（用户主动放弃编辑，直接进入下一步）。
   *
   * 与 applyEdit 区别：跳过不推进 currentStepIdx 时不携带 edits 事件。
   */
  skipCurrent(
    state: WorkflowState,
    onEvent?: EventCallback,
  ): WorkflowState {
    if (state.currentStepIdx >= state.steps.length) return state;

    const currentStep = state.steps[state.currentStepIdx]!;
    const newSteps = [...state.steps];
    newSteps[state.currentStepIdx] = {
      ...currentStep,
      status: "skipped",
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
export const semiPipeline = new SemiPipeline();
