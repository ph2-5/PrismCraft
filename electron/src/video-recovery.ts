/**
 * @deprecated 此模块与 src/ 中的实现重复，计划迁移到共享服务层。
 * 对应的 src/ 实现: src/modules/video/video-recovery.ts, src/modules/video/video-recovery-service.ts
 * 参见: src/infrastructure/server/ 用于服务端共享逻辑
 */
export const EXPIRY_HOURS = 720;
export const MAX_POLL_DURATION_MS = 30 * 60 * 1000;
export const POLL_INTERVAL_MS = 60 * 1000;
export const MAX_RECOVERY_ATTEMPTS = 30;

interface TaskRecord {
  status?: string;
  videoUrl?: string;
  providerId?: string;
  providerModelId?: string;
  providerFormat?: string;
}

interface RecoveryResult {
  success: boolean;
  videoUrl?: string;
  message: string;
  status?: string;
}

interface ApiGateway {
  videoStatus: (params: {
    taskId: string;
    providerId?: string;
    modelId?: string;
    format?: string;
  }) => Promise<{
    success: boolean;
    data?: {
      status?: string;
      videoUrl?: string;
    };
  }>;
}

const SUCCESS_STATES = ["done", "completed", "success", "finished", "succeeded"];
const FAILED_STATES = ["fail", "failed", "error"];
const PENDING_STATES = [
  "pending",
  "generating",
  "processing",
  "wait",
  "running",
  "queued",
  "in_progress",
];

export async function recoverVideoByTaskId(
  apiGateway: ApiGateway,
  taskId: string,
  taskRecord?: TaskRecord,
): Promise<RecoveryResult> {
  if (!taskRecord) {
    return { success: false, message: "找不到该任务ID" };
  }

  if (taskRecord.status === "completed" && taskRecord.videoUrl) {
    return {
      success: true,
      videoUrl: taskRecord.videoUrl,
      message: "视频已存在",
    };
  }

  try {
    const result = await apiGateway.videoStatus({
      taskId,
      providerId: taskRecord.providerId,
      modelId: taskRecord.providerModelId,
      format: taskRecord.providerFormat,
    });

    if (result.success && result.data) {
      const status = (result.data.status || "").toLowerCase();

      if (SUCCESS_STATES.includes(status) && result.data.videoUrl) {
        return {
          success: true,
          videoUrl: result.data.videoUrl,
          message: "视频找回成功！",
          status: "completed",
        };
      }

      if (FAILED_STATES.includes(status)) {
        return { success: false, message: "云端任务已确认失败" };
      }

      if (PENDING_STATES.includes(status)) {
        return {
          success: false,
          message: "视频仍在生成中，请稍后重试",
        };
      }

      return {
        success: false,
        message: `未知状态: ${status}，请稍后重试`,
      };
    }

    return { success: false, message: "查询失败，请检查网络连接" };
  } catch (error) {
    console.error("Recovery error:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "未知错误",
    };
  }
}
