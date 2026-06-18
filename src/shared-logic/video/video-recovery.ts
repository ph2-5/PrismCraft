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
    return { success: false, message: "TASK_NOT_FOUND" };
  }

  if (taskRecord.status === "completed" && taskRecord.videoUrl) {
    return {
      success: true,
      videoUrl: taskRecord.videoUrl,
      message: "VIDEO_ALREADY_EXISTS",
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
          message: "VIDEO_RECOVERY_SUCCESS",
          status: "completed",
        };
      }

      if (FAILED_STATES.includes(status)) {
        return { success: false, message: "CLOUD_TASK_FAILED" };
      }

      if (PENDING_STATES.includes(status)) {
        return {
          success: false,
          message: "VIDEO_STILL_GENERATING",
        };
      }

      return {
        success: false,
        message: `UNKNOWN_STATUS: ${status}`,
      };
    }

    return { success: false, message: "QUERY_FAILED" };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    };
  }
}
