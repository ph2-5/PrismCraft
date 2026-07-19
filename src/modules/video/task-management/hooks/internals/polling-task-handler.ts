import type { VideoTask } from "@/domain/schemas";
import { TaskMachine, mapApiStatus, isValidTransition } from "../../domain";
import { container } from "@/infrastructure/di";
import { cacheVideoBlob } from "@/modules/video/cache";
import { persistVideoTask } from "./persist-task";
import { errorLogger } from "@/shared/error-logger";
import { emitToast } from "@/shared/utils/toast-bridge";
import { t } from "@/shared/constants";
import { withTransitionGuard } from "./transition-guard";
import { MAX_POLL_FAILURES, MAX_POLL_DURATION } from "./polling-constants";
import { DomainEvents } from "@/shared/event-types";

export interface PollResult {
  taskUpdates: Map<string, Partial<VideoTask>>;
  cacheTasks: Array<{ taskId: string; videoUrl: string }>;
  hasError: boolean;
  hasSuccess: boolean;
}

/**
 * Type guard: does the poll response carry a top-level `retryable` flag?
 * Some providers extend the base response shape with this hint; we cannot
 * assume it exists, so we narrow at runtime instead of asserting.
 */
function hasRetryable(obj: unknown): obj is { retryable?: boolean } {
  return typeof obj === "object" && obj !== null && "retryable" in obj;
}

/**
 * Type guard: does the poll response carry `data.retryable`?
 * Mirrors `hasRetryable` for the nested `data` shape some providers use.
 */
function hasDataRetryable(obj: unknown): obj is { data?: { retryable?: boolean } } {
  if (typeof obj !== "object" || obj === null || !("data" in obj)) return false;
  const data = (obj as { data?: unknown }).data;
  return typeof data === "object" && data !== null && "retryable" in data;
}

export async function handleTimedOutTasks(
  tasks: VideoTask[],
  _signal: AbortSignal,
  storeAccessor: { getState: () => { allTasks: VideoTask[]; setAllTasks: (updater: VideoTask[] | ((prev: VideoTask[]) => VideoTask[])) => void } },
): Promise<void> {
  const timedOutTasks = tasks.filter(
    (task) =>
      (task.status === "pending" || task.status === "generating") &&
      Date.now() - new Date(task.createdAt).getTime() > MAX_POLL_DURATION,
  );
  if (timedOutTasks.length === 0) return;

  emitToast("warning", t("error.videoGenerateTimeout"), t("task.timeoutRecoverHint", { count: timedOutTasks.length }));

  const validTimeoutIds = new Set<string>();
  const batchUpdates: Array<{ taskId: string; updates: Partial<VideoTask> }> = [];
  for (const task of timedOutTasks) {
    if (!TaskMachine.canTransition(task.status, "timeout")) {
      errorLogger.warn(
        { code: "INVALID_TRANSITION", message: `taskId=${task.taskId}, from=${task.status}, to=timeout` },
        "VideoTaskManager",
      );
      continue;
    }
    validTimeoutIds.add(task.taskId);
    batchUpdates.push({
      taskId: task.taskId,
      updates: {
        status: "timeout",
        message: t("task.timeoutMayStillGenerating"),
        pollFailureCount: 0,
      },
    });
  }

  if (validTimeoutIds.size > 0) {
    const state = storeAccessor.getState();
    state.setAllTasks((prev) =>
      prev.map((task) => {
        if (validTimeoutIds.has(task.taskId)) {
          return {
            ...task,
            ...withTransitionGuard(task, "timeout", {
              message: t("task.timeoutMayStillGenerating"),
              pollFailureCount: 0,
            }),
          };
        }
        return task;
      }),
    );
  }

  if (batchUpdates.length > 0) {
    try {
      await container.videoTaskStorage.batchUpdateVideoTasks(batchUpdates);
    } catch (e) {
      errorLogger.warn("[VideoTaskManager] Failed to persist timeout tasks (batch)", e);
    }
    // 标记超时后立即触发后台恢复，尝试查询云端真实状态
    // 避免超时任务等待下一个恢复周期，减少已生成视频的滞留时间
    emitToast("info", t("task.timeoutTriggerRecovery"), "");
    import("../../../recovery/services/video-recovery-service")
      .then(({ startBackgroundRecovery }) => startBackgroundRecovery())
      .catch((e) => errorLogger.warn("[VideoTaskManager] 超时后触发恢复失败", e));
  }
}

