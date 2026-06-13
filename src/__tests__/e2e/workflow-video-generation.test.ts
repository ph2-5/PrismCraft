import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getTestDatabase, closeTestDatabase } from "../mocks/in-memory-db";
import { setupElectronApiMock } from "../mocks/electron-api";
import { setupApiCallMock, clearMockAIResponses } from "../mocks/ai-call-mock";

const mockApiCall = setupApiCallMock();

vi.mock("@/infrastructure/ai-providers/core", () => ({
  apiCall: (endpoint: unknown, options: unknown) => mockApiCall(endpoint as string, options as { method?: string; body?: string }),
  apiCallWithRetry: (endpoint: unknown, options: unknown) => mockApiCall(endpoint as string, options as { method?: string; body?: string }),
  ApiClientError: class ApiClientError extends Error {
    statusCode?: number;
    code?: string;
    constructor(message: string, statusCode?: number, code?: string) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
    }
  },
  isQueuedResponse: () => false,
  getErrorMessage: (e: unknown) => e instanceof Error ? e.message : String(e),
  checkApiHealth: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/infrastructure/ai-providers/config", async () => {
  const actual = await vi.importActual("@/infrastructure/ai-providers/config");
  return {
    ...actual,
    resolveCapability: vi.fn().mockResolvedValue({
      provider: { id: "volcengine", name: "火山引擎", apiKey: "sk-test", baseUrl: "https://api.volcengine.com", format: "openai" },
      model: { id: "seedance-1.5", name: "Seedance 1.5", capabilities: ["video"] },
    }),
  };
});

vi.mock("@/infrastructure/ai-providers/offline-queue", () => ({
  enqueueRequest: vi.fn().mockResolvedValue(null),
  getQueueStats: vi.fn().mockReturnValue({ pending: 0, generating: 0, completed: 0, failed: 0 }),
}));

vi.mock("@/shared/utils/platform", () => ({
  isElectron: () => true,
}));

