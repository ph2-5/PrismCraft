/**
 * Task 2A.23: fallback-dispatcher 单元测试
 *
 * 覆盖：
 * - dispatchFallback: verdict 非 critical / regenerate / face-swap 降级 / manual_review
 * - isFallbackTerminal: actionTaken=manual_review / retryCount 超限
 * - predictNextAction: 各场景预测
 * - listFallbackHistory: 返回空数组（stub）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { VideoTask, GenerationAsset } from "@/domain/schemas";
import { createEmptyQCReport } from "../../domain/qc-schema";
import { DEFAULT_DRIFT_POLICY } from "../../domain/drift-policy";

// ── Mock 依赖 ──────────────────────────────────────────────────────────────
const {
  mockGenerationAssetStorage,
  mockContainer,
  mockErrorLogger,
  mockEmitToast,
} = vi.hoisted(() => {
  const mockGenerationAssetStorage = {
    getAssetById: vi.fn(),
    getAssetsBySourceAssetId: vi.fn().mockResolvedValue([]),
  };

  const mockContainer = {
    generationAssetStorage: mockGenerationAssetStorage,
  };

  const mockErrorLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const mockEmitToast = vi.fn();

  return { mockGenerationAssetStorage, mockContainer, mockErrorLogger, mockEmitToast };
});

vi.mock("@/infrastructure/di", () => ({
  container: mockContainer,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
}));

vi.mock("@/shared/utils/toast-bridge", () => ({
  emitToast: mockEmitToast,
}));

vi.mock("@/shared/constants", () => ({
  t: vi.fn((key: string, _params?: Record<string, unknown>) => key),
}));

// mock dynamic import of partial-edit-service
const { mockStartFaceSwapTask } = vi.hoisted(() => ({
  mockStartFaceSwapTask: vi.fn(),
}));
vi.mock("../../../partial-edit/services/partial-edit-service", () => ({
  startPartialEditTask: vi.fn(),
  startFaceSwapTask: mockStartFaceSwapTask,
  savePartialEditAsset: vi.fn(),
  listPartialEditHistory: vi.fn(),
}));

import { dispatchFallback, isFallbackTerminal, predictNextAction, listFallbackHistory } from "../fallback-dispatcher";
import type { FallbackInput } from "../fallback-dispatcher";

function createMockVideoTask(overrides: Partial<VideoTask> = {}): VideoTask {
  return {
    taskId: "task-test-1",
    status: "completed",
    progress: 100,
    message: "",
    createdAt: new Date().toISOString(),
    prompt: "test prompt",
    providerId: "test-provider",
    providerModelId: "test-model",
    ...overrides,
  } as VideoTask;
}

function createCriticalReport(retryCount = 0) {
  const report = createEmptyQCReport("task-test-1");
  report.verdict = "drift_critical";
  report.retryCount = retryCount;
  report.minScore = 0.3;
  report.averageScore = 0.5;
  return report;
}

describe("fallback-dispatcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── dispatchFallback ──────────────────────────────────────────────────────

  describe("dispatchFallback", () => {
    it("用例1: verdict 非 critical 返回 action=none", async () => {
      const report = createEmptyQCReport("task-1");
      report.verdict = "pass";
      const input: FallbackInput = {
        report,
        originalTask: createMockVideoTask(),
      };
      const result = await dispatchFallback(input);
      expect(result.action).toBe("none");
      expect(result.ok).toBe(true);
      expect(result.updatedReport.actionTaken).toBe("none");
    });

    it("用例2: drift_warning 不触发 fallback", async () => {
      const report = createEmptyQCReport("task-1");
      report.verdict = "drift_warning";
      const input: FallbackInput = {
        report,
        originalTask: createMockVideoTask(),
      };
      const result = await dispatchFallback(input);
      expect(result.action).toBe("none");
    });

    it("用例3: drift_critical + retryCount=0 触发 regenerate", async () => {
      const mockAddTask = vi.fn().mockResolvedValue({ taskId: "retry-task-1" });
      const report = createCriticalReport(0);
      const input: FallbackInput = {
        report,
        originalTask: createMockVideoTask(),
        videoTaskStore: { addTask: mockAddTask },
      };
      const result = await dispatchFallback(input);
      expect(result.action).toBe("regenerate");
      expect(result.ok).toBe(true);
      expect(result.newTaskId).toBe("retry-task-1");
      expect(mockAddTask).toHaveBeenCalledOnce();
      expect(result.updatedReport.actionTaken).toBe("regenerated");
      expect(result.updatedReport.retryCount).toBe(1);
    });

    it("用例4: regenerate 失败时返回错误", async () => {
      const mockAddTask = vi.fn().mockRejectedValue(new Error("addTask failed"));
      const report = createCriticalReport(0);
      const input: FallbackInput = {
        report,
        originalTask: createMockVideoTask(),
        videoTaskStore: { addTask: mockAddTask },
      };
      const result = await dispatchFallback(input);
      expect(result.action).toBe("regenerate");
      expect(result.ok).toBe(false);
      expect(result.error).toContain("addTask failed");
    });

    it("用例5: retryCount 达上限 + 缺少 characterRefImageUrl 降级到 manual_review", async () => {
      const mockAddTask = vi.fn();
      const report = createCriticalReport(DEFAULT_DRIFT_POLICY.maxRegenerateAttempts);
      const input: FallbackInput = {
        report,
        originalTask: createMockVideoTask(),
        videoTaskStore: { addTask: mockAddTask },
        // characterRefImageUrl 缺失
      };
      const result = await dispatchFallback(input);
      expect(result.action).toBe("manual_review");
      expect(result.ok).toBe(true);
      expect(result.updatedReport.actionTaken).toBe("manual_review");
      expect(mockAddTask).not.toHaveBeenCalled();
    });

    it("用例6: videoTaskStore 缺失时返回错误", async () => {
      const report = createCriticalReport(0);
      const input: FallbackInput = {
        report,
        originalTask: createMockVideoTask(),
        // videoTaskStore 缺失
      };
      const result = await dispatchFallback(input);
      expect(result.ok).toBe(false);
      expect(result.error).toContain("videoTaskStore 未提供");
    });

    it("用例7: retryCount 达上限 + characterRefImageUrl + startFaceSwapTask 成功 → face_swap", async () => {
      const mockAddTask = vi.fn();
      mockStartFaceSwapTask.mockResolvedValueOnce({
        ok: true,
        value: { taskId: "face-swap-task-1" },
      });
      // 提供 sourceVideoAssetId 让 getSourceVideoUrl 走 asset 查询路径
      mockGenerationAssetStorage.getAssetById.mockResolvedValueOnce({
        id: "asset-1",
        url: "https://example.com/video.mp4",
        localPath: null,
      });
      const report = createCriticalReport(DEFAULT_DRIFT_POLICY.maxRegenerateAttempts);
      const input: FallbackInput = {
        report,
        originalTask: createMockVideoTask({ sourceVideoAssetId: "asset-1" }),
        videoTaskStore: { addTask: mockAddTask },
        characterRefImageUrl: "https://example.com/char.jpg",
        characterId: "char-1",
      };
      const result = await dispatchFallback(input);
      expect(result.action).toBe("face_swap");
      expect(result.ok).toBe(true);
      expect(result.newTaskId).toBe("face-swap-task-1");
      expect(result.updatedReport.actionTaken).toBe("face_swapped");
      expect(result.updatedReport.retryCount).toBe(DEFAULT_DRIFT_POLICY.maxRegenerateAttempts + 1);
      expect(mockStartFaceSwapTask).toHaveBeenCalledOnce();
    });

    it("用例8: face-swap 失败 → 降级到 manual_review", async () => {
      const mockAddTask = vi.fn();
      mockStartFaceSwapTask.mockResolvedValueOnce({
        ok: false,
        error: { kind: "provider_call_failed", message: "provider error" },
      });
      mockGenerationAssetStorage.getAssetById.mockResolvedValueOnce({
        id: "asset-1",
        url: "https://example.com/video.mp4",
        localPath: null,
      });
      const report = createCriticalReport(DEFAULT_DRIFT_POLICY.maxRegenerateAttempts);
      const input: FallbackInput = {
        report,
        originalTask: createMockVideoTask({ sourceVideoAssetId: "asset-1" }),
        videoTaskStore: { addTask: mockAddTask },
        characterRefImageUrl: "https://example.com/char.jpg",
      };
      const result = await dispatchFallback(input);
      expect(result.action).toBe("manual_review");
      expect(result.updatedReport.actionTaken).toBe("manual_review");
    });

    it("用例9: retryCount 超过 maxRegenerateAttempts+1 直接到 manual_review", async () => {
      const mockAddTask = vi.fn();
      const report = createCriticalReport(DEFAULT_DRIFT_POLICY.maxRegenerateAttempts + 1);
      const input: FallbackInput = {
        report,
        originalTask: createMockVideoTask(),
        videoTaskStore: { addTask: mockAddTask },
        characterRefImageUrl: "https://example.com/char.jpg",
      };
      const result = await dispatchFallback(input);
      expect(result.action).toBe("manual_review");
      expect(mockStartFaceSwapTask).not.toHaveBeenCalled();
    });

    it("用例10: maxRegenerateAttempts=0 直接走 face-swap", async () => {
      const mockAddTask = vi.fn();
      mockStartFaceSwapTask.mockResolvedValueOnce({
        ok: true,
        value: { taskId: "face-swap-task-2" },
      });
      mockGenerationAssetStorage.getAssetById.mockResolvedValueOnce({
        id: "asset-2",
        url: "https://example.com/video.mp4",
        localPath: null,
      });
      const report = createCriticalReport(0);
      const input: FallbackInput = {
        report,
        originalTask: createMockVideoTask({ sourceVideoAssetId: "asset-2" }),
        videoTaskStore: { addTask: mockAddTask },
        policy: { maxRegenerateAttempts: 0 },
        characterRefImageUrl: "https://example.com/char.jpg",
      };
      const result = await dispatchFallback(input);
      // maxRegenerateAttempts=0 → 跳过 regenerate，直接走 face-swap
      expect(result.action).toBe("face_swap");
      expect(result.newTaskId).toBe("face-swap-task-2");
      expect(mockAddTask).not.toHaveBeenCalled();
    });

    it("用例11: face-swap 抛异常 → 降级到 manual_review", async () => {
      const mockAddTask = vi.fn();
      mockStartFaceSwapTask.mockRejectedValueOnce(new Error("dynamic import failed"));
      mockGenerationAssetStorage.getAssetById.mockResolvedValueOnce({
        id: "asset-1",
        url: "https://example.com/video.mp4",
        localPath: null,
      });
      const report = createCriticalReport(DEFAULT_DRIFT_POLICY.maxRegenerateAttempts);
      const input: FallbackInput = {
        report,
        originalTask: createMockVideoTask({ sourceVideoAssetId: "asset-1" }),
        videoTaskStore: { addTask: mockAddTask },
        characterRefImageUrl: "https://example.com/char.jpg",
      };
      const result = await dispatchFallback(input);
      expect(result.action).toBe("manual_review");
    });

    it("用例12: face-swap 时原视频 URL 不可用 → 返回错误", async () => {
      const mockAddTask = vi.fn();
      // 既无 videoUrl 也无 sourceVideoAssetId
      const report = createCriticalReport(DEFAULT_DRIFT_POLICY.maxRegenerateAttempts);
      const input: FallbackInput = {
        report,
        originalTask: createMockVideoTask({ videoUrl: undefined, sourceVideoAssetId: undefined }),
        videoTaskStore: { addTask: mockAddTask },
        characterRefImageUrl: "https://example.com/char.jpg",
      };
      const result = await dispatchFallback(input);
      expect(result.action).toBe("face_swap");
      expect(result.ok).toBe(false);
      expect(result.error).toContain("原视频 URL 不可用");
    });
  });

  // ── isFallbackTerminal ────────────────────────────────────────────────────

  describe("isFallbackTerminal", () => {
    it("用例1: actionTaken=manual_review 返回 true", () => {
      const report = createEmptyQCReport("task-1");
      report.actionTaken = "manual_review";
      expect(isFallbackTerminal(report, DEFAULT_DRIFT_POLICY)).toBe(true);
    });

    it("用例2: retryCount 超过 maxRegenerateAttempts+1 返回 true", () => {
      const report = createEmptyQCReport("task-1");
      report.retryCount = DEFAULT_DRIFT_POLICY.maxRegenerateAttempts + 2;
      expect(isFallbackTerminal(report, DEFAULT_DRIFT_POLICY)).toBe(true);
    });

    it("用例3: retryCount 未超限返回 false", () => {
      const report = createEmptyQCReport("task-1");
      report.retryCount = 1;
      expect(isFallbackTerminal(report, DEFAULT_DRIFT_POLICY)).toBe(false);
    });

    it("用例4: retryCount 缺失返回 false", () => {
      const report = createEmptyQCReport("task-1");
      // retryCount 未设置
      expect(isFallbackTerminal(report, DEFAULT_DRIFT_POLICY)).toBe(false);
    });
  });

  // ── predictNextAction ─────────────────────────────────────────────────────

  describe("predictNextAction", () => {
    it("用例1: verdict=pass 返回 none", () => {
      const report = createEmptyQCReport("task-1");
      report.verdict = "pass";
      expect(predictNextAction(report)).toBe("none");
    });

    it("用例2: drift_critical + retryCount=0 返回 regenerate", () => {
      const report = createCriticalReport(0);
      expect(predictNextAction(report)).toBe("regenerate");
    });

    it("用例3: drift_critical + retryCount 达上限返回 face_swap", () => {
      const report = createCriticalReport(DEFAULT_DRIFT_POLICY.maxRegenerateAttempts);
      expect(predictNextAction(report)).toBe("face_swap");
    });

    it("用例4: drift_critical + retryCount 超上限返回 manual_review", () => {
      const report = createCriticalReport(DEFAULT_DRIFT_POLICY.maxRegenerateAttempts + 1);
      expect(predictNextAction(report)).toBe("manual_review");
    });

    it("用例5: 自定义 policy 影响预测", () => {
      const report = createCriticalReport(0);
      // maxRegenerateAttempts=0 → 直接 face_swap
      expect(predictNextAction(report, { maxRegenerateAttempts: 0 })).toBe("face_swap");
    });
  });

  // ── listFallbackHistory ───────────────────────────────────────────────────

  describe("listFallbackHistory", () => {
    it("用例1: 返回空数组（stub 实现）", async () => {
      const result = await listFallbackHistory("task-1");
      expect(result).toEqual([]);
    });

    it("用例2: 查询失败时不抛出，返回空数组", async () => {
      mockGenerationAssetStorage.getAssetById.mockRejectedValueOnce(new Error("db error"));
      const result = await listFallbackHistory("task-1");
      expect(result).toEqual([]);
    });
  });
});
