/**
 * Task 2A.19 — SemiPipeline 单元测试
 *
 * 测试覆盖：
 * - createInitialState：初始状态正确（mode=semi-auto）
 * - shouldPauseAt：始终返回 true
 * - runNext：
 *   - 已到达末尾 → workflow_completed
 *   - 成功 → awaiting_edit + isPaused=true（不推进 currentStepIdx）
 *   - 失败 → step_failed + isPaused=true
 *   - 预算耗尽 → budget_exhausted
 * - applyEdit：awaiting_edit → completed + 推进
 * - skipCurrent：当前步骤 → skipped + 推进
 * - abort
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { SemiPipeline } from "../semi-pipeline";
import type { StepExecutor, EventCallback } from "../auto-pipeline";
import type { PipelineStep, WorkflowEvent } from "../../domain/workflow-mode";

describe("SemiPipeline", () => {
  let pipeline: SemiPipeline;

  const makeSteps = (): PipelineStep[] => [
    { id: "step1", name: "Step 1", status: "pending", isCriticalNode: false },
    { id: "step2", name: "Step 2", status: "pending", isCriticalNode: true },
  ];

  beforeEach(() => {
    pipeline = new SemiPipeline();
  });

  // ==========================================================================
  // createInitialState
  // ==========================================================================
  describe("createInitialState", () => {
    it("初始状态 mode=semi-auto, 所有步骤 pending", () => {
      const state = pipeline.createInitialState(makeSteps(), 3);
      expect(state.mode).toBe("semi-auto");
      expect(state.currentStepIdx).toBe(0);
      expect(state.isPaused).toBe(false);
      expect(state.globalAttemptBudget).toBe(3);
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
    it("isCriticalNode=false → 仍然 true（semi-auto 所有步骤都暂停）", () => {
      const step: PipelineStep = {
        id: "x",
        name: "X",
        status: "pending",
        isCriticalNode: false,
      };
      expect(pipeline.shouldPauseAt(step, "semi-auto")).toBe(true);
    });

    it("isCriticalNode=true → 仍然 true", () => {
      const step: PipelineStep = {
        id: "x",
        name: "X",
        status: "pending",
        isCriticalNode: true,
      };
      expect(pipeline.shouldPauseAt(step, "semi-auto")).toBe(true);
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
      expect(events).toEqual([{ type: "workflow_completed" }]);
      expect(executor).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // runNext — 成功后暂停等待编辑
  // ==========================================================================
  describe("runNext — 成功后暂停", () => {
    it("成功执行 → awaiting_edit + isPaused=true + 不推进 currentStepIdx", async () => {
      const events: WorkflowEvent[] = [];
      const onEvent: EventCallback = (e) => events.push(e);
      const state = pipeline.createInitialState(makeSteps(), 3);

      const executor: StepExecutor = vi.fn().mockResolvedValue("result");
      const newState = await pipeline.runNext(state, executor, onEvent);

      expect(newState.currentStepIdx).toBe(0); // 不推进
      expect(newState.isPaused).toBe(true);
      expect(newState.isRunning).toBe(false);
      expect(newState.steps[0].status).toBe("awaiting_edit");
      expect(newState.steps[0].result).toBe("result");
      expect(events).toContainEqual({
        type: "awaiting_user",
        stepId: "step1",
        reason: "edit_required",
      });
    });
  });

  // ==========================================================================
  // runNext — 失败
  // ==========================================================================
  describe("runNext — 失败", () => {
    it("失败 → step_failed + isPaused=true + 不推进", async () => {
      const events: WorkflowEvent[] = [];
      const onEvent: EventCallback = (e) => events.push(e);
      const state = pipeline.createInitialState(makeSteps(), 3);

      const executor: StepExecutor = vi.fn().mockRejectedValue(new Error("失败"));
      const newState = await pipeline.runNext(state, executor, onEvent);

      expect(newState.currentStepIdx).toBe(0); // 不推进
      expect(newState.isPaused).toBe(true);
      expect(newState.steps[0].status).toBe("failed");
      expect(newState.steps[0].error).toBe("失败");
      expect(newState.steps[0].retakeVerdict).toBeDefined();
      expect(newState.globalAttemptBudget).toBe(2); // 消耗 1 次
      expect(events.find((e) => e.type === "step_failed")).toBeDefined();
    });

    it("预算耗尽 → budget_exhausted + verdict=replan", async () => {
      const events: WorkflowEvent[] = [];
      const onEvent: EventCallback = (e) => events.push(e);
      const state = pipeline.createInitialState(makeSteps(), 0);

      const executor: StepExecutor = vi.fn().mockRejectedValue(new Error("失败"));
      const newState = await pipeline.runNext(state, executor, onEvent);

      expect(newState.isPaused).toBe(true);
      expect(newState.steps[0].retakeVerdict?.verdict).toBe("replan");
      expect(events.find((e) => e.type === "budget_exhausted")).toBeDefined();
    });
  });

  // ==========================================================================
  // applyEdit
  // ==========================================================================
  describe("applyEdit", () => {
    it("awaiting_edit → completed + 推进 + emit user_edited", () => {
      const events: WorkflowEvent[] = [];
      const onEvent: EventCallback = (e) => events.push(e);
      const state = pipeline.createInitialState(makeSteps(), 3);
      state.steps[0] = { ...state.steps[0], status: "awaiting_edit" };
      const editState = { ...state, isPaused: true };

      const newState = pipeline.applyEdit(editState, { foo: "bar" }, onEvent);

      expect(newState.steps[0].status).toBe("completed");
      expect(newState.currentStepIdx).toBe(1);
      expect(newState.isPaused).toBe(false);
      expect(newState.isRunning).toBe(true);
      expect(events).toContainEqual({
        type: "user_edited",
        stepId: "step1",
        edits: { foo: "bar" },
      });
    });

    it("非 awaiting_edit 状态 → 不变", () => {
      const state = pipeline.createInitialState(makeSteps(), 3);
      // step0 status=pending
      const newState = pipeline.applyEdit(state);
      expect(newState).toBe(state);
    });
  });

  // ==========================================================================
  // skipCurrent
  // ==========================================================================
  describe("skipCurrent", () => {
    it("当前步骤 → skipped + 推进", () => {
      const events: WorkflowEvent[] = [];
      const onEvent: EventCallback = (e) => events.push(e);
      const state = pipeline.createInitialState(makeSteps(), 3);

      const newState = pipeline.skipCurrent(state, onEvent);

      expect(newState.steps[0].status).toBe("skipped");
      expect(newState.currentStepIdx).toBe(1);
      expect(newState.isPaused).toBe(false);
      expect(newState.isRunning).toBe(true);
      expect(events).toContainEqual({
        type: "user_confirmed",
        stepId: "step1",
      });
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
