import type { Result } from "@/domain/types";
import { fromAsyncThrowable, fromThrowable, err, NotFoundError } from "@/domain/types";
import { AppError } from "@/domain/types/result";
import type { VideoTask } from "@/domain/schemas";
import type {
  VideoTaskRecoveryInfo,
  RetryDecision,
  VideoVerificationResult,
  VideoRecoveryLog,
} from "../types/video-recovery-types";
import { verifyVideoUrl } from "./video-verification-service";
import { checkForDuplicateVideos } from "./duplicate-detection-service";
import { smartRetryEngine } from "./smart-retry-engine";
import { classifyError } from "@/domain/types";
import { container } from "@/infrastructure/di";
import { errorLogger } from "@/shared/error-logger";
import { TaskMachine } from "@/modules/video/task-management";

export interface IntelligentRecoveryResult {
  videoUrl?: string;
  message: string;
  decision?: RetryDecision;
  verification?: VideoVerificationResult;
}

export interface TokenWasteCheckResult {
  risk: "high" | "medium" | "low";
  reason: string;
  suggestions: string[];
}

export async function getTaskRecoveryInfo(
  taskId: string,
  existingTasks?: VideoTask[]
): Promise<Result<VideoTaskRecoveryInfo | null>> {
  return fromAsyncThrowable(async () => {
    const logs: VideoRecoveryLog[] = [];

    const task = await container.videoTaskStorage.getVideoTaskById(taskId);
    if (!task) {
      return null;
    }

    logs.push({
      timestamp: Date.now(),
      action: "任务信息加载",
      details: `任务状态: ${task.status}`,
      success: true,
    });

    let verification: VideoVerificationResult | undefined;
    if (task.videoUrl) {
      logs.push({
        timestamp: Date.now(),
        action: "开始视频验证",
        details: task.videoUrl,
      });

      const verifyResult = await verifyVideoUrl(task.videoUrl);
      if (verifyResult.ok) {
        verification = verifyResult.value;
      }

      logs.push({
        timestamp: Date.now(),
        action: "视频验证完成",
        details: verification?.reason,
        success: verification?.isValid,
      });
    } else {
      logs.push({
        timestamp: Date.now(),
        action: "跳过视频验证",
        details: "任务没有视频URL",
      });
    }

    const duplicateCheck = existingTasks
      ? await checkForDuplicateVideos(task, existingTasks)
      : undefined;

    if (duplicateCheck) {
      logs.push({
        timestamp: Date.now(),
        action: "重复检测完成",
        details: duplicateCheck.reason,
        success: !duplicateCheck.hasDuplicate,
      });
    }

    const decision = smartRetryEngine.makeRetryDecision(
      task,
      verification,
      task.recoveryAttempts || 0
    );

    logs.push({
      timestamp: Date.now(),
      action: "重试决策",
      details: `${decision.shouldRetry ? "建议重试" : "不建议重试"} - ${decision.reason}`,
      success: decision.shouldRetry,
    });

    const statistics: {
      totalAttempts: number;
      failedAttempts: number;
      lastAttempt?: number;
      averageRetryInterval?: number;
    } = {
      totalAttempts: task.pollCount || 0,
      failedAttempts: task.recoveryAttempts || 0,
      lastAttempt: task.lastPolledAt ? new Date(task.lastPolledAt).getTime() : undefined,
    };

    if (task.createdAt && statistics.totalAttempts > 0) {
      statistics.averageRetryInterval =
        (Date.now() - new Date(task.createdAt).getTime()) / (statistics.totalAttempts + 1);
    }

    return {
      taskId,
      verification,
      decision,
      logs,
      duplicateCheck,
      statistics,
    };
  });
}

