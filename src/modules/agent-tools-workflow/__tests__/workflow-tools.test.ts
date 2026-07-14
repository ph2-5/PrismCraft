/**
 * Workflow Tools 单元测试
 *
 * 5 个工作流工具的关键路径测试：
 * - create_workflow：创建工作流并持久化
 * - execute_workflow：执行已定义工作流
 * - batch_process：批量执行同一操作
 * - chain_operations：链式执行（A → B → C）
 * - schedule_task：定时任务（优雅降级）
 *
 * Mock 策略：
 * - toolExecutor（execute）
 * - toolRegistry（has）
 * - getConfig / setConfig（@/shared/file-http）
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  toolExecutor: { execute: vi.fn() },
  toolRegistry: { has: vi.fn() },
  getConfig: vi.fn(),
  setConfig: vi.fn(),
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    agentToolExecutor: Promise.resolve(mocks.toolExecutor),
    agentToolRegistry: Promise.resolve(mocks.toolRegistry),
  },
}));

vi.mock("@/shared/file-http", () => ({
  getConfig: mocks.getConfig,
  setConfig: mocks.setConfig,
}));

import {
  createWorkflowTool,
  executeWorkflowTool,
  batchProcessTool,
  chainOperationsTool,
  scheduleTaskTool,
} from "../workflow-tools";
import type { ToolContext } from "@/domain/types/agent-tools";

function makeCtx(): ToolContext {
  return {
    sessionId: "test-session",
    onProgress: vi.fn(),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.toolRegistry.has.mockReturnValue(true);
  mocks.toolExecutor.execute.mockResolvedValue({ success: true, data: {} });
  mocks.getConfig.mockResolvedValue(null);
  mocks.setConfig.mockResolvedValue(undefined);
});

// ============================================================
// 1. create_workflow
// ============================================================
describe("create_workflow", () => {
  const validSteps = [
    { toolName: "tool_a", args: { x: 1 } },
    { toolName: "tool_b", args: { y: 2 }, name: "step2" },
  ];

  it("1. 正常创建工作流并持久化", async () => {
    const result = await createWorkflowTool.execute(
      { name: "wf1", description: "测试工作流", steps: validSteps },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { workflowName: string; stepCount: number; created: boolean };
    expect(data.workflowName).toBe("wf1");
    expect(data.stepCount).toBe(2);
    expect(data.created).toBe(true);
    expect(mocks.setConfig).toHaveBeenCalledWith(
      "agent.workflows",
      expect.objectContaining({
        wf1: expect.objectContaining({
          name: "wf1",
          description: "测试工作流",
          steps: validSteps,
          createdAt: expect.any(Number),
        }),
      }),
    );
  });

  it("2. steps 为空数组时返回错误", async () => {
    const result = await createWorkflowTool.execute(
      { name: "wf1", description: "测试", steps: [] },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("steps 必须是非空数组");
    expect(mocks.setConfig).not.toHaveBeenCalled();
  });

  it("3. steps 缺失时返回错误", async () => {
    const result = await createWorkflowTool.execute(
      { name: "wf1", description: "测试" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("steps 必须是非空数组");
  });

  it("4. 步骤 toolName 在 registry 中不存在时返回错误", async () => {
    mocks.toolRegistry.has.mockReturnValue(false);

    const result = await createWorkflowTool.execute(
      { name: "wf1", description: "测试", steps: validSteps },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("tool_a");
    expect(result.error).toContain("不存在");
    expect(mocks.setConfig).not.toHaveBeenCalled();
  });

  it("5. 步骤 args 非对象时返回错误", async () => {
    const result = await createWorkflowTool.execute(
      {
        name: "wf1",
        description: "测试",
        steps: [{ toolName: "tool_a", args: "not_object" }],
      },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("args 必须是对象");
  });

  it("6. setConfig 失败时返回错误", async () => {
    mocks.setConfig.mockRejectedValue(new Error("磁盘已满"));

    const result = await createWorkflowTool.execute(
      { name: "wf1", description: "测试", steps: validSteps },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("保存工作流失败");
    expect(result.error).toContain("磁盘已满");
  });

  it("7. 已存在工作流时合并到现有 workflows", async () => {
    mocks.getConfig.mockResolvedValue({
      existing_wf: { name: "existing_wf", description: "旧", steps: [], createdAt: 1 },
    });

    const result = await createWorkflowTool.execute(
      { name: "wf1", description: "新", steps: validSteps },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    expect(mocks.setConfig).toHaveBeenCalledWith(
      "agent.workflows",
      expect.objectContaining({
        existing_wf: expect.any(Object),
        wf1: expect.any(Object),
      }),
    );
  });
});

// ============================================================
// 2. execute_workflow
// ============================================================
describe("execute_workflow", () => {
  it("8. 工作流不存在时返回错误", async () => {
    mocks.getConfig.mockResolvedValue(null);

    const result = await executeWorkflowTool.execute({ name: "missing" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("missing");
    expect(result.error).toContain("不存在");
  });

  it("9. getConfig 失败时返回错误", async () => {
    mocks.getConfig.mockRejectedValue(new Error("config IO error"));

    const result = await executeWorkflowTool.execute({ name: "wf1" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("加载工作流失败");
    expect(result.error).toContain("config IO error");
  });

  it("10. 正常执行多步工作流", async () => {
    mocks.getConfig.mockResolvedValue({
      wf1: {
        name: "wf1",
        description: "测试",
        steps: [
          { toolName: "tool_a", args: { x: 1 } },
          { toolName: "tool_b", args: { y: 2 } },
        ],
        createdAt: 1,
      },
    });
    mocks.toolExecutor.execute
      .mockResolvedValueOnce({ success: true, data: { id: "step1_result" } })
      .mockResolvedValueOnce({ success: true, data: { id: "step2_result" } });

    const result = await executeWorkflowTool.execute({ name: "wf1" }, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as {
      totalSteps: number;
      executedSteps: number;
      results: Array<{ success: boolean; data?: unknown }>;
    };
    expect(data.totalSteps).toBe(2);
    expect(data.executedSteps).toBe(2);
    expect(data.results).toHaveLength(2);
    expect(mocks.toolExecutor.execute).toHaveBeenCalledTimes(2);
  });

  it("11. 步骤失败时默认停止后续执行", async () => {
    mocks.getConfig.mockResolvedValue({
      wf1: {
        name: "wf1",
        description: "测试",
        steps: [
          { toolName: "tool_a", args: {} },
          { toolName: "tool_b", args: {} },
          { toolName: "tool_c", args: {} },
        ],
        createdAt: 1,
      },
    });
    mocks.toolExecutor.execute
      .mockResolvedValueOnce({ success: true, data: {} })
      .mockResolvedValueOnce({ success: false, error: "第二步失败" });

    const result = await executeWorkflowTool.execute({ name: "wf1" }, makeCtx());

    expect(result.success).toBe(false);
    const data = result.data as { executedSteps: number; totalSteps: number };
    expect(data.executedSteps).toBe(2);
    expect(data.totalSteps).toBe(3);
    expect(mocks.toolExecutor.execute).toHaveBeenCalledTimes(2);
  });

  it("12. stopOnError=false 时失败后继续执行", async () => {
    mocks.getConfig.mockResolvedValue({
      wf1: {
        name: "wf1",
        description: "测试",
        steps: [
          { toolName: "tool_a", args: {} },
          { toolName: "tool_b", args: {} },
        ],
        createdAt: 1,
      },
    });
    mocks.toolExecutor.execute
      .mockResolvedValueOnce({ success: false, error: "失败" })
      .mockResolvedValueOnce({ success: true, data: {} });

    const result = await executeWorkflowTool.execute(
      { name: "wf1", stopOnError: false },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(mocks.toolExecutor.execute).toHaveBeenCalledTimes(2);
  });

  it("13. 条件不满足时跳过步骤", async () => {
    mocks.getConfig.mockResolvedValue({
      wf1: {
        name: "wf1",
        description: "测试",
        steps: [
          { toolName: "tool_a", args: {}, name: "step1" },
          {
            toolName: "tool_b",
            args: {},
            name: "step2",
            condition: "$step1.success == false",
          },
        ],
        createdAt: 1,
      },
    });
    mocks.toolExecutor.execute.mockResolvedValue({ success: true, data: {} });

    const result = await executeWorkflowTool.execute({ name: "wf1" }, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as {
      results: Array<{ data?: { skipped?: boolean; reason?: string } }>;
    };
    expect(data.results[1].data).toEqual(
      expect.objectContaining({ skipped: true, reason: "条件不满足" }),
    );
    expect(mocks.toolExecutor.execute).toHaveBeenCalledTimes(1);
  });

  it("14. inputArgs 通过 $input 引用传递给步骤参数", async () => {
    mocks.getConfig.mockResolvedValue({
      wf1: {
        name: "wf1",
        description: "测试",
        steps: [
          { toolName: "tool_a", args: { userId: "$input.userId" } },
        ],
        createdAt: 1,
      },
    });
    mocks.toolExecutor.execute.mockResolvedValue({ success: true, data: {} });

    const result = await executeWorkflowTool.execute(
      { name: "wf1", inputArgs: { userId: "u_123" } },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const callArgs = JSON.parse(
      mocks.toolExecutor.execute.mock.calls[0][0].function.arguments,
    );
    expect(callArgs.userId).toBe("u_123");
  });
});

// ============================================================
// 3. batch_process
// ============================================================
describe("batch_process", () => {
  it("15. 批量执行成功汇总", async () => {
    mocks.toolExecutor.execute
      .mockResolvedValueOnce({ success: true, data: { id: 1 } })
      .mockResolvedValueOnce({ success: true, data: { id: 2 } });

    const result = await batchProcessTool.execute(
      {
        toolName: "tool_a",
        batchArgs: [{ x: 1 }, { x: 2 }],
      },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      total: number;
      successCount: number;
      failedCount: number;
    };
    expect(data.total).toBe(2);
    expect(data.successCount).toBe(2);
    expect(data.failedCount).toBe(0);
  });

  it("16. batchArgs 为空数组时返回错误", async () => {
    const result = await batchProcessTool.execute(
      { toolName: "tool_a", batchArgs: [] },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("batchArgs 必须是非空数组");
    expect(mocks.toolExecutor.execute).not.toHaveBeenCalled();
  });

  it("17. toolName 不存在时返回错误", async () => {
    mocks.toolRegistry.has.mockReturnValue(false);

    const result = await batchProcessTool.execute(
      { toolName: "missing_tool", batchArgs: [{}] },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("missing_tool");
    expect(result.error).toContain("不存在");
  });

  it("18. 部分失败默认不停止后续", async () => {
    mocks.toolExecutor.execute
      .mockResolvedValueOnce({ success: false, error: "失败1" })
      .mockResolvedValueOnce({ success: true, data: {} })
      .mockResolvedValueOnce({ success: false, error: "失败2" });

    const result = await batchProcessTool.execute(
      { toolName: "tool_a", batchArgs: [{}, {}, {}] },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    const data = result.data as { successCount: number; failedCount: number };
    expect(data.successCount).toBe(1);
    expect(data.failedCount).toBe(2);
    expect(mocks.toolExecutor.execute).toHaveBeenCalledTimes(3);
  });

  it("19. stopOnError=true 时遇到失败立即停止", async () => {
    mocks.toolExecutor.execute
      .mockResolvedValueOnce({ success: true, data: {} })
      .mockResolvedValueOnce({ success: false, error: "失败" });

    const result = await batchProcessTool.execute(
      { toolName: "tool_a", batchArgs: [{}, {}, {}], stopOnError: true },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    const data = result.data as { successCount: number; failedCount: number };
    expect(data.successCount).toBe(1);
    expect(data.failedCount).toBe(1);
    expect(mocks.toolExecutor.execute).toHaveBeenCalledTimes(2);
  });

  it("20. 单个参数非对象时记录失败并跳过", async () => {
    const result = await batchProcessTool.execute(
      { toolName: "tool_a", batchArgs: ["not_object"] },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    const data = result.data as {
      failedCount: number;
      results: Array<{ index: number; success: boolean; error: string }>;
    };
    expect(data.failedCount).toBe(1);
    expect(data.results[0].error).toContain("参数必须是对象");
    expect(mocks.toolExecutor.execute).not.toHaveBeenCalled();
  });
});

// ============================================================
// 4. chain_operations
// ============================================================
describe("chain_operations", () => {
  it("21. 链式执行多步并通过 inputMapping 传递结果", async () => {
    mocks.toolExecutor.execute
      .mockResolvedValueOnce({ success: true, data: { id: "abc" } })
      .mockResolvedValueOnce({ success: true, data: { url: "https://x.png" } });

    const result = await chainOperationsTool.execute(
      {
        operations: [
          { toolName: "tool_a", args: { x: 1 } },
          {
            toolName: "tool_b",
            args: {},
            inputMapping: { id: "$prev.data.id" },
          },
        ],
      },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { totalSteps: number; executedSteps: number };
    expect(data.totalSteps).toBe(2);
    expect(data.executedSteps).toBe(2);
    const secondCallArgs = JSON.parse(
      mocks.toolExecutor.execute.mock.calls[1][0].function.arguments,
    );
    expect(secondCallArgs.id).toBe("abc");
  });

  it("22. operations 为空数组时返回错误", async () => {
    const result = await chainOperationsTool.execute(
      { operations: [] },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("operations 必须是非空数组");
    expect(mocks.toolExecutor.execute).not.toHaveBeenCalled();
  });

  it("23. 操作 toolName 在 registry 中不存在时返回错误", async () => {
    mocks.toolRegistry.has.mockReturnValue(false);

    const result = await chainOperationsTool.execute(
      { operations: [{ toolName: "missing", args: {} }] },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("missing");
    expect(result.error).toContain("不存在");
  });

  it("24. 操作 args 非对象时返回错误", async () => {
    const result = await chainOperationsTool.execute(
      { operations: [{ toolName: "tool_a", args: null }] },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("args 必须是对象");
  });

  it("25. 链式执行中失败立即停止后续步骤", async () => {
    mocks.toolExecutor.execute.mockResolvedValueOnce({
      success: false,
      error: "第一步失败",
    });

    const result = await chainOperationsTool.execute(
      {
        operations: [
          { toolName: "tool_a", args: {} },
          { toolName: "tool_b", args: {} },
        ],
      },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    const data = result.data as { executedSteps: number; totalSteps: number };
    expect(data.executedSteps).toBe(1);
    expect(data.totalSteps).toBe(2);
    expect(mocks.toolExecutor.execute).toHaveBeenCalledTimes(1);
  });

  it("26. 单步操作 inputMapping 不应用（仅第二步生效）", async () => {
    mocks.toolExecutor.execute.mockResolvedValue({ success: true, data: {} });

    const result = await chainOperationsTool.execute(
      {
        operations: [
          {
            toolName: "tool_a",
            args: { x: 1 },
            inputMapping: { y: "$prev.data.z" },
          },
        ],
      },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const callArgs = JSON.parse(
      mocks.toolExecutor.execute.mock.calls[0][0].function.arguments,
    );
    expect(callArgs.x).toBe(1);
    expect(callArgs.y).toBeUndefined();
  });
});

// ============================================================
// 5. schedule_task
// ============================================================
describe("schedule_task", () => {
  it("27. 正常创建定时任务并持久化", async () => {
    const result = await scheduleTaskTool.execute(
      {
        taskName: "daily_report",
        cronExpression: "0 8 * * *",
        action: { toolName: "tool_a", args: { x: 1 } },
      },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      scheduled: boolean;
      taskName: string;
      cronExpression: string;
      note: string;
    };
    expect(data.scheduled).toBe(true);
    expect(data.taskName).toBe("daily_report");
    expect(data.cronExpression).toBe("0 8 * * *");
    expect(data.note).toContain("定时任务已保存");
    expect(mocks.setConfig).toHaveBeenCalledWith(
      "agent.scheduledTasks",
      expect.objectContaining({
        daily_report: expect.objectContaining({
          taskName: "daily_report",
          cronExpression: "0 8 * * *",
          enabled: true,
        }),
      }),
    );
  });

  it("28. action 缺失时返回错误", async () => {
    const result = await scheduleTaskTool.execute(
      {
        taskName: "t",
        cronExpression: "0 8 * * *",
      },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("action 必须是对象");
    expect(mocks.setConfig).not.toHaveBeenCalled();
  });

  it("29. action.toolName 缺失时返回错误", async () => {
    const result = await scheduleTaskTool.execute(
      {
        taskName: "t",
        cronExpression: "0 8 * * *",
        action: { args: {} },
      },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("action.toolName 必须是字符串");
  });

  it("30. action.toolName 在 registry 中不存在时返回错误", async () => {
    mocks.toolRegistry.has.mockReturnValue(false);

    const result = await scheduleTaskTool.execute(
      {
        taskName: "t",
        cronExpression: "0 8 * * *",
        action: { toolName: "missing_tool", args: {} },
      },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("missing_tool");
    expect(result.error).toContain("不存在");
  });

  it("31. enabled=false 时保存但禁用", async () => {
    const result = await scheduleTaskTool.execute(
      {
        taskName: "t",
        cronExpression: "0 8 * * *",
        action: { toolName: "tool_a", args: {} },
        enabled: false,
      },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    expect(mocks.setConfig).toHaveBeenCalledWith(
      "agent.scheduledTasks",
      expect.objectContaining({
        t: expect.objectContaining({ enabled: false }),
      }),
    );
  });

  it("32. setConfig 失败时返回错误", async () => {
    mocks.setConfig.mockRejectedValue(new Error("config write failed"));

    const result = await scheduleTaskTool.execute(
      {
        taskName: "t",
        cronExpression: "0 8 * * *",
        action: { toolName: "tool_a", args: {} },
      },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("保存定时任务失败");
    expect(result.error).toContain("config write failed");
  });
});