const NETWORK_ERROR_PATTERNS = [
  /ECONNREFUSED/i, /ECONNRESET/i, /ETIMEDOUT/i, /ENOTFOUND/i,
  /EPIPE/i, /EAI_AGAIN/i,
  /Failed to fetch/i, /NetworkError/i, /Network request failed/i,
  /fetch.*failed/i, /abort/i, /ERR_NETWORK/i, /ERR_CONNECTION/i,
  /socket hang up/i, /connect ETIMEDOUT/i,
  // Safari
  /Load failed/i,
  // Firefox
  /NetworkError when attempting to fetch resource/i,
  // 通用离线提示
  /offline/i, /disconnected/i, /connection.*lost/i,
  /ERR_INTERNET_DISCONNECTED/i, /ERR_NAME_NOT_RESOLVED/i,
  /ERR_ADDRESS_UNREACHABLE/i, /ERR_NETWORK_CHANGED/i,
];

/**
 * Exported so the manual-poll path (pollTaskShared) can reuse the same
 * network-error detection as the auto-poll path (handlePollException).
 */
export { NETWORK_ERROR_PATTERNS };

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError && error.message.includes("fetch")) return true;
  if (error instanceof Error) {
    return NETWORK_ERROR_PATTERNS.some((p) => p.test(error.message));
  }
  return false;
}

async function handlePollException(
  task: VideoTask,
  error: unknown,
  result: PollResult,
): Promise<void> {
  const networkError = isNetworkError(error);
  if (networkError) {
    result.taskUpdates.set(task.taskId, {
      message: t("task.networkErrorRetry"),
    });
    errorLogger.warn(
      `[VideoTaskManager] Network error polling ${task.taskId} (not counting as poll failure)`,
      error,
    );
    return;
  }

  const failCount = (task.pollFailureCount || 0) + 1;
  if (failCount >= MAX_POLL_FAILURES) {
    result.hasError = true;
    // 查询失败不等于生成失败：转为 timeout（可恢复）而非 failed（终态）
    // 云端视频可能仍在生成或已生成完成，恢复服务会继续查询云端真实状态
    result.taskUpdates.set(task.taskId, withTransitionGuard(task, "timeout", {
      message: t("task.queryFailRecoverable", { count: MAX_POLL_FAILURES }),
      pollFailureCount: 0,
    }));
    const taskLabel = task.beatTitle || task.storyTitle || task.taskId.slice(0, 8);
    emitToast("warning", t("task.queryFailRecoverableLabel", { label: taskLabel }), t("task.queryFailRecoverable", { count: MAX_POLL_FAILURES }));
  } else {
    result.taskUpdates.set(task.taskId, {
      pollFailureCount: failCount,
      message: t("task.queryExceptionProgress", { current: failCount, max: MAX_POLL_FAILURES }),
    });
  }
  await persistVideoTask(
    {
      ...task,
      status: failCount >= MAX_POLL_FAILURES ? "timeout" : task.status,
      message: failCount >= MAX_POLL_FAILURES
        ? t("task.queryFailRecoverable", { count: MAX_POLL_FAILURES })
        : task.message,
      pollFailureCount: failCount >= MAX_POLL_FAILURES ? 0 : failCount,
    },
    {
      logLevel: "error",
      logLabel: "Failed to save poll failure",
    },
  );
  errorLogger.warn(
    `[VideoTaskManager] Poll failed for ${task.taskId} (attempt ${failCount}/${MAX_POLL_FAILURES})`,
    error,
  );
}

type QueryVideoStatusResponse = Awaited<
  ReturnType<typeof container.videoProvider.queryVideoStatus>
>;
type QueryVideoStatusData = NonNullable<QueryVideoStatusResponse["data"]>;

function buildPollOptions(
  task: VideoTask,
): Parameters<typeof container.videoProvider.queryVideoStatus>[1] {
  const pollOptions: Parameters<typeof container.videoProvider.queryVideoStatus>[1] = {};
  if (task.providerId && task.providerModelId) {
    pollOptions.providerId = task.providerId;
    pollOptions.modelId = task.providerModelId;
    if (task.providerFormat) {
      pollOptions.format = task.providerFormat;
    }
  }
  return pollOptions;
}