export async function performIntelligentRecovery(
  taskId: string
): Promise<Result<IntelligentRecoveryResult>> {
  const recoveryInfoResult = await getTaskRecoveryInfo(taskId);

  if (!recoveryInfoResult.ok) return recoveryInfoResult;
  const recoveryInfo = recoveryInfoResult.value;

  if (!recoveryInfo) {
    return err(new NotFoundError("VideoTask", taskId));
  }

  if (!recoveryInfo.decision.shouldRetry) {
    return err(new AppError("RETRY_NOT_RECOMMENDED", recoveryInfo.decision.reason));
  }

  if (recoveryInfo.duplicateCheck?.hasDuplicate) {
    return err(new AppError("DUPLICATE_DETECTED", `检测到重复任务 (${recoveryInfo.duplicateCheck.existingTaskId?.slice(0, 8)}...)，建议使用已有视频`));
  }

  if (
    recoveryInfo.decision.tokenWasteRisk === "high" &&
    recoveryInfo.decision.confidence === "low"
  ) {
    return err(new AppError("HIGH_RISK_RETRY", `重试风险较高 (${recoveryInfo.decision.reason})，建议手动确认后再重试`));
  }

  const task = await container.videoTaskStorage.getVideoTaskById(taskId);
  if (!task) {
    return err(new NotFoundError("VideoTask", taskId));
  }

  return fromAsyncThrowable(async () => {
    const result = await container.videoProvider.queryVideoStatus(taskId, {
      providerId: task.providerId,
      modelId: task.providerModelId,
      format: task.providerFormat,
    });

    if (result.success && result.data) {
      const status = (result.data.status || "").toLowerCase();
      const isSuccess = [
        "done",
        "completed",
        "success",
        "finished",
        "succeeded",
      ].includes(status);

      if (isSuccess && result.data.videoUrl) {
        const verifyResult = await verifyVideoUrl(result.data.videoUrl);
        const newVerification = verifyResult.ok ? verifyResult.value : undefined;

        if (newVerification?.isValid) {
          if (!TaskMachine.canTransition(task.status as VideoTask["status"] & string, "completed")) {
            errorLogger.warn(
              { code: "INVALID_TRANSITION", message: `taskId=${taskId}, from=${task.status}, to=completed` },
              "VideoIntelligentRecovery",
            );
            throw new AppError("INVALID_TRANSITION", `状态转换不合法: ${task.status} → completed`);
          }
          await container.videoTaskStorage.updateVideoTask(taskId, {
            status: "completed",
            videoUrl: result.data.videoUrl,
            recoveryAttempts: (task.recoveryAttempts || 0) + 1,
            lastPolledAt: new Date().toISOString(),
          });

          return {
            videoUrl: result.data.videoUrl,
            message: "视频找回成功！",
            decision: recoveryInfo.decision,
            verification: newVerification,
          };
        } else {
          throw new AppError("VERIFICATION_FAILED", `视频状态成功但验证失败: ${newVerification?.reason || "未知原因"}`);
        }
      }
    }

    const retryDelay = smartRetryEngine.getRecommendedRetryDelay(
      recoveryInfo.decision,
      task.recoveryAttempts || 0
    );

    throw new AppError("RECOVERY_INCOMPLETE", recoveryInfo.decision.reason, {
      retryAfterMs: retryDelay,
    });
  });
}

export async function checkForTokenWaste(
  taskId: string
): Promise<Result<TokenWasteCheckResult>> {
  const recoveryInfoResult = await getTaskRecoveryInfo(taskId);

  if (!recoveryInfoResult.ok) return recoveryInfoResult;
  const recoveryInfo = recoveryInfoResult.value;

  if (!recoveryInfo) {
    return { ok: true, value: { risk: "low", reason: "无法获取任务信息", suggestions: [] } };
  }

  return fromThrowable(() => {
    let risk: "high" | "medium" | "low" = "low";
    const suggestions: string[] = [];

    if (recoveryInfo.duplicateCheck?.hasDuplicate) {
      risk = "high";
      suggestions.push("发现相似任务，建议使用已有视频");
      suggestions.push("如需重新生成，请先删除相似任务");
    }

    if (recoveryInfo.statistics.failedAttempts > 5) {
      risk = risk === "high" ? "high" : "medium";
      suggestions.push("失败次数较多，建议检查错误日志");
    }

    const decisionCategory = recoveryInfo.decision.errorCategory ?? classifyError(undefined, recoveryInfo.decision.reason);
    if (decisionCategory === "timeout") {
      risk = risk === "high" ? "high" : "medium";
      suggestions.push("任务持续超时，可能是参数问题");
    }

    if (decisionCategory === "quota") {
      risk = "high";
      suggestions.push("账户配额问题，重试无意义");
    }

    if (decisionCategory === "invalid_params") {
      risk = "high";
      suggestions.push("参数配置有问题，重试无法解决");
    }

    if (recoveryInfo.verification && !recoveryInfo.verification.isValid) {
      if (recoveryInfo.verification.confidence === "high") {
        risk = risk === "high" ? "high" : "medium";
        suggestions.push("视频验证高置信度失败");
      }
    }

    return {
      risk,
      reason: `Token浪费风险: ${risk}`,
      suggestions,
    };
  });
}

export { verifyVideoUrl } from "./video-verification-service";
export { checkForDuplicateVideos } from "./duplicate-detection-service";
export { smartRetryEngine, createRetryEngine } from "./smart-retry-engine";
