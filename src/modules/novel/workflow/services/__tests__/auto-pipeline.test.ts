/**
 * Task 2A.19 — AutoPipeline 单元测试
 *
 * 测试覆盖：
 * - createInitialState：初始状态正确
 * - shouldPauseAt：full-auto 模式仅 isCriticalNode 暂停
 * - runNext：
 *   - 已到达末尾 → workflow_completed
 *   - 关键节点 → awaiting_user + isPaused=true
 *   - 普通步骤成功 → step_completed + 推进
 *   - 步骤失败 → step_failed + retake-protocol
 *   - 预算耗尽 → budget_exhausted + isPaused=true
 * - confirmUser：awaiting_user → completed + 推进
 * - abort：触发 workflow_aborted
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { AutoPipeline } from "../auto-pipeline";
import type { StepExecutor, EventCallback } from "../auto-pipeline";
import type { PipelineStep, WorkflowEvent } from "../../domain/workflow-mode";

describe("AutoPipeline", () => {
  let pipeline: AutoPipeline;

  // 测试用步骤定义
  const makeSteps = (): PipelineStep[] => [
    { id: "step1", name: "Step 1", status: "pending", isCriticalNode: false },
    { id: "step2", name: "Step 2 (Critical)", status: "pending", isCriticalNode: true },
    { id: "step3", name: "Step 3", status: "pending", isCriticalNode: false },
  ];

  beforeEach(() => {
    pipeline = new AutoPipeline();
  });

  // ==========================================================================
  // createInitialState
  // ==========================================================================
  describe("createInitialState", () => {
    it("创建初始状态：mode=full-auto, 所有步骤 pending, isPaused=false", () => {
      const steps = makeSteps();
      const state = pipeline.createInitialState(steps, 3);
      expect(state.mode).toBe("full-auto");
      expect(state.currentStepIdx).toBe(0);
      expect(state.isRunning).toBe(false);
      expect(state.isPaused).toBe(false);
      expect(state.globalAttemptBudget).toBe(3);
      expect(state.steps).toHaveLength(3);
      expect(state.steps.every((s) => s.status === "pending")).toBe(true);
    });

    it("默认 attemptBudget=3", () => {
      const state = pipeline.createInitialState(makeSteps());
      expect(state.globalAttemptBudget).toBe(3);
    });
  });

  // ==========================================================================
  // shouldPauseAt
  // ==========================================================================
  describe("shouldPauseAt", () => {
    it("full-auto + isCriticalNode=true → true", () => {
      const step: PipelineStep = {
        id: "x",
        name: "X",
        status: "pending",
        isCriticalNode: true,
      };
      expect(pipeline.shouldPauseAt(step, "full-auto")).toBe(true);
    });

    it("full-auto + isCriticalNode=false → false", () => {
      const step: PipelineStep = {
        id: "x",
        name: "X",
        status: "pending",
        isCriticalNode: false,
      };
      expect(pipeline.shouldPauseAt(step, "full-auto")).toBe(false);
    });
  });

  // ==========================================================================
  // runNext — 已到达末尾
  // ==========================================================================
  describe("runNext — 已到达末尾", () => {
    it("currentStepIdx >= steps.length → emit workflow_completed", async () => {
      const events: WorkflowEvent[] = [];
      const onEvent: EventCallback = (e) => events.push(e);
      const state = pipeline.createInitialState(makeSteps(), 3);
      const endState = { ...state, currentStepIdx: state.steps.length };

      const executor: StepExecutor = vi.fn();
      const newState = await pipeline.runNext(endState, executor, onEvent);

      expect(newState.isRunning).toBe(false);
      expect(newState.isPaused).toBe(false);
      expect(events).toEqual([{ type: "workflow_completed" }]);
      expect(executor).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // runNext — 关键节点暂停
  // ==========================================================================
  describe("runNext — 关键节点暂停", () => {
    it("遇到 isCriticalNode=true → awaiting_user + isPaused=true", async () => {
      const events: WorkflowEvent[] = [];
      const onEvent: EventCallback = (e) => events.push(e);
      const state = pipeline.createInitialState(makeSteps(), 3);

      // 第一个 step 是非 critical，跳过它直接到 step2（critical）
      const skipState = { ...state, currentStepIdx: 1 };

      const executor: StepExecutor = vi.fn();
      const newState = await pipeline.runNext(skipState, executor, onEvent);

      expect(newState.isPaused).toBe(true);
      expect(newState.isRunning).toBe(false);
      expect(newState.steps[1].status).toBe("awaiting_user");
      expect(events).toContainEqual({
        type: "awaiting_user",
        stepId: "step2",
        reason: "critical_node",
      });
      expect(executor).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // runNext — 普通步骤成功
  // ==========================================================================
  describe("runNext — 普通步骤成功", () => {
    it("成功执行 → step_completed + currentStepIdx+1", async () => {
      const events: WorkflowEvent[] = [];
      const onEvent: EventCallback = (e) => events.push(e);
      const state = pipeline.createInitialState(makeSteps(), 3);

      const executor: StepExecutor = vi.fn().mockResolvedValue("result-data");
      const newState = await pipeline.runNext(state, executor, onEvent);

      expect(newState.currentStepIdx).toBe(1);
      expect(newState.isRunning).toBe(true);
      expect(newState.isPaused).toBe(false);
      expect(newState.steps[0].status).toBe("completed");
      expect(newState.steps[0].result).toBe("result-data");
      expect(events).toContainEqual({
        type: "step_started",
        stepId: "step1",
      });
      expect(events).toContainEqual({
        type: "step_completed",
        stepId: "step1",
        result: "result-data",
      });
    });
  });

  // ==========================================================================
  // runNext — 步骤失败
  // ==========================================================================
  describe("runNext — 步骤失败", () => {
    it("失败 → step_failed + retake-protocol 触发 + 推进", async () => {
      const events: WorkflowEvent[] = [];
      const onEvent: EventCallback = (e) => events.push(e);
      const state = pipeline.createInitialState(makeSteps(), 3);

      const executor: StepExecutor = vi.fn().mockRejectedValue(new Error("AI 失败"));
      const newState = await pipeline.runNext(state, executor, onEvent);

      expect(newState.steps[0].status).toBe("failed");
      expect(newState.steps[0].error).toBe("AI 失败");
      expect(newState.steps[0].retakeVerdict).toBeDefined();
      // auto-pipeline 失败时默认 score=50 → retake_single_var（50 是 retake_single_var 的边界值）
      expect(newState.steps[0].retakeVerdict?.verdict).toBe("retake_single_var");
      expect(newState.globalAttemptBudget).toBe(2); // 消耗 1 次

      const failedEvent = events.find((e) => e.type === "step_failed");
      expect(failedEvent).toBeDefined();
      expect(failedEvent).toMatchObject({
        type: "step_failed",
        stepId: "step1",
        error: "AI 失败",
      });
    });

    it("预算耗尽 → budget_exhausted + isPaused=true", async () => {
      const events: WorkflowEvent[] = [];
      const onEvent: EventCallback = (e) => events.push(e);
      const state = pipeline.createInitialState(makeSteps(), 0); // 预算耗尽

      const executor: StepExecutor = vi.fn().mockRejectedValue(new Error("AI 失败"));
      const newState = await pipeline.runNext(state, executor, onEvent);

      // 预算耗尽 → 强制 replan → requiresUserIntervention=true
      expect(newState.isPaused).toBe(true);
      expect(newState.isRunning).toBe(false);
      expect(newState.steps[0].retakeVerdict?.verdict).toBe("replan");
      expect(events.find((e) => e.type === "budget_exhausted")).toBeDefined();
    });
  });

  // ==========================================================================
  // confirmUser
  // ==========================================================================
  describe("confirmUser", () => {
    it("awaiting_user → completed + 推进", () => {
      const events: WorkflowEvent[] = [];
      const onEvent: EventCallback = (e) => events.push(e);
      // 构造 awaiting_user 状态
      const state = pipeline.createInitialState(makeSteps(), 3);
      state.steps[1] = { ...state.steps[1], status: "awaiting_user" };
      const awaitingState = { ...state, currentStepIdx: 1, isPaused: true };

      const newState = pipeline.confirmUser(awaitingState, onEvent);

      expect(newState.steps[1].status).toBe("completed");
      expect(newState.currentStepIdx).toBe(2);
      expect(newState.isPaused).toBe(false);
      expect(newState.isRunning).toBe(true);
      expect(events).toContainEqual({
        type: "user_confirmed",
        stepId: "step2",
      });
    });

    it("非 awaiting_user 状态 → 不变", () => {
      const state = pipeline.createInitialState(makeSteps(), 3);
      // step0 status=pending，不是 awaiting_user
      const newState = pipeline.confirmUser(state);
      expect(newState).toBe(state);
    });
  });

  // ==========================================================================
  // abort
  // ==========================================================================
  describe("abort", () => {
    it("触发 workflow_aborted 并停止", () => {
      const events: WorkflowEvent[] = [];
      const onEvent: EventCallback = (e) => events.push(e);
      const state = pipeline.createInitialState(makeSteps(), 3);
      const runningState = { ...state, isRunning: true };

      const newState = pipeline.abort(runningState, "用户取消", onEvent);

      expect(newState.isRunning).toBe(false);
      expect(newState.isPaused).toBe(false);
      expect(events).toContainEqual({
        type: "workflow_aborted",
        reason: "用户取消",
      });
    });
  });
});
