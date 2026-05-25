import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getTaskRecoveryInfo,
  performIntelligentRecovery,
  checkForTokenWaste,
} from "@/modules/video/recovery/services/video-intelligent-recovery-service";

vi.mock("@/modules/video/recovery/services/video-verification-service", () => ({
  verifyVideoUrl: vi.fn().mockResolvedValue({
    ok: true,
    value: {
      isValid: true,
      reason: "视频验证通过",
      confidence: "high",
    },
  }),
}));

vi.mock("@/modules/video/recovery/services/duplicate-detection-service", () => ({
  checkForDuplicateVideos: vi.fn().mockResolvedValue({
    hasDuplicate: false,
    reason: "未发现重复任务",
  }),
}));

vi.mock("@/modules/video/recovery/services/smart-retry-engine", () => ({
  smartRetryEngine: {
    makeRetryDecision: vi.fn().mockReturnValue({
      shouldRetry: true,
      reason: "任务失败，但错误原因不明确，尝试重新生成",
      confidence: "low",
      tokenWasteRisk: "medium",
    }),
    getRecommendedRetryDelay: vi.fn().mockReturnValue(10000),
  },
  createRetryEngine: vi.fn(),
  classifyError: vi.fn((errorCode?: string, errorMessage?: string) => {
    if (errorMessage) {
      if (/超时/.test(errorMessage)) return "timeout";
      if (/余额|额度|配额|quota/i.test(errorMessage)) return "quota";
      if (/参数错误/.test(errorMessage)) return "invalid_params";
      if (/network|网络|连接/i.test(errorMessage)) return "network";
      if (/rate[\s_-]?limit|限流/i.test(errorMessage)) return "rate_limit";
    }
    if (errorCode) {
      const upper = errorCode.toUpperCase();
      if (upper.includes("TIMEOUT")) return "timeout";
      if (upper.includes("QUOTA")) return "quota";
      if (upper.includes("INVALID") || upper.includes("PARAM")) return "invalid_params";
    }
    return "unknown";
  }),
}));

vi.mock("@/infrastructure/di", () => {
  const mockVideoTaskStorage = {
    getVideoTaskById: vi.fn(),
    updateVideoTask: vi.fn(),
  };
  const mockVideoProvider = {
    queryVideoStatus: vi.fn(),
  };
  return {
    container: {
      videoTaskStorage: mockVideoTaskStorage,
      videoProvider: mockVideoProvider,
    },
  };
});

vi.mock("@/shared/error-logger", () => ({
  errorLogger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
  extractErrorMessage: vi.fn((e: unknown) =>
    e instanceof Error ? e.message : String(e)
  ),
}));

vi.mock("@/modules/video/task-management", () => ({
  TaskMachine: {
    canTransition: vi.fn(() => true),
  },
}));

import { container } from "@/infrastructure/di";
import { verifyVideoUrl } from "@/modules/video/recovery/services/video-verification-service";
import { checkForDuplicateVideos } from "@/modules/video/recovery/services/duplicate-detection-service";
import { smartRetryEngine } from "@/modules/video/recovery/services/smart-retry-engine";
import { TaskMachine } from "@/modules/video/task-management";

function createMockTask(overrides: Record<string, unknown> = {}) {
  return {
    taskId: "task-1",
    status: "failed",
    progress: 0,
    message: "unknown error",
    createdAt: new Date().toISOString(),
    pollCount: 1,
    recoveryAttempts: 0,
    lastPolledAt: new Date().toISOString(),
    providerId: "volcengine",
    providerModelId: "model-1",
    providerFormat: "openai",
    ...overrides,
  };
}

