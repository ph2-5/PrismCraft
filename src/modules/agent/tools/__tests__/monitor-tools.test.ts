/**
 * Monitor Tools 单元测试
 *
 * 测试 5 个监控/通知工具：
 * - monitor_tasks：监控所有视频任务进度（按状态聚合 + 列表）
 * - notify_completion：设置通知偏好（事件类型 / 启用 / 通知方式）
 * - get_activity_log：获取活动日志（支持按类型 / 时间过滤 + 分页）
 * - watch_progress：实时查看指定任务进度（本地 + provider 实时状态）
 * - get_error_history：获取错误历史（来自 errorLogStorage）
 *
 * Mock 策略：
 * - container.videoTaskStorage / videoProvider / errorLogStorage
 * - @/shared/file-http（getConfig / setConfig）
 * - TOOL_TIMEOUTS 常量
 *
 * 注意 R179：尽量减少 type assertion，仅在 result.data 类型未知时使用
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  videoTaskStorage: {
    getVideoTasks: vi.fn(),
    getVideoTasksByStatus: vi.fn(),
    getPendingVideoTasks: vi.fn(),
    getVideoTaskById: vi.fn(),
  },
  videoProvider: { queryVideoStatus: vi.fn() },
  errorLogStorage: { getErrorLogs: vi.fn() },
  getConfig: vi.fn(),
  setConfig: vi.fn(),
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    videoTaskStorage: mocks.videoTaskStorage,
    videoProvider: mocks.videoProvider,
    errorLogStorage: mocks.errorLogStorage,
  },
}));

vi.mock("../../services/tool-executor", () => ({
  TOOL_TIMEOUTS: {
    query: 30_000,
    mutation: 60_000,
    generation: 300_000,
    videoTask: 1_800_000,
    download: 600_000,
  },
}));

vi.mock("@/shared/file-http", () => ({
  getConfig: mocks.getConfig,
  setConfig: mocks.setConfig,
}));

import {
  monitorTasksTool,
  notifyCompletionTool,
  getActivityLogTool,
  watchProgressTool,
  getErrorHistoryTool,
  monitorTools,
} from "../monitor-tools";
import type { ToolContext } from "../../domain/types";

function makeCtx(): ToolContext {
  return {
    sessionId: "test-session",
    onProgress: vi.fn(),
  };
}

function makeTask(overrides?: Record<string, unknown>) {
  return {
    taskId: "task_1",
    status: "pending",
    progress: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    prompt: "测试",
    providerId: "openai",
    providerModelId: "gpt-4",
    providerFormat: "mp4",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// 1. monitor_tasks
// ============================================================
describe("monitor_tasks", () => {
  it("1. active 状态（默认）返回活跃任务并去重", async () => {
    mocks.videoTaskStorage.getPendingVideoTasks.mockResolvedValue([
      makeTask({ taskId: "t1", status: "pending" }),
    ]);
    mocks.videoTaskStorage.getVideoTasksByStatus.mockImplementation(
      (status: string) => {
        if (status === "generating")
          return Promise.resolve([
            makeTask({ taskId: "t2", status: "generating" }),
            makeTask({ taskId: "t1", status: "generating" }),
          ]);
        if (status === "retrying") return Promise.resolve([]);
        return Promise.resolve([]);
      },
    );
    mocks.videoTaskStorage.getVideoTasks.mockResolvedValue([
      makeTask({ taskId: "t1", status: "pending" }),
      makeTask({ taskId: "t2", status: "generating" }),
      makeTask({ taskId: "t3", status: "completed" }),
    ]);

    const result = await monitorTasksTool.execute({}, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as {
      tasks: Array<{ taskId: string }>;
      totalTasks: number;
      activeCount: number;
      completedCount: number;
      failedCount: number;
      filter: string;
    };
    expect(data.filter).toBe("active");
    expect(data.tasks).toHaveLength(2);
    expect(data.totalTasks).toBe(3);
    expect(data.activeCount).toBe(2);
    expect(data.completedCount).toBe(1);
    expect(data.failedCount).toBe(0);
  });

  it("2. completed 状态只返回已完成任务", async () => {
    mocks.videoTaskStorage.getVideoTasksByStatus.mockResolvedValue([
      makeTask({ taskId: "t1", status: "completed" }),
    ]);
    mocks.videoTaskStorage.getVideoTasks.mockResolvedValue([
      makeTask({ taskId: "t1", status: "completed" }),
      makeTask({ taskId: "t2", status: "pending" }),
    ]);

    const result = await monitorTasksTool.execute(
      { status: "completed" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      tasks: Array<{ taskId: string; status: string }>;
      filter: string;
    };
    expect(data.filter).toBe("completed");
    expect(data.tasks).toHaveLength(1);
    expect(data.tasks[0].status).toBe("completed");
  });

  it("3. failed 状态合并 failed 和 timeout", async () => {
    mocks.videoTaskStorage.getVideoTasksByStatus.mockImplementation(
      (status: string) => {
        if (status === "failed")
          return Promise.resolve([makeTask({ taskId: "t1", status: "failed" })]);
        if (status === "timeout")
          return Promise.resolve([makeTask({ taskId: "t2", status: "timeout" })]);
        return Promise.resolve([]);
      },
    );
    mocks.videoTaskStorage.getVideoTasks.mockResolvedValue([
      makeTask({ taskId: "t1", status: "failed" }),
      makeTask({ taskId: "t2", status: "timeout" }),
    ]);

    const result = await monitorTasksTool.execute(
      { status: "failed" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      tasks: Array<{ taskId: string }>;
      failedCount: number;
    };
    expect(data.tasks).toHaveLength(2);
    expect(data.failedCount).toBe(2);
  });

  it("4. all 状态返回所有任务", async () => {
    mocks.videoTaskStorage.getVideoTasks.mockResolvedValue([
      makeTask({ taskId: "t1", status: "pending" }),
      makeTask({ taskId: "t2", status: "completed" }),
    ]);

    const result = await monitorTasksTool.execute(
      { status: "all" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      tasks: Array<{ taskId: string }>;
      filter: string;
    };
    expect(data.filter).toBe("all");
    expect(data.tasks).toHaveLength(2);
  });

  it("5. 按 createdAt 倒序排列（最新在前）", async () => {
    mocks.videoTaskStorage.getVideoTasks.mockResolvedValue([
      makeTask({ taskId: "t1", createdAt: "2026-01-01T00:00:00.000Z" }),
      makeTask({ taskId: "t2", createdAt: "2026-01-02T00:00:00.000Z" }),
      makeTask({ taskId: "t3", createdAt: "2026-01-03T00:00:00.000Z" }),
    ]);

    const result = await monitorTasksTool.execute(
      { status: "all" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      tasks: Array<{ taskId: string; createdAt: string }>;
    };
    expect(data.tasks[0].taskId).toBe("t3");
    expect(data.tasks[1].taskId).toBe("t2");
    expect(data.tasks[2].taskId).toBe("t1");
  });

  it("6. prompt 超过 100 字符时被截断", async () => {
    const longPrompt = "a".repeat(150);
    mocks.videoTaskStorage.getVideoTasks.mockResolvedValue([
      makeTask({ taskId: "t1", prompt: longPrompt }),
    ]);

    const result = await monitorTasksTool.execute(
      { status: "all" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { tasks: Array<{ prompt: string }> };
    expect(data.tasks[0].prompt).toHaveLength(101);
    expect(data.tasks[0].prompt.endsWith("…")).toBe(true);
  });

  it("7. 查询任务异常时返回失败", async () => {
    mocks.videoTaskStorage.getVideoTasks.mockRejectedValue(new Error("DB 错误"));

    const result = await monitorTasksTool.execute(
      { status: "all" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("查询视频任务失败");
    expect(result.error).toContain("DB 错误");
  });

  it("8. 聚合计数基于全量数据", async () => {
    mocks.videoTaskStorage.getVideoTasksByStatus.mockResolvedValue([]);
    mocks.videoTaskStorage.getVideoTasks.mockResolvedValue([
      makeTask({ taskId: "t1", status: "pending" }),
      makeTask({ taskId: "t2", status: "generating" }),
      makeTask({ taskId: "t3", status: "completed" }),
      makeTask({ taskId: "t4", status: "failed" }),
      makeTask({ taskId: "t5", status: "timeout" }),
    ]);

    const result = await monitorTasksTool.execute(
      { status: "completed" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      totalTasks: number;
      activeCount: number;
      completedCount: number;
      failedCount: number;
    };
    expect(data.totalTasks).toBe(5);
    expect(data.activeCount).toBe(2);
    expect(data.completedCount).toBe(1);
    expect(data.failedCount).toBe(2);
  });

  it("9. 聚合查询失败时降级使用过滤后列表", async () => {
    mocks.videoTaskStorage.getVideoTasksByStatus.mockResolvedValue([
      makeTask({ taskId: "t1", status: "completed" }),
    ]);
    // 第一次 getVideoTasks 用于聚合，会失败
    mocks.videoTaskStorage.getVideoTasks
      .mockRejectedValueOnce(new Error("聚合查询失败"));

    const result = await monitorTasksTool.execute(
      { status: "completed" },
      makeCtx(),
    );

    // 由于聚合失败，降级使用过滤后列表
    expect(result.success).toBe(true);
    const data = result.data as {
      tasks: Array<{ taskId: string }>;
      totalTasks: number;
    };
    expect(data.tasks).toHaveLength(1);
    // 降级后 totalTasks 基于过滤后列表
    expect(data.totalTasks).toBe(1);
  });
});

// ============================================================
// 2. notify_completion
// ============================================================
describe("notify_completion", () => {
  it("10. 默认 method 为 desktop_notification", async () => {
    mocks.getConfig.mockResolvedValue(null);
    mocks.setConfig.mockResolvedValue(true);

    const result = await notifyCompletionTool.execute(
      { eventType: "video_completed", enabled: true },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      configured: boolean;
      eventType: string;
      enabled: boolean;
      method: string;
    };
    expect(data.configured).toBe(true);
    expect(data.eventType).toBe("video_completed");
    expect(data.enabled).toBe(true);
    expect(data.method).toBe("desktop_notification");
    expect(mocks.setConfig).toHaveBeenCalledWith(
      "agent.notificationPrefs",
      expect.objectContaining({
        video_completed: {
          enabled: true,
          method: "desktop_notification",
          updatedAt: expect.any(Number),
        },
      }),
    );
  });

  it("11. 自定义 method=both", async () => {
    mocks.getConfig.mockResolvedValue(null);
    mocks.setConfig.mockResolvedValue(true);

    const result = await notifyCompletionTool.execute(
      { eventType: "all", enabled: false, method: "both" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { method: string; enabled: boolean };
    expect(data.method).toBe("both");
    expect(data.enabled).toBe(false);
  });

  it("12. 已有偏好时合并存储", async () => {
    mocks.getConfig.mockResolvedValue({
      video_completed: { enabled: true, method: "sound", updatedAt: 1000 },
    });
    mocks.setConfig.mockResolvedValue(true);

    const result = await notifyCompletionTool.execute(
      { eventType: "video_failed", enabled: true, method: "desktop_notification" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const setConfigCall = mocks.setConfig.mock.calls[0];
    const prefs = setConfigCall[1] as Record<string, unknown>;
    expect(prefs.video_completed).toBeDefined();
    expect(prefs.video_failed).toBeDefined();
  });

  it("13. setConfig 返回 false 时返回失败", async () => {
    mocks.getConfig.mockResolvedValue(null);
    mocks.setConfig.mockResolvedValue(false);

    const result = await notifyCompletionTool.execute(
      { eventType: "video_completed", enabled: true },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("保存通知偏好失败");
  });

  it("14. 异常时返回失败", async () => {
    mocks.getConfig.mockRejectedValue(new Error("存储错误"));

    const result = await notifyCompletionTool.execute(
      { eventType: "video_completed", enabled: true },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("设置通知偏好失败");
    expect(result.error).toContain("存储错误");
  });

  it("15. enabled=false 时正确存储", async () => {
    mocks.getConfig.mockResolvedValue(null);
    mocks.setConfig.mockResolvedValue(true);

    const result = await notifyCompletionTool.execute(
      { eventType: "video_failed", enabled: false, method: "sound" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { enabled: boolean; method: string };
    expect(data.enabled).toBe(false);
    expect(data.method).toBe("sound");
  });
});

// ============================================================
// 3. get_activity_log
// ============================================================
describe("get_activity_log", () => {
  it("16. 日志非数组时返回空", async () => {
    mocks.getConfig.mockResolvedValue(null);

    const result = await getActivityLogTool.execute({}, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as { total: number; events: unknown[] };
    expect(data.total).toBe(0);
    expect(data.events).toEqual([]);
  });

  it("17. 默认 limit=50", async () => {
    const events = Array.from({ length: 60 }, (_, i) => ({
      timestamp: 1000 + i,
      type: "test",
      message: `event ${i}`,
    }));
    mocks.getConfig.mockResolvedValue(events);

    const result = await getActivityLogTool.execute({}, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as { total: number; events: unknown[] };
    expect(data.total).toBe(60);
    expect(data.events).toHaveLength(50);
  });

  it("18. limit 超过 200 时截断为 200", async () => {
    const events = Array.from({ length: 250 }, (_, i) => ({
      timestamp: 1000 + i,
      type: "test",
      message: `event ${i}`,
    }));
    mocks.getConfig.mockResolvedValue(events);

    const result = await getActivityLogTool.execute(
      { limit: 300 },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { events: unknown[] };
    expect(data.events).toHaveLength(200);
  });

  it("19. 按 eventType 过滤", async () => {
    mocks.getConfig.mockResolvedValue([
      { timestamp: 1, type: "video_completed", message: "a" },
      { timestamp: 2, type: "character_created", message: "b" },
      { timestamp: 3, type: "video_completed", message: "c" },
    ]);

    const result = await getActivityLogTool.execute(
      { eventType: "video_completed" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { events: Array<{ type: string }> };
    expect(data.events).toHaveLength(2);
    for (const e of data.events) {
      expect(e.type).toBe("video_completed");
    }
  });

  it("20. 按 since 时间过滤", async () => {
    mocks.getConfig.mockResolvedValue([
      { timestamp: 1000, type: "a", message: "old" },
      { timestamp: 2000, type: "b", message: "new" },
      { timestamp: 3000, type: "c", message: "newest" },
    ]);

    const result = await getActivityLogTool.execute(
      { since: 2000 },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { events: Array<{ timestamp: number }> };
    expect(data.events).toHaveLength(2);
    for (const e of data.events) {
      expect(e.timestamp).toBeGreaterThanOrEqual(2000);
    }
  });

  it("21. 倒序排列（最新在前）", async () => {
    mocks.getConfig.mockResolvedValue([
      { timestamp: 1000, type: "a", message: "1" },
      { timestamp: 3000, type: "c", message: "3" },
      { timestamp: 2000, type: "b", message: "2" },
    ]);

    const result = await getActivityLogTool.execute({}, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as { events: Array<{ timestamp: number }> };
    expect(data.events[0].timestamp).toBe(3000);
    expect(data.events[1].timestamp).toBe(2000);
    expect(data.events[2].timestamp).toBe(1000);
  });

  it("22. 异常时返回失败", async () => {
    mocks.getConfig.mockRejectedValue(new Error("读取失败"));

    const result = await getActivityLogTool.execute({}, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("获取活动日志失败");
    expect(result.error).toContain("读取失败");
  });

  it("23. total 反映原始日志数量（过滤前）", async () => {
    mocks.getConfig.mockResolvedValue([
      { timestamp: 1, type: "video_completed", message: "a" },
      { timestamp: 2, type: "character_created", message: "b" },
      { timestamp: 3, type: "video_completed", message: "c" },
    ]);

    const result = await getActivityLogTool.execute(
      { eventType: "video_completed" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { total: number; events: unknown[] };
    expect(data.total).toBe(3);
    expect(data.events).toHaveLength(2);
  });
});

// ============================================================
// 4. watch_progress
// ============================================================
describe("watch_progress", () => {
  it("24. 任务不存在时返回失败", async () => {
    mocks.videoTaskStorage.getVideoTaskById.mockResolvedValue(null);

    const result = await watchProgressTool.execute(
      { taskId: "missing" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("视频任务不存在");
  });

  it("25. 查询任务异常时返回失败", async () => {
    mocks.videoTaskStorage.getVideoTaskById.mockRejectedValue(
      new Error("DB 错误"),
    );

    const result = await watchProgressTool.execute(
      { taskId: "t1" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("查询任务失败");
    expect(result.error).toContain("DB 错误");
  });

  it("26. 已完成任务直接返回本地状态（不查询 provider）", async () => {
    mocks.videoTaskStorage.getVideoTaskById.mockResolvedValue(
      makeTask({
        taskId: "t1",
        status: "completed",
        progress: 100,
        videoUrl: "http://video.url",
      }),
    );

    const result = await watchProgressTool.execute(
      { taskId: "t1" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      status: string;
      progress: number;
      videoUrl: string;
    };
    expect(data.status).toBe("completed");
    expect(data.progress).toBe(100);
    expect(data.videoUrl).toBe("http://video.url");
    expect(mocks.videoProvider.queryVideoStatus).not.toHaveBeenCalled();
  });

  it("27. 失败任务直接返回本地状态", async () => {
    mocks.videoTaskStorage.getVideoTaskById.mockResolvedValue(
      makeTask({
        taskId: "t1",
        status: "failed",
        progress: 50,
        message: "生成失败",
      }),
    );

    const result = await watchProgressTool.execute(
      { taskId: "t1" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { status: string; message: string };
    expect(data.status).toBe("failed");
    expect(data.message).toBe("生成失败");
    expect(mocks.videoProvider.queryVideoStatus).not.toHaveBeenCalled();
  });

  it("28. 活跃任务 - provider 查询成功时返回实时状态", async () => {
    mocks.videoTaskStorage.getVideoTaskById.mockResolvedValue(
      makeTask({ taskId: "t1", status: "generating", progress: 30 }),
    );
    mocks.videoProvider.queryVideoStatus.mockResolvedValue({
      success: true,
      data: {
        status: "generating",
        progress: 60,
        videoUrl: undefined,
        message: "正在生成",
      },
    });

    const result = await watchProgressTool.execute(
      { taskId: "t1" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      status: string;
      progress: number;
      message: string;
      eta: string | undefined;
    };
    expect(data.status).toBe("generating");
    expect(data.progress).toBe(60);
    expect(data.message).toBe("正在生成");
    expect(data.eta).toBeDefined();
    expect(mocks.videoProvider.queryVideoStatus).toHaveBeenCalledTimes(1);
  });

  it("29. 活跃任务 - provider 查询失败时返回本地状态 + 警告", async () => {
    mocks.videoTaskStorage.getVideoTaskById.mockResolvedValue(
      makeTask({ taskId: "t1", status: "generating", progress: 30 }),
    );
    mocks.videoProvider.queryVideoStatus.mockResolvedValue({
      success: false,
      error: "provider 不可用",
    });

    const result = await watchProgressTool.execute(
      { taskId: "t1" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      status: string;
      progress: number;
      warning: string;
    };
    expect(data.status).toBe("generating");
    expect(data.progress).toBe(30);
    expect(data.warning).toContain("provider 不可用");
  });

  it("30. 活跃任务 - provider 查询异常时返回本地状态 + 警告", async () => {
    mocks.videoTaskStorage.getVideoTaskById.mockResolvedValue(
      makeTask({ taskId: "t1", status: "pending", progress: 0 }),
    );
    mocks.videoProvider.queryVideoStatus.mockRejectedValue(
      new Error("网络错误"),
    );

    const result = await watchProgressTool.execute(
      { taskId: "t1" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { status: string; warning: string };
    expect(data.status).toBe("pending");
    expect(data.warning).toContain("provider 查询异常");
    expect(data.warning).toContain("网络错误");
  });

  it("31. 进度为 0 时不计算 ETA", async () => {
    mocks.videoTaskStorage.getVideoTaskById.mockResolvedValue(
      makeTask({ taskId: "t1", status: "generating", progress: 0 }),
    );
    mocks.videoProvider.queryVideoStatus.mockResolvedValue({
      success: true,
      data: { status: "generating", progress: 0 },
    });

    const result = await watchProgressTool.execute(
      { taskId: "t1" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { eta: string | undefined };
    expect(data.eta).toBeUndefined();
  });

  it("32. provider 返回的 videoUrl 优先于本地", async () => {
    mocks.videoTaskStorage.getVideoTaskById.mockResolvedValue(
      makeTask({
        taskId: "t1",
        status: "generating",
        progress: 50,
        videoUrl: "http://old.url",
      }),
    );
    mocks.videoProvider.queryVideoStatus.mockResolvedValue({
      success: true,
      data: {
        status: "completed",
        progress: 100,
        videoUrl: "http://new.url",
        message: "完成",
      },
    });

    const result = await watchProgressTool.execute(
      { taskId: "t1" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { videoUrl: string; progress: number };
    expect(data.videoUrl).toBe("http://new.url");
    expect(data.progress).toBe(100);
  });
});

// ============================================================
// 5. get_error_history
// ============================================================
describe("get_error_history", () => {
  it("33. 成功获取错误历史", async () => {
    mocks.errorLogStorage.getErrorLogs.mockResolvedValue([
      {
        id: 1,
        message: "错误1",
        stack: "stack1",
        timestamp: 1700000000,
        component: "App",
      },
      {
        id: 2,
        message: "错误2",
        stack: "stack2",
        timestamp: 1700001000,
        component: "Video",
      },
    ]);

    const result = await getErrorHistoryTool.execute({}, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as {
      total: number;
      errors: Array<{
        timestamp: number;
        error: string;
        context: { component: string; stack: string };
        resolved: boolean;
      }>;
    };
    expect(data.total).toBe(2);
    expect(data.errors).toHaveLength(2);
    expect(data.errors[0].error).toBe("错误1");
    expect(data.errors[0].timestamp).toBe(1700000000 * 1000);
    expect(data.errors[0].context.component).toBe("App");
    expect(data.errors[0].resolved).toBe(false);
  });

  it("34. 默认 limit=20", async () => {
    mocks.errorLogStorage.getErrorLogs.mockResolvedValue([]);

    await getErrorHistoryTool.execute({}, makeCtx());

    expect(mocks.errorLogStorage.getErrorLogs).toHaveBeenCalledWith(20);
  });

  it("35. limit 超过 200 时截断为 200", async () => {
    mocks.errorLogStorage.getErrorLogs.mockResolvedValue([]);

    await getErrorHistoryTool.execute({ limit: 500 }, makeCtx());

    expect(mocks.errorLogStorage.getErrorLogs).toHaveBeenCalledWith(200);
  });

  it("36. 按 since 过滤", async () => {
    mocks.errorLogStorage.getErrorLogs.mockResolvedValue([
      { id: 1, message: "old", timestamp: 1700000000, component: "A" },
      { id: 2, message: "new", timestamp: 1700002000, component: "B" },
    ]);

    const result = await getErrorHistoryTool.execute(
      { since: 1700001000000 },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { errors: Array<{ timestamp: number }> };
    expect(data.errors).toHaveLength(1);
    expect(data.errors[0].timestamp).toBe(1700002000 * 1000);
  });

  it("37. 异常时返回失败", async () => {
    mocks.errorLogStorage.getErrorLogs.mockRejectedValue(new Error("存储错误"));

    const result = await getErrorHistoryTool.execute({}, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("获取错误历史失败");
    expect(result.error).toContain("存储错误");
  });

  it("38. 空日志返回 total=0", async () => {
    mocks.errorLogStorage.getErrorLogs.mockResolvedValue([]);

    const result = await getErrorHistoryTool.execute({}, makeCtx());

    expect(result.success).toBe(true);
    const data = result.data as { total: number; errors: unknown[] };
    expect(data.total).toBe(0);
    expect(data.errors).toEqual([]);
  });
});

// ============================================================
// 6. monitorTools 数组导出
// ============================================================
describe("monitorTools 数组", () => {
  it("39. 包含 5 个工具", () => {
    expect(monitorTools).toHaveLength(5);
    expect(monitorTools).toContain(monitorTasksTool);
    expect(monitorTools).toContain(notifyCompletionTool);
    expect(monitorTools).toContain(getActivityLogTool);
    expect(monitorTools).toContain(watchProgressTool);
    expect(monitorTools).toContain(getErrorHistoryTool);
  });

  it("40. 所有工具的 domain 为 monitor", () => {
    for (const tool of monitorTools) {
      expect(tool.domain).toBe("monitor");
    }
  });
});
