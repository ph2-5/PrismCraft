/**
 * Video Tools 单元测试
 *
 * 测试 7 个视频任务管理工具：
 * - create_video_task：创建视频生成任务
 * - list_video_tasks：查询任务列表（支持状态/故事过滤 + 分页）
 * - get_video_task：获取任务详情
 * - query_video_status：向 provider 实时查询状态并同步本地存储
 * - cancel_video_task：取消任务（需用户确认）
 * - recover_video_task：恢复失败/超时任务（可选重新提交）
 * - batch_create_video_tasks：批量创建任务
 *
 * Mock 策略：
 * - container.videoProvider / container.videoTaskStorage
 * - TOOL_TIMEOUTS 常量
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  videoProvider: {
    generateVideoWithFrames: vi.fn(),
    queryVideoStatus: vi.fn(),
    cancelTask: vi.fn(),
  },
  videoTaskStorage: {
    createVideoTask: vi.fn(),
    getVideoTaskById: vi.fn(),
    getVideoTasks: vi.fn(),
    getVideoTasksByStatus: vi.fn(),
    getVideoTasksByStory: vi.fn(),
    updateVideoTask: vi.fn(),
  },
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    videoProvider: mocks.videoProvider,
    videoTaskStorage: mocks.videoTaskStorage,
  },
}));

vi.mock("@/shared/constants/tool-timeouts", () => ({
  TOOL_TIMEOUTS: {
    query: 30_000,
    mutation: 60_000,
    generation: 300_000,
    videoTask: 1_800_000,
    download: 600_000,
  },
}));

import {
  createVideoTaskTool,
  listVideoTasksTool,
  getVideoTaskTool,
  queryVideoStatusTool,
  cancelVideoTaskTool,
  recoverVideoTaskTool,
  batchCreateVideoTasksTool,
  videoTools,
} from "../video-tools";
import type { ToolContext } from "@/domain/types/agent-tools";

function makeCtx(): ToolContext {
  return {
    sessionId: "test-session",
    onProgress: vi.fn(),
  };
}

/** 构造 VideoTask mock 对象 */
function makeTask(overrides?: Record<string, unknown>) {
  return {
    taskId: "task_1",
    status: "pending",
    progress: 0,
    message: "任务已提交",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    prompt: "测试提示词",
    fixedImageUrl: undefined,
    providerId: "provider_1",
    providerModelId: "model_1",
    providerFormat: "openai",
    storyId: undefined,
    beatId: undefined,
    parameters: undefined,
    recoveryAttempts: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ============================================================
// 1. create_video_task
// ============================================================
describe("create_video_task", () => {
  it("1. prompt 为空时返回失败", async () => {
    const result = await createVideoTaskTool.execute({ prompt: "   " }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("prompt 不能为空");
    expect(mocks.videoProvider.generateVideoWithFrames).not.toHaveBeenCalled();
  });

  it("2. 正常流程：调用 provider + 持久化任务", async () => {
    mocks.videoProvider.generateVideoWithFrames.mockResolvedValue({
      success: true,
      data: {
        taskId: "task_new",
        status: "pending",
        providerId: "p1",
        providerModelId: "m1",
        videoUrl: undefined,
      },
    });
    mocks.videoTaskStorage.createVideoTask.mockResolvedValue(undefined);

    const result = await createVideoTaskTool.execute(
      { prompt: "测试视频", firstFrameUrl: "https://img.png", duration: 10 },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { taskId: string; status: string };
    expect(data.taskId).toBe("task_new");
    expect(data.status).toBe("pending");
    // 验证 provider 调用参数
    expect(mocks.videoProvider.generateVideoWithFrames).toHaveBeenCalledTimes(1);
    const callArgs = mocks.videoProvider.generateVideoWithFrames.mock.calls[0][0];
    expect(callArgs.prompt).toBe("测试视频");
    expect(callArgs.firstFrameUrl).toBe("https://img.png");
    expect(callArgs.duration).toBe(10);
    // 验证存储调用
    expect(mocks.videoTaskStorage.createVideoTask).toHaveBeenCalledTimes(1);
    const stored = mocks.videoTaskStorage.createVideoTask.mock.calls[0][0];
    expect(stored.taskId).toBe("task_new");
    expect(stored.fixedImageUrl).toBe("https://img.png");
    expect(stored.parameters.duration).toBe(10);
  });

  it("3. provider 返回失败时返回错误", async () => {
    mocks.videoProvider.generateVideoWithFrames.mockResolvedValue({
      success: false,
      error: "API 限流",
    });

    const result = await createVideoTaskTool.execute({ prompt: "测试" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("API 限流");
    expect(mocks.videoTaskStorage.createVideoTask).not.toHaveBeenCalled();
  });

  it("4. provider 未返回 taskId 时失败", async () => {
    mocks.videoProvider.generateVideoWithFrames.mockResolvedValue({
      success: true,
      data: { taskId: "", status: "pending" },
    });

    const result = await createVideoTaskTool.execute({ prompt: "测试" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("provider 未返回 taskId");
  });

  it("5. 持久化失败但任务已提交，返回成功 + 警告", async () => {
    mocks.videoProvider.generateVideoWithFrames.mockResolvedValue({
      success: true,
      data: { taskId: "task_x", status: "pending" },
    });
    mocks.videoTaskStorage.createVideoTask.mockRejectedValue(new Error("DB locked"));

    const result = await createVideoTaskTool.execute({ prompt: "测试" }, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as { taskId: string; warning: string };
    expect(data.taskId).toBe("task_x");
    expect(data.warning).toContain("本地存储失败");
    expect(data.warning).toContain("DB locked");
  });
});

// ============================================================
// 2. list_video_tasks
// ============================================================
describe("list_video_tasks", () => {
  it("6. 默认查询所有任务并按 createdAt 倒序", async () => {
    const tasks = [
      makeTask({ taskId: "t1", createdAt: "2026-01-01T00:00:00.000Z" }),
      makeTask({ taskId: "t2", createdAt: "2026-01-02T00:00:00.000Z" }),
    ];
    mocks.videoTaskStorage.getVideoTasks.mockResolvedValue(tasks);

    const result = await listVideoTasksTool.execute({}, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as {
      total: number;
      items: Array<{ taskId: string }>;
    };
    expect(data.total).toBe(2);
    // 倒序：t2 在前
    expect(data.items[0].taskId).toBe("t2");
    expect(data.items[1].taskId).toBe("t1");
  });

  it("7. 按 storyId 过滤并按状态二次过滤", async () => {
    const tasks = [
      makeTask({ taskId: "t1", storyId: "s1", status: "completed" }),
      makeTask({ taskId: "t2", storyId: "s1", status: "failed" }),
    ];
    mocks.videoTaskStorage.getVideoTasksByStory.mockResolvedValue(tasks);

    const result = await listVideoTasksTool.execute(
      { storyId: "s1", status: "failed" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      total: number;
      items: Array<{ taskId: string; status: string }>;
    };
    expect(data.total).toBe(1);
    expect(data.items[0].taskId).toBe("t2");
    expect(mocks.videoTaskStorage.getVideoTasksByStory).toHaveBeenCalledWith("s1");
    // 不应调用 getVideoTasksByStatus
    expect(mocks.videoTaskStorage.getVideoTasksByStatus).not.toHaveBeenCalled();
  });

  it("8. 按 status 过滤（无 storyId）", async () => {
    const tasks = [
      makeTask({ taskId: "t1", status: "failed" }),
      makeTask({ taskId: "t2", status: "failed" }),
    ];
    mocks.videoTaskStorage.getVideoTasksByStatus.mockResolvedValue(tasks);

    const result = await listVideoTasksTool.execute(
      { status: "failed", limit: 1, offset: 1 },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      total: number;
      offset: number;
      limit: number;
      items: Array<{ taskId: string }>;
    };
    expect(data.total).toBe(2);
    expect(data.offset).toBe(1);
    expect(data.limit).toBe(1);
    expect(data.items).toHaveLength(1);
    expect(mocks.videoTaskStorage.getVideoTasksByStatus).toHaveBeenCalledWith("failed");
  });

  it("9. 长 prompt 被截断为 100 字符", async () => {
    const longPrompt = "a".repeat(200);
    mocks.videoTaskStorage.getVideoTasks.mockResolvedValue([
      makeTask({ taskId: "t1", prompt: longPrompt }),
    ]);

    const result = await listVideoTasksTool.execute({}, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as {
      items: Array<{ prompt: string }>;
    };
    // 截断后长度 = 100 + 1（…）
    expect(data.items[0].prompt.length).toBe(101);
    expect(data.items[0].prompt.endsWith("…")).toBe(true);
  });
});

// ============================================================
// 3. get_video_task
// ============================================================
describe("get_video_task", () => {
  it("10. 任务存在时返回完整详情", async () => {
    const task = makeTask({ taskId: "t1", prompt: "完整提示词" });
    mocks.videoTaskStorage.getVideoTaskById.mockResolvedValue(task);

    const result = await getVideoTaskTool.execute({ taskId: "t1" }, makeCtx());

    expect(result.success).toBe(true);
    expect(result.data).toEqual(task);
    expect(mocks.videoTaskStorage.getVideoTaskById).toHaveBeenCalledWith("t1");
  });

  it("11. 任务不存在时返回失败", async () => {
    mocks.videoTaskStorage.getVideoTaskById.mockResolvedValue(null);

    const result = await getVideoTaskTool.execute({ taskId: "missing" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("视频任务不存在");
    expect(result.error).toContain("missing");
  });
});

// ============================================================
// 4. query_video_status
// ============================================================
describe("query_video_status", () => {
  it("12. 任务不存在时返回失败", async () => {
    mocks.videoTaskStorage.getVideoTaskById.mockResolvedValue(null);

    const result = await queryVideoStatusTool.execute({ taskId: "missing" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("视频任务不存在");
    expect(mocks.videoProvider.queryVideoStatus).not.toHaveBeenCalled();
  });

  it("13. 正常查询并更新本地存储", async () => {
    const task = makeTask({
      taskId: "t1",
      status: "pending",
      progress: 0,
      providerId: "p1",
      providerModelId: "m1",
      providerFormat: "openai",
    });
    mocks.videoTaskStorage.getVideoTaskById.mockResolvedValue(task);
    mocks.videoProvider.queryVideoStatus.mockResolvedValue({
      success: true,
      data: {
        status: "completed",
        progress: 100,
        videoUrl: "https://video.mp4",
        message: "完成",
      },
    });
    mocks.videoTaskStorage.updateVideoTask.mockResolvedValue(undefined);

    const result = await queryVideoStatusTool.execute({ taskId: "t1" }, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as {
      taskId: string;
      status: string;
      progress: number;
      videoUrl: string;
      message: string;
    };
    expect(data.status).toBe("completed");
    expect(data.progress).toBe(100);
    expect(data.videoUrl).toBe("https://video.mp4");
    // 验证 provider 调用参数（使用 task 存储的 providerId/modelId/format）
    const callArgs = mocks.videoProvider.queryVideoStatus.mock.calls[0];
    expect(callArgs[0]).toBe("t1");
    expect(callArgs[1]).toEqual({
      providerId: "p1",
      modelId: "m1",
      format: "openai",
    });
    // 验证本地存储被更新
    expect(mocks.videoTaskStorage.updateVideoTask).toHaveBeenCalledTimes(1);
    const updateArgs = mocks.videoTaskStorage.updateVideoTask.mock.calls[0];
    expect(updateArgs[0]).toBe("t1");
    expect(updateArgs[1].status).toBe("completed");
    expect(updateArgs[1].videoUrl).toBe("https://video.mp4");
  });

  it("14. provider 查询失败时返回错误", async () => {
    mocks.videoTaskStorage.getVideoTaskById.mockResolvedValue(makeTask());
    mocks.videoProvider.queryVideoStatus.mockResolvedValue({
      success: false,
      error: "provider 不可用",
    });

    const result = await queryVideoStatusTool.execute({ taskId: "t1" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("provider 不可用");
  });

  it("15. args 中指定的 providerId/modelId 覆盖任务存储值", async () => {
    mocks.videoTaskStorage.getVideoTaskById.mockResolvedValue(
      makeTask({ providerId: "stored_p", providerModelId: "stored_m" }),
    );
    mocks.videoProvider.queryVideoStatus.mockResolvedValue({
      success: true,
      data: { status: "generating", progress: 50 },
    });

    await queryVideoStatusTool.execute(
      { taskId: "t1", providerId: "override_p", modelId: "override_m" },
      makeCtx(),
    );

    const callArgs = mocks.videoProvider.queryVideoStatus.mock.calls[0];
    expect(callArgs[1]).toEqual({
      providerId: "override_p",
      modelId: "override_m",
      format: "openai",
    });
  });

  it("16. 本地存储更新失败不影响返回最新状态", async () => {
    mocks.videoTaskStorage.getVideoTaskById.mockResolvedValue(makeTask());
    mocks.videoProvider.queryVideoStatus.mockResolvedValue({
      success: true,
      data: { status: "completed", progress: 100, videoUrl: "https://v.mp4" },
    });
    mocks.videoTaskStorage.updateVideoTask.mockRejectedValue(new Error("DB busy"));

    const result = await queryVideoStatusTool.execute({ taskId: "t1" }, makeCtx());

    // 仍然返回成功（不阻断）
    expect(result.success).toBe(true);
    const data = result.data as { status: string };
    expect(data.status).toBe("completed");
  });
});

// ============================================================
// 5. cancel_video_task
// ============================================================
describe("cancel_video_task", () => {
  it("17. 任务不存在时返回失败", async () => {
    mocks.videoTaskStorage.getVideoTaskById.mockResolvedValue(null);

    const result = await cancelVideoTaskTool.execute({ taskId: "missing" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("视频任务不存在");
  });

  it("18. 已完成的任务无法取消", async () => {
    mocks.videoTaskStorage.getVideoTaskById.mockResolvedValue(
      makeTask({ status: "completed" }),
    );

    const result = await cancelVideoTaskTool.execute({ taskId: "t1" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("任务已完成");
  });

  it("19. 已取消的任务再次取消返回失败", async () => {
    mocks.videoTaskStorage.getVideoTaskById.mockResolvedValue(
      makeTask({ status: "cancelled" }),
    );

    const result = await cancelVideoTaskTool.execute({ taskId: "t1" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("任务已被取消");
  });

  it("20. 正常取消：provider + 本地状态更新", async () => {
    mocks.videoTaskStorage.getVideoTaskById.mockResolvedValue(
      makeTask({ status: "generating" }),
    );
    mocks.videoProvider.cancelTask.mockResolvedValue(undefined);
    mocks.videoTaskStorage.updateVideoTask.mockResolvedValue(undefined);

    const result = await cancelVideoTaskTool.execute({ taskId: "t1" }, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as {
      taskId: string;
      status: string;
      providerCancelled: boolean;
    };
    expect(data.status).toBe("cancelled");
    expect(data.providerCancelled).toBe(true);
    expect(mocks.videoProvider.cancelTask).toHaveBeenCalledWith("t1");
    expect(mocks.videoTaskStorage.updateVideoTask).toHaveBeenCalled();
  });

  it("21. provider 取消失败仍更新本地状态", async () => {
    mocks.videoTaskStorage.getVideoTaskById.mockResolvedValue(
      makeTask({ status: "generating" }),
    );
    mocks.videoProvider.cancelTask.mockRejectedValue(new Error("provider error"));
    mocks.videoTaskStorage.updateVideoTask.mockResolvedValue(undefined);

    const result = await cancelVideoTaskTool.execute({ taskId: "t1" }, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as { providerCancelled: boolean };
    expect(data.providerCancelled).toBe(false);
    // 本地状态仍被更新
    expect(mocks.videoTaskStorage.updateVideoTask).toHaveBeenCalled();
  });

  it("22. 本地状态更新失败时返回错误", async () => {
    mocks.videoTaskStorage.getVideoTaskById.mockResolvedValue(
      makeTask({ status: "generating" }),
    );
    mocks.videoTaskStorage.updateVideoTask.mockRejectedValue(new Error("DB error"));

    const result = await cancelVideoTaskTool.execute({ taskId: "t1" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("本地状态更新失败");
    expect(result.error).toContain("DB error");
  });

  it("23. requiresConfirmation 为 true", () => {
    expect(cancelVideoTaskTool.requiresConfirmation).toBe(true);
  });
});

// ============================================================
// 6. recover_video_task
// ============================================================
describe("recover_video_task", () => {
  it("24. 任务不存在时返回失败", async () => {
    mocks.videoTaskStorage.getVideoTaskById.mockResolvedValue(null);

    const result = await recoverVideoTaskTool.execute({ taskId: "missing" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("视频任务不存在");
  });

  it("25. 状态为 generating 不可恢复", async () => {
    mocks.videoTaskStorage.getVideoTaskById.mockResolvedValue(
      makeTask({ status: "generating" }),
    );

    const result = await recoverVideoTaskTool.execute({ taskId: "t1" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("无法恢复");
    expect(result.error).toContain("generating");
  });

  it("26. retry=false：仅重置状态为 pending", async () => {
    mocks.videoTaskStorage.getVideoTaskById.mockResolvedValue(
      makeTask({ status: "failed", recoveryAttempts: 1 }),
    );
    mocks.videoTaskStorage.updateVideoTask.mockResolvedValue(undefined);

    const result = await recoverVideoTaskTool.execute(
      { taskId: "t1", retry: false },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      taskId: string;
      status: string;
      retry: boolean;
      message: string;
    };
    expect(data.status).toBe("pending");
    expect(data.retry).toBe(false);
    expect(mocks.videoTaskStorage.updateVideoTask).toHaveBeenCalledWith("t1", {
      status: "pending",
      message: "用户恢复，等待重新轮询",
      recoveryAttempts: 2,
      pollFailureCount: 0,
      updatedAt: expect.any(String),
    });
    // 不应调用 provider
    expect(mocks.videoProvider.generateVideoWithFrames).not.toHaveBeenCalled();
  });

  it("27. retry=true：用相同参数重新提交并创建新任务", async () => {
    mocks.videoTaskStorage.getVideoTaskById.mockResolvedValue(
      makeTask({
        status: "failed",
        prompt: "原始提示词",
        fixedImageUrl: "https://img.png",
        providerId: "p1",
        providerModelId: "m1",
        providerFormat: "openai",
        parameters: { duration: 10, lastFrameUrl: "https://end.png" },
        storyId: "s1",
        beatId: "b1",
      }),
    );
    mocks.videoProvider.generateVideoWithFrames.mockResolvedValue({
      success: true,
      data: { taskId: "new_task", status: "pending" },
    });
    mocks.videoTaskStorage.createVideoTask.mockResolvedValue(undefined);

    const result = await recoverVideoTaskTool.execute(
      { taskId: "t1", retry: true },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      taskId: string;
      oldTaskId: string;
      retry: boolean;
      status: string;
    };
    expect(data.taskId).toBe("new_task");
    expect(data.oldTaskId).toBe("t1");
    expect(data.retry).toBe(true);
    // 验证 provider 调用使用了原任务的参数
    const callArgs = mocks.videoProvider.generateVideoWithFrames.mock.calls[0][0];
    expect(callArgs.prompt).toBe("原始提示词");
    expect(callArgs.firstFrameUrl).toBe("https://img.png");
    expect(callArgs.duration).toBe(10);
    expect(callArgs.lastFrameUrl).toBe("https://end.png");
    expect(callArgs.providerId).toBe("p1");
    expect(callArgs.modelId).toBe("m1");
    // 验证新任务被持久化
    const stored = mocks.videoTaskStorage.createVideoTask.mock.calls[0][0];
    expect(stored.taskId).toBe("new_task");
    expect(stored.storyId).toBe("s1");
    expect(stored.beatId).toBe("b1");
  });

  it("28. retry=true 但 provider 重新提交失败", async () => {
    mocks.videoTaskStorage.getVideoTaskById.mockResolvedValue(
      makeTask({ status: "timeout" }),
    );
    mocks.videoProvider.generateVideoWithFrames.mockResolvedValue({
      success: false,
      error: "provider 限流",
    });

    const result = await recoverVideoTaskTool.execute(
      { taskId: "t1", retry: true },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("provider 限流");
  });

  it("29. retry=true 但 provider 未返回新 taskId", async () => {
    mocks.videoTaskStorage.getVideoTaskById.mockResolvedValue(
      makeTask({ status: "failed" }),
    );
    mocks.videoProvider.generateVideoWithFrames.mockResolvedValue({
      success: true,
      data: { taskId: "" },
    });

    const result = await recoverVideoTaskTool.execute(
      { taskId: "t1", retry: true },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("provider 未返回新 taskId");
  });
});

// ============================================================
// 7. batch_create_video_tasks
// ============================================================
describe("batch_create_video_tasks", () => {
  it("30. tasks 非数组时返回失败", async () => {
    const result = await batchCreateVideoTasksTool.execute({ tasks: "not array" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("tasks 必须是非空数组");
  });

  it("31. tasks 空数组时返回失败", async () => {
    const result = await batchCreateVideoTasksTool.execute({ tasks: [] }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("tasks 必须是非空数组");
  });

  it("32. 正常批量创建（含部分失败）", async () => {
    // 第一项成功
    mocks.videoProvider.generateVideoWithFrames
      .mockResolvedValueOnce({
        success: true,
        data: { taskId: "task_a", status: "pending" },
      })
      .mockResolvedValueOnce({
        success: false,
        error: "第二项失败",
      })
      .mockResolvedValueOnce({
        success: true,
        data: { taskId: "task_c", status: "pending" },
      });
    mocks.videoTaskStorage.createVideoTask.mockResolvedValue(undefined);

    const result = await batchCreateVideoTasksTool.execute(
      {
        tasks: [
          { prompt: "镜头1", beatId: "b1" },
          { prompt: "镜头2", beatId: "b2" },
          { prompt: "镜头3", beatId: "b3" },
        ],
      },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      created: Array<{ taskId: string; beatId?: string }>;
      failed: Array<{ beatId?: string; error: string }>;
      totalCreated: number;
      totalFailed: number;
    };
    expect(data.totalCreated).toBe(2);
    expect(data.totalFailed).toBe(1);
    expect(data.created[0].taskId).toBe("task_a");
    expect(data.created[0].beatId).toBe("b1");
    expect(data.failed[0].beatId).toBe("b2");
    expect(data.failed[0].error).toContain("第二项失败");
  });

  it("33. 单项 prompt 为空计入 failed", async () => {
    mocks.videoProvider.generateVideoWithFrames.mockResolvedValue({
      success: true,
      data: { taskId: "task_x", status: "pending" },
    });
    mocks.videoTaskStorage.createVideoTask.mockResolvedValue(undefined);

    const result = await batchCreateVideoTasksTool.execute(
      {
        tasks: [
          { prompt: "  ", beatId: "empty" },
          { prompt: "valid", beatId: "ok" },
        ],
      },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      created: unknown[];
      failed: Array<{ beatId?: string; error: string }>;
    };
    expect(data.created).toHaveLength(1);
    expect(data.failed).toHaveLength(1);
    expect(data.failed[0].beatId).toBe("empty");
    expect(data.failed[0].error).toContain("prompt 为空");
    // provider 只为有效项调用
    expect(mocks.videoProvider.generateVideoWithFrames).toHaveBeenCalledTimes(1);
  });

  it("34. provider 抛异常时计入 failed 不中断后续", async () => {
    mocks.videoProvider.generateVideoWithFrames
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce({
        success: true,
        data: { taskId: "task_ok", status: "pending" },
      });
    mocks.videoTaskStorage.createVideoTask.mockResolvedValue(undefined);

    const result = await batchCreateVideoTasksTool.execute(
      {
        tasks: [{ prompt: "p1" }, { prompt: "p2" }],
      },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      created: unknown[];
      failed: Array<{ error: string }>;
    };
    expect(data.created).toHaveLength(1);
    expect(data.failed).toHaveLength(1);
    expect(data.failed[0].error).toContain("network error");
  });

  it("35. 持久化失败仍计入 created（任务已在 provider 侧创建）", async () => {
    mocks.videoProvider.generateVideoWithFrames.mockResolvedValue({
      success: true,
      data: { taskId: "task_p", status: "pending" },
    });
    mocks.videoTaskStorage.createVideoTask.mockRejectedValue(new Error("DB error"));

    const result = await batchCreateVideoTasksTool.execute(
      { tasks: [{ prompt: "p1" }] },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      created: Array<{ taskId: string }>;
      failed: unknown[];
    };
    expect(data.created).toHaveLength(1);
    expect(data.created[0].taskId).toBe("task_p");
    expect(data.failed).toHaveLength(0);
  });
});

// ============================================================
// 8. videoTools 数组导出
// ============================================================
describe("videoTools 数组", () => {
  it("36. 包含 7 个工具", () => {
    expect(videoTools).toHaveLength(7);
    expect(videoTools).toContain(createVideoTaskTool);
    expect(videoTools).toContain(listVideoTasksTool);
    expect(videoTools).toContain(getVideoTaskTool);
    expect(videoTools).toContain(queryVideoStatusTool);
    expect(videoTools).toContain(cancelVideoTaskTool);
    expect(videoTools).toContain(recoverVideoTaskTool);
    expect(videoTools).toContain(batchCreateVideoTasksTool);
  });

  it("37. 所有工具的 domain 为 video", () => {
    for (const tool of videoTools) {
      expect(tool.domain).toBe("video");
    }
  });
});