describe("video-intelligent-recovery-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (smartRetryEngine.makeRetryDecision as ReturnType<typeof vi.fn>).mockReturnValue({
      shouldRetry: true,
      reason: "任务失败，但错误原因不明确，尝试重新生成",
      confidence: "low",
      tokenWasteRisk: "medium",
    });
    (smartRetryEngine.getRecommendedRetryDelay as ReturnType<typeof vi.fn>).mockReturnValue(10000);
    (TaskMachine.canTransition as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (verifyVideoUrl as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      value: {
        isValid: true,
        reason: "视频验证通过",
        confidence: "high",
      },
    });
    (checkForDuplicateVideos as ReturnType<typeof vi.fn>).mockResolvedValue({
      hasDuplicate: false,
      reason: "未发现重复任务",
    });
  });

  describe("getTaskRecoveryInfo", () => {
    it("should return null when task not found", async () => {
      (container.videoTaskStorage.getVideoTaskById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await getTaskRecoveryInfo("nonexistent");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it("should return recovery info with logs for existing task", async () => {
      (container.videoTaskStorage.getVideoTaskById as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockTask()
      );

      const result = await getTaskRecoveryInfo("task-1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).not.toBeNull();
        expect(result.value!.taskId).toBe("task-1");
        expect(result.value!.logs.length).toBeGreaterThan(0);
        expect(result.value!.decision).toBeDefined();
        expect(result.value!.statistics).toBeDefined();
      }
    });

    it("should verify video URL when task has one", async () => {
      (container.videoTaskStorage.getVideoTaskById as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockTask({ videoUrl: "https://example.com/video.mp4" })
      );

      await getTaskRecoveryInfo("task-1");
      expect(verifyVideoUrl).toHaveBeenCalledWith("https://example.com/video.mp4");
    });

    it("should skip verification when task has no video URL", async () => {
      (container.videoTaskStorage.getVideoTaskById as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockTask()
      );

      const result = await getTaskRecoveryInfo("task-1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).not.toBeNull();
        const verifyLog = result.value!.logs.find((l) => l.action === "跳过视频验证");
        expect(verifyLog).toBeDefined();
      }
    });

    it("should check for duplicates when existingTasks provided", async () => {
      (container.videoTaskStorage.getVideoTaskById as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockTask()
      );

      await getTaskRecoveryInfo("task-1", [createMockTask() as any]);
      expect(checkForDuplicateVideos).toHaveBeenCalled();
    });

    it("should skip duplicate check when no existingTasks provided", async () => {
      (container.videoTaskStorage.getVideoTaskById as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockTask()
      );

      const result = await getTaskRecoveryInfo("task-1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value!.duplicateCheck).toBeUndefined();
      }
    });

    it("should calculate average retry interval", async () => {
      const createdAt = new Date(Date.now() - 60000).toISOString();
      (container.videoTaskStorage.getVideoTaskById as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockTask({ createdAt, pollCount: 5 })
      );

      const result = await getTaskRecoveryInfo("task-1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value!.statistics.averageRetryInterval).toBeDefined();
        expect(result.value!.statistics.averageRetryInterval).toBeGreaterThan(0);
      }
    });

    it("should not calculate average retry interval when pollCount is 0", async () => {
      (container.videoTaskStorage.getVideoTaskById as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockTask({ pollCount: 0 })
      );

      const result = await getTaskRecoveryInfo("task-1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value!.statistics.averageRetryInterval).toBeUndefined();
      }
    });
  });

  describe("performIntelligentRecovery", () => {
    it("should return failure when task not found", async () => {
      (container.videoTaskStorage.getVideoTaskById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await performIntelligentRecovery("nonexistent");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("not found");
      }
    });

    it("should return failure when should not retry", async () => {
      (container.videoTaskStorage.getVideoTaskById as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockTask()
      );
      (smartRetryEngine.makeRetryDecision as ReturnType<typeof vi.fn>).mockReturnValue({
        shouldRetry: false,
        reason: "已达到最大重试次数",
        confidence: "high",
        tokenWasteRisk: "low",
      });

      const result = await performIntelligentRecovery("task-1");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("已达到最大重试次数");
      }
    });

    it("should include duplicate check when existingTasks provided", async () => {
      (container.videoTaskStorage.getVideoTaskById as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockTask()
      );
      (checkForDuplicateVideos as ReturnType<typeof vi.fn>).mockResolvedValue({
        hasDuplicate: true,
        existingTaskId: "existing-task-1234567890",
        existingVideoUrl: "https://example.com/existing.mp4",
        similarity: 0.9,
        reason: "高度相似",
      });

      const result = await getTaskRecoveryInfo("task-1", [createMockTask() as any]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).not.toBeNull();
        expect(result.value!.duplicateCheck?.hasDuplicate).toBe(true);
      }
    });

    it("should return failure when high token waste risk and low confidence", async () => {
      (container.videoTaskStorage.getVideoTaskById as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockTask()
      );
      (smartRetryEngine.makeRetryDecision as ReturnType<typeof vi.fn>).mockReturnValue({
        shouldRetry: true,
        reason: "参数错误",
        confidence: "low",
        tokenWasteRisk: "high",
      });

      const result = await performIntelligentRecovery("task-1");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("重试风险较高");
      }
    });

    it("should recover video successfully when provider returns done", async () => {
      (container.videoTaskStorage.getVideoTaskById as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockTask()
      );
      (smartRetryEngine.makeRetryDecision as ReturnType<typeof vi.fn>).mockReturnValue({
        shouldRetry: true,
        reason: "任务失败，尝试重新生成",
        confidence: "medium",
        tokenWasteRisk: "low",
      });
      (verifyVideoUrl as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        value: {
          isValid: true,
          reason: "视频验证通过",
          confidence: "high",
        },
      });
      (container.videoProvider.queryVideoStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: { status: "done", videoUrl: "https://example.com/recovered.mp4" },
      });
      (TaskMachine.canTransition as ReturnType<typeof vi.fn>).mockReturnValue(true);

      const result = await performIntelligentRecovery("task-1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.videoUrl).toBe("https://example.com/recovered.mp4");
      }
    });

    it("should return failure when video verification fails after success", async () => {
      (container.videoTaskStorage.getVideoTaskById as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockTask()
      );
      (smartRetryEngine.makeRetryDecision as ReturnType<typeof vi.fn>).mockReturnValue({
        shouldRetry: true,
        reason: "任务失败，尝试重新生成",
        confidence: "medium",
        tokenWasteRisk: "low",
      });
      (verifyVideoUrl as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        value: {
          isValid: false,
          reason: "文件内容不是有效的视频格式",
          confidence: "high",
        },
      });
      (container.videoProvider.queryVideoStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: { status: "done", videoUrl: "https://example.com/invalid.mp4" },
      });

      const result = await performIntelligentRecovery("task-1");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("视频状态成功但验证失败");
      }
    });

    it("should return failure when transition is invalid", async () => {
      (container.videoTaskStorage.getVideoTaskById as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockTask()
      );
      (smartRetryEngine.makeRetryDecision as ReturnType<typeof vi.fn>).mockReturnValue({
        shouldRetry: true,
        reason: "任务失败，尝试重新生成",
        confidence: "medium",
        tokenWasteRisk: "low",
      });
      (verifyVideoUrl as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        value: {
          isValid: true,
          reason: "视频验证通过",
          confidence: "high",
        },
      });
      (container.videoProvider.queryVideoStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: { status: "done", videoUrl: "https://example.com/recovered.mp4" },
      });
      (TaskMachine.canTransition as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const result = await performIntelligentRecovery("task-1");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("状态转换不合法");
      }
    });

    it("should return failure when task disappears during recovery", async () => {
      let callCount = 0;
      (container.videoTaskStorage.getVideoTaskById as ReturnType<typeof vi.fn>).mockImplementation(() => {
        callCount++;
        return callCount === 1 ? createMockTask() : null;
      });
      (smartRetryEngine.makeRetryDecision as ReturnType<typeof vi.fn>).mockReturnValue({
        shouldRetry: true,
        reason: "任务失败，尝试重新生成",
        confidence: "medium",
        tokenWasteRisk: "low",
      });

      const result = await performIntelligentRecovery("task-1");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("not found");
      }
    });

    it("should return failure when provider query fails", async () => {
      (container.videoTaskStorage.getVideoTaskById as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockTask()
      );
      (smartRetryEngine.makeRetryDecision as ReturnType<typeof vi.fn>).mockReturnValue({
        shouldRetry: true,
        reason: "任务失败，尝试重新生成",
        confidence: "medium",
        tokenWasteRisk: "low",
      });
      (container.videoProvider.queryVideoStatus as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Network error")
      );

      const result = await performIntelligentRecovery("task-1");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("Network error");
      }
    });

    it("should return failure when provider returns non-success result", async () => {
      (container.videoTaskStorage.getVideoTaskById as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockTask()
      );
      (smartRetryEngine.makeRetryDecision as ReturnType<typeof vi.fn>).mockReturnValue({
        shouldRetry: true,
        reason: "任务失败，尝试重新生成",
        confidence: "medium",
        tokenWasteRisk: "low",
      });
      (container.videoProvider.queryVideoStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
      });

      const result = await performIntelligentRecovery("task-1");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("RECOVERY_INCOMPLETE");
      }
    });

    it("should include retry delay in decision when provider returns pending status", async () => {
      (container.videoTaskStorage.getVideoTaskById as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockTask()
      );
      (smartRetryEngine.makeRetryDecision as ReturnType<typeof vi.fn>).mockReturnValue({
        shouldRetry: true,
        reason: "任务失败，尝试重新生成",
        confidence: "medium",
        tokenWasteRisk: "low",
      });
      (container.videoProvider.queryVideoStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: { status: "generating" },
      });
      (smartRetryEngine.getRecommendedRetryDelay as ReturnType<typeof vi.fn>).mockReturnValue(15000);

      const result = await performIntelligentRecovery("task-1");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect((result.error.cause as { retryAfterMs?: number })?.retryAfterMs).toBe(15000);
      }
    });
  });

  describe("checkForTokenWaste", () => {
    it("should return low risk when task not found", async () => {
      (container.videoTaskStorage.getVideoTaskById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await checkForTokenWaste("nonexistent");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.risk).toBe("low");
        expect(result.value.reason).toContain("无法获取任务信息");
      }
    });

    it("should return high risk when decision indicates parameter error", async () => {
      (container.videoTaskStorage.getVideoTaskById as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockTask()
      );
      (smartRetryEngine.makeRetryDecision as ReturnType<typeof vi.fn>).mockReturnValue({
        shouldRetry: false,
        reason: "参数错误导致失败",
        confidence: "high",
        tokenWasteRisk: "high",
      });

      const result = await checkForTokenWaste("task-1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.risk).toBe("high");
        expect(result.value.suggestions).toContain("参数配置有问题，重试无法解决");
      }
    });

    it("should return medium risk when many failed attempts", async () => {
      (container.videoTaskStorage.getVideoTaskById as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockTask({ recoveryAttempts: 6 })
      );

      const result = await checkForTokenWaste("task-1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.risk).not.toBe("low");
        expect(result.value.suggestions).toContain("失败次数较多，建议检查错误日志");
      }
    });

    it("should return medium risk when timeout in reason", async () => {
      (container.videoTaskStorage.getVideoTaskById as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockTask()
      );
      (smartRetryEngine.makeRetryDecision as ReturnType<typeof vi.fn>).mockReturnValue({
        shouldRetry: true,
        reason: "任务执行超时，可能是服务器处理时间过长",
        confidence: "medium",
        tokenWasteRisk: "medium",
      });

      const result = await checkForTokenWaste("task-1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.risk).not.toBe("low");
        expect(result.value.suggestions).toContain("任务持续超时，可能是参数问题");
      }
    });

    it("should return high risk when quota in reason", async () => {
      (container.videoTaskStorage.getVideoTaskById as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockTask()
      );
      (smartRetryEngine.makeRetryDecision as ReturnType<typeof vi.fn>).mockReturnValue({
        shouldRetry: false,
        reason: "账户配额不足",
        confidence: "high",
        tokenWasteRisk: "high",
      });

      const result = await checkForTokenWaste("task-1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.risk).toBe("high");
        expect(result.value.suggestions).toContain("账户配额问题，重试无意义");
      }
    });

    it("should return high risk when 余额 in reason", async () => {
      (container.videoTaskStorage.getVideoTaskById as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockTask()
      );
      (smartRetryEngine.makeRetryDecision as ReturnType<typeof vi.fn>).mockReturnValue({
        shouldRetry: false,
        reason: "余额不足",
        confidence: "high",
        tokenWasteRisk: "high",
      });

      const result = await checkForTokenWaste("task-1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.risk).toBe("high");
      }
    });

    it("should return high risk when 参数错误 in reason", async () => {
      (container.videoTaskStorage.getVideoTaskById as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockTask()
      );
      (smartRetryEngine.makeRetryDecision as ReturnType<typeof vi.fn>).mockReturnValue({
        shouldRetry: false,
        reason: "参数错误",
        confidence: "high",
        tokenWasteRisk: "high",
      });

      const result = await checkForTokenWaste("task-1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.risk).toBe("high");
        expect(result.value.suggestions).toContain("参数配置有问题，重试无法解决");
      }
    });

    it("should return medium risk when verification fails with high confidence", async () => {
      (container.videoTaskStorage.getVideoTaskById as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockTask({ videoUrl: "https://example.com/video.mp4" })
      );
      (verifyVideoUrl as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        value: {
          isValid: false,
          reason: "视频URL不可访问",
          confidence: "high",
        },
      });

      const result = await checkForTokenWaste("task-1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.risk).not.toBe("low");
        expect(result.value.suggestions).toContain("视频验证高置信度失败");
      }
    });

    it("should return low risk for normal task", async () => {
      (container.videoTaskStorage.getVideoTaskById as ReturnType<typeof vi.fn>).mockResolvedValue(
        createMockTask({ recoveryAttempts: 0 })
      );

      const result = await checkForTokenWaste("task-1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.risk).toBe("low");
      }
    });
  });
});