async function handlePollSuccess(
  task: VideoTask,
  data: QueryVideoStatusData,
  result: PollResult,
): Promise<void> {
  result.hasSuccess = true;
  const justCompleted = data.status === "completed" && !!data.videoUrl;
  if (justCompleted && data.videoUrl) {
    result.cacheTasks.push({ taskId: task.taskId, videoUrl: data.videoUrl });
    const taskLabel = task.beatTitle || task.storyTitle || task.taskId.slice(0, 8);
    emitToast("success", t("task.videoGenerated"), t("task.videoSavingLocal", { label: taskLabel }));

    // Task 2A.23: emit VIDEO_TASK_COMPLETED 事件，触发一致性 QC（异步非阻塞）
    // 监听方：useQCTrigger hook → runQualityCheck → 生成 QCReport 存于 StoryBeat.qcReport
    try {
      container.eventBus.emit(DomainEvents.VIDEO_TASK_COMPLETED, {
        taskId: task.taskId,
        videoUrl: data.videoUrl,
      });
    } catch (e) {
      errorLogger.warn("[VideoTaskManager] emit VIDEO_TASK_COMPLETED 失败", e);
    }
  }
  const mappedStatus = mapApiStatus(data.status || "generating", data.videoUrl);
  if (!isValidTransition(task.status, mappedStatus)) {
    errorLogger.warn(
      { code: "INVALID_TRANSITION", message: `taskId=${task.taskId}, from=${task.status}, to=${mappedStatus}` },
      "VideoTaskManager",
    );
    result.taskUpdates.set(task.taskId, {
      pollFailureCount: 0,
    });
    return;
  }
  result.taskUpdates.set(task.taskId, withTransitionGuard(task, mappedStatus, {
    progress: data.progress || task.progress,
    videoUrl: data.videoUrl,
    message: data.message || task.message,
    pollFailureCount: 0,
  }));

  // 立即持久化已获取的 videoUrl，不依赖 2s 去抖同步
  // 防止应用崩溃/被杀时 videoUrl 丢失导致 token 浪费
  if (justCompleted && data.videoUrl) {
    await persistVideoTask(
      {
        ...task,
        status: mappedStatus,
        progress: data.progress || task.progress,
        videoUrl: data.videoUrl,
        message: data.message || task.message,
        pollFailureCount: 0,
      },
      {
        logLevel: "error",
        logLabel: `Failed to persist videoUrl for ${task.taskId}`,
      },
    );
  }
}

async function handlePollFailure(
  task: VideoTask,
  pollResp: QueryVideoStatusResponse,
  result: PollResult,
): Promise<void> {
  const apiErrorMsg = pollResp.error || t("task.apiReturnFailed");
  const isRetryable =
    (hasRetryable(pollResp) && pollResp.retryable === true) ||
    (hasDataRetryable(pollResp) && pollResp.data?.retryable === true);
  if (isRetryable) {
    result.taskUpdates.set(task.taskId, {
      message: t("task.retryableQueryFail", { error: apiErrorMsg }),
    });
    return;
  }
  result.hasError = true;
  const failCount = (task.pollFailureCount || 0) + 1;
  result.taskUpdates.set(task.taskId, {
    message: t("task.queryFail", { error: apiErrorMsg }),
    pollFailureCount: failCount,
  });
  if (failCount >= MAX_POLL_FAILURES) {
    // 查询失败不等于生成失败：转为 timeout（可恢复）而非 failed（终态）
    // API 返回失败可能是临时性问题（限流、服务波动），云端视频可能仍在生成
    result.taskUpdates.set(task.taskId, withTransitionGuard(task, "timeout", {
      message: t("task.queryFailRecoverable", { count: MAX_POLL_FAILURES }),
      pollFailureCount: 0,
    }));
    const taskLabel = task.beatTitle || task.storyTitle || task.taskId.slice(0, 8);
    emitToast("warning", t("task.queryFailRecoverableLabel", { label: taskLabel }), t("task.queryFailRecoverable", { count: MAX_POLL_FAILURES }));
  }
  await persistVideoTask(
    {
      ...task,
      status: failCount >= MAX_POLL_FAILURES ? "timeout" : task.status,
      message: failCount >= MAX_POLL_FAILURES
        ? t("task.queryFailRecoverable", { count: MAX_POLL_FAILURES })
        : task.message,
      pollFailureCount: failCount >= MAX_POLL_FAILURES ? 0 : failCount,
    },
    {
      logLevel: "error",
      logLabel: "Failed to save non-retryable poll failure",
    },
  );
}

async function pollSingleTask(
  task: VideoTask,
  signal: AbortSignal,
  result: PollResult,
): Promise<void> {
  if (signal.aborted) return;
  try {
    const pollOptions = buildPollOptions(task);
    const pollResp = await container.videoProvider.queryVideoStatus(task.taskId, pollOptions);
    if (signal.aborted) return;

    if (pollResp.success && pollResp.data) {
      await handlePollSuccess(task, pollResp.data, result);
    } else {
      await handlePollFailure(task, pollResp, result);
    }
  } catch (error) {
    await handlePollException(task, error, result);
  }
}