beforeEach(() => {
  const db = getTestDatabase();
  const mock = setupElectronApiMock();

  mock.dbQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
    try {
      const data = db.query(sql, params);
      return { success: true, data };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  });

  mock.dbRun.mockImplementation(async (sql: string, params: unknown[] = []) => {
    try {
      const result = db.run(sql, params);
      return { success: true, data: result, changes: result.changes, lastInsertRowid: result.lastInsertRowid };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  });

  mock.dbTransaction.mockImplementation(async (statements: { sql: string; params: unknown[] }[]) => {
    try {
      const data = db.transaction(statements);
      return { success: true, data };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  });

  mockApiCall.mockClear();
  clearMockAIResponses();
});

afterEach(() => {
  closeTestDatabase();
});

describe("E2E 视频生成工作流", () => {
  describe("完整视频生成链路", () => {
    it("视频生成 → 轮询 → 完成 → 保存到数据库", async () => {
      const { generateVideo } = await import("@/infrastructure/ai-providers/video");
      const { videoTaskStorage } = await import("@/infrastructure/storage/video-tasks");

      const genResult = await generateVideo("一只猫在跳舞", {
        providerId: "volcengine",
        modelId: "seedance-1.5",
        format: "mp4",
      });

      expect(genResult.success).toBe(true);
      if (!genResult.success) return;

      const taskId = genResult.data.taskId!;
      expect(taskId).toBeTruthy();

      await videoTaskStorage.createVideoTask({
        taskId,
        status: "pending",
        progress: 0,
        providerId: "volcengine",
        providerModelId: "seedance-1.5",
        providerFormat: "mp4",
        prompt: "一只猫在跳舞",
      });

      await videoTaskStorage.updateVideoTask(taskId, {
        status: "generating",
        progress: 0,
      });

      const { queryVideoStatus } = await import("@/infrastructure/ai-providers/video");
      const statusResult = await queryVideoStatus(taskId, {
        providerId: "volcengine",
        modelId: "seedance-1.5",
      });

      expect(statusResult.success).toBe(true);

      if (statusResult.success && statusResult.data.status === "completed") {
        await videoTaskStorage.updateVideoTask(taskId, {
          status: "completed",
          progress: 100,
          videoUrl: statusResult.data.videoUrl!,
        });
      }

      const task = await videoTaskStorage.getVideoTaskById(taskId);
      expect(task).not.toBeNull();
      expect(task!.taskId).toBe(taskId);
      expect(["generating", "completed"]).toContain(task!.status);
    });

    it("视频生成失败应正确记录错误", async () => {
      const { videoTaskStorage } = await import("@/infrastructure/storage/video-tasks");

      await videoTaskStorage.createVideoTask({
        taskId: "fail-task-001",
        status: "pending",
        progress: 0,
        prompt: "测试失败场景",
      });

      await videoTaskStorage.updateVideoTask("fail-task-001", {
        status: "generating",
        progress: 30,
      });

      await videoTaskStorage.updateVideoTask("fail-task-001", {
        status: "failed",
        message: "API Key 无效",
      });

      const task = await videoTaskStorage.getVideoTaskById("fail-task-001");
      expect(task!.status).toBe("failed");
      expect(task!.message).toBe("API Key 无效");
    });
  });

  describe("状态机转换", () => {
    it("pending → generating → completed 完整路径", async () => {
      const { TaskMachine } = await import("@/modules/video/task-management/domain/task-machine");
      const { videoTaskStorage } = await import("@/infrastructure/storage/video-tasks");

      await videoTaskStorage.createVideoTask({
        taskId: "state-machine-1",
        status: "pending",
        progress: 0,
      });

      const task = await videoTaskStorage.getVideoTaskById("state-machine-1");
      expect(task).not.toBeNull();

      const toGenerating = TaskMachine.transition(task!, "generating");
      expect(toGenerating.ok).toBe(true);
      if (toGenerating.ok) {
        await videoTaskStorage.updateVideoTask("state-machine-1", {
          status: toGenerating.value.status,
          lastPolledAt: toGenerating.value.lastPolledAt,
        });
      }

      const generating = await videoTaskStorage.getVideoTaskById("state-machine-1");
      expect(generating!.status).toBe("generating");

      const toCompleted = TaskMachine.transition(generating!, "completed", {
        videoUrl: "https://cdn.example.com/video.mp4",
      });
      expect(toCompleted.ok).toBe(true);
      if (toCompleted.ok) {
        await videoTaskStorage.updateVideoTask("state-machine-1", {
          status: toCompleted.value.status,
          progress: toCompleted.value.progress,
          videoUrl: toCompleted.value.videoUrl,
        });
      }

      const completed = await videoTaskStorage.getVideoTaskById("state-machine-1");
      expect(completed!.status).toBe("completed");
      expect(completed!.progress).toBe(100);
      expect(completed!.videoUrl).toBe("https://cdn.example.com/video.mp4");
    });

    it("非法状态转换应被拒绝", async () => {
      const { TaskMachine } = await import("@/modules/video/task-management/domain/task-machine");

      const completedTask = {
        taskId: "illegal-1",
        status: "completed" as const,
        progress: 100,
        message: "",
        createdAt: new Date().toISOString(),
      };

      const result = TaskMachine.transition(completedTask, "generating");
      expect(result.ok).toBe(false);
    });

    it("failed → retrying → generating 恢复路径", async () => {
      const { TaskMachine } = await import("@/modules/video/task-management/domain/task-machine");

      const failedTask = {
        taskId: "retry-1",
        status: "failed" as const,
        progress: 30,
        message: "网络超时",
        createdAt: new Date().toISOString(),
        recoveryAttempts: 0,
        pollFailureCount: 1,
      };

      const toRetrying = TaskMachine.transition(failedTask, "retrying");
      expect(toRetrying.ok).toBe(true);
      if (toRetrying.ok) {
        expect(toRetrying.value.recoveryAttempts).toBe(1);
        expect(toRetrying.value.pollFailureCount).toBe(0);
      }

      if (toRetrying.ok) {
        const toGenerating = TaskMachine.transition(toRetrying.value, "generating");
        expect(toGenerating.ok).toBe(true);
      }
    });
  });

  describe("关键帧和帧对生成", () => {
    it("关键帧生成应返回正确结构", async () => {
      const { generateKeyframe } = await import("@/infrastructure/ai-providers/video");

      const result = await generateKeyframe({
        characterRefs: ["https://img.example.com/char.png"],
        sceneRef: "https://img.example.com/scene.png",
        providerId: "volcengine",
        modelId: "seedream-3",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.imageUrl).toBeTruthy();
        expect(result.data.generatedAt).toBeGreaterThan(0);
        expect(result.data.referenceCount).toBeGreaterThan(0);
      }
    });

    it("帧对生成应返回首帧和尾帧", async () => {
      const { generateFramePair } = await import("@/infrastructure/ai-providers/video");

      const result = await generateFramePair({
        keyframeUrl: "https://img.example.com/keyframe.png",
        providerId: "volcengine",
        modelId: "seedream-3",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.firstFrame.imageUrl).toBeTruthy();
        expect(result.data.lastFrame.imageUrl).toBeTruthy();
        expect(result.data.generatedAt).toBeGreaterThan(0);
      }
    });
  });

  describe("视频追踪信息", () => {
    it("buildTrackingInfo 应构建完整的追踪信息", async () => {
      const { buildTrackingInfo } = await import("@/modules/video/task-management/services/video-tracker");

      const info = buildTrackingInfo(
        "task-e2e-001",
        "https://ark.cn-beijing.volces.com/api/v3",
        "kling",
        "seedance-1.5",
      );

      expect(info.apiUrl).toBe("https://ark.cn-beijing.volces.com/api/v3");
      expect(info.model).toBe("seedance-1.5");
      expect(info.providerName).toBeTruthy();
      expect(info.howToCheck).toBeTruthy();
    });
  });

  describe("批量视频任务管理", () => {
    it("应能批量创建和查询任务", async () => {
      const { videoTaskStorage } = await import("@/infrastructure/storage/video-tasks");

      const taskIds = ["batch-1", "batch-2", "batch-3"];
      for (const taskId of taskIds) {
        await videoTaskStorage.createVideoTask({
          taskId,
          status: "pending",
          progress: 0,
          prompt: `批量任务 ${taskId}`,
        });
      }

      const allTasks = await videoTaskStorage.getVideoTasks();
      expect(allTasks.length).toBe(3);

      const pendingTasks = await videoTaskStorage.getVideoTasksByStatus("pending");
      expect(pendingTasks.length).toBe(3);

      for (const taskId of taskIds) {
        await videoTaskStorage.updateVideoTask(taskId, {
          status: "generating",
          progress: 50,
        });
      }

      const generatingTasks = await videoTaskStorage.getVideoTasksByStatus("generating");
      expect(generatingTasks.length).toBe(3);
    });
  });
});