const CONCURRENT_LIMIT = 3;
/**
 * P2-1 修复：单次轮询周期的最大任务数。
 *
 * 之前所有活跃任务都在单个轮询周期内处理，100+ 任务时单轮耗时数分钟，
 * 导致 15s 轮询间隔形同虚设，且易触发 API 限流。
 *
 * 限制为 15 个/周期（5 批 × 3 并发），未轮询到的任务在下一周期优先处理。
 */
const MAX_TASKS_PER_POLL_CYCLE = 15;

export async function pollActiveTasks(
  tasks: VideoTask[],
  signal: AbortSignal,
): Promise<PollResult> {
  const result: PollResult = {
    taskUpdates: new Map(),
    cacheTasks: [],
    hasError: false,
    hasSuccess: false,
  };

  // P2-1 修复：保留原有过滤逻辑（timeout 任务可通过轮询恢复为 completed），
  // 但增加单轮任务数上限和按 lastPolledAt 排序，避免大量任务导致单轮耗时过长
  const activeTaskList = tasks.filter(
    (t) => t.status !== "completed" && t.status !== "failed",
  );

  // P2-1 修复：按 lastPolledAt 升序排序（最久未轮询的优先），限制单轮任务数
  const tasksToPoll = activeTaskList
    .sort((a, b) => {
      const aTime = a.lastPolledAt ? new Date(a.lastPolledAt).getTime() : 0;
      const bTime = b.lastPolledAt ? new Date(b.lastPolledAt).getTime() : 0;
      return aTime - bTime;
    })
    .slice(0, MAX_TASKS_PER_POLL_CYCLE);

  for (let i = 0; i < tasksToPoll.length; i += CONCURRENT_LIMIT) {
    if (signal.aborted) return result;
    const batch = tasksToPoll.slice(i, i + CONCURRENT_LIMIT);
    await Promise.allSettled(
      batch.map((task) => pollSingleTask(task, signal, result)),
    );
  }

  return result;
}

const CACHE_RETRY_DELAYS = [1000, 2000, 4000];

async function cacheSingleVideo(
  taskId: string,
  videoUrl: string,
  signal: AbortSignal,
): Promise<boolean> {
  try {
    await cacheVideoBlob(taskId, videoUrl);
    return true;
  } catch (firstError) {
    errorLogger.warn("[VideoTaskManager] Failed to cache video blob (initial)", firstError);
    for (let retry = 0; retry < CACHE_RETRY_DELAYS.length; retry++) {
      if (signal.aborted) return false;
      await new Promise((r) => setTimeout(r, CACHE_RETRY_DELAYS[retry]));
      if (signal.aborted) return false;
      try {
        await cacheVideoBlob(taskId, videoUrl);
        errorLogger.info(`[VideoTaskManager] Cache retry succeeded (attempt ${retry + 1}) for ${taskId}`);
        return true;
      } catch (retryError) {
        errorLogger.warn(`[VideoTaskManager] Cache retry failed (attempt ${retry + 1}) for ${taskId}`, retryError);
      }
    }
    return false;
  }
}

export async function cacheCompletedVideos(
  cacheTasks: Array<{ taskId: string; videoUrl: string }>,
  signal: AbortSignal,
  storeAccessor: { getState: () => { allTasks: VideoTask[]; setAllTasks: (updater: VideoTask[] | ((prev: VideoTask[]) => VideoTask[])) => void } },
): Promise<void> {
  const batchUpdates: Map<string, boolean> = new Map();
  for (const { taskId, videoUrl } of cacheTasks) {
    if (signal.aborted) break;
    const cached = await cacheSingleVideo(taskId, videoUrl, signal);
    if (signal.aborted) break;
    batchUpdates.set(taskId, cached);
    if (!cached) {
      const state = storeAccessor.getState();
      const task = state.allTasks.find((t) => t.taskId === taskId);
      const taskLabel = task?.beatTitle || task?.storyTitle || taskId.slice(0, 8);
      emitToast("warning", t("task.cacheFailed"), t("task.cacheFailedHint", { label: taskLabel }));
    }
  }
  if (batchUpdates.size > 0) {
    const state = storeAccessor.getState();
    state.setAllTasks((prev) =>
      prev.map((t) => {
        const cached = batchUpdates.get(t.taskId);
        if (cached === undefined) return t;
        return { ...t, cacheFailed: !cached };
      }),
    );
  }
}
