import { container } from "@/infrastructure/di";
import { startBackgroundRecovery, cleanExpiredTasks } from "@/modules/video/recovery";
import { cleanExpiredVideoCache } from "@/modules/video/cache";
import { errorLogger, extractErrorMessage } from "@/shared/error-logger";
import { emitToast } from "@/shared/utils/toast-bridge";
import { t, MINUTE_MS } from "@/shared/constants";
import { isElectron } from "@/shared/utils/platform";
import { API_SERVER_PORT } from "@/config/ports";
import { AppError } from "@/domain/types/result";
import type { VideoTask } from "@/domain/schemas";
import { pollingState, checkAndStartOrStopPolling } from "./polling-engine";
// P1-6 修复：接入跨窗口任务同步
import { startCrossWindowSync } from "./sync-engine";

/** 定期清理过期视频缓存和任务记录的间隔（30 分钟） */
const CACHE_CLEANUP_INTERVAL_MS = 30 * MINUTE_MS;

interface InitStateSlice {
  allTasks: VideoTask[];
  isInitialized: boolean;
  initError: string | null;
}

export interface StoreAccessor {
  getState: () => {
    allTasks: VideoTask[];
    recoverTask: (taskId: string, status: string, videoUrl?: string) => void;
  };
  set: (
    partial:
      | Partial<InitStateSlice>
      | ((state: InitStateSlice) => Partial<InitStateSlice>),
  ) => void;
}

export function loadTasksFromStorage(store: StoreAccessor): () => Promise<void> {
  return async () => {
    try {
      const tasks = await container.videoTaskStorage.getVideoTasks();

      // 竞态保护：如果异步加载期间组件被卸载（cleanup 已运行），
      // beforeUnloadHandler 会被清除，此时不应更新状态或启动轮询
      if (pollingState.beforeUnloadHandler === null) {
        return;
      }

      store.set((state) => {
        const loadedIds = new Set(tasks.map((t) => t.taskId));
        const concurrentAdditions = state.allTasks.filter((t) => !loadedIds.has(t.taskId));
        return { allTasks: [...tasks, ...concurrentAdditions], isInitialized: true, initError: null };
      });

      try {
        const cleanedCountResult = await cleanExpiredVideoCache();
        if (cleanedCountResult.ok && cleanedCountResult.value > 0) {
          errorLogger.info(
            `[VideoTaskManager] 已清理 ${cleanedCountResult.value} 个过期视频缓存`,
          );
        }
      } catch (cleanError) {
        errorLogger.warn("[VideoTaskManager] 清理过期缓存失败", cleanError);
      }

      try {
        const expiredTaskCountResult = await cleanExpiredTasks();
        if (expiredTaskCountResult.ok && expiredTaskCountResult.value > 0) {
          errorLogger.info(
            `[VideoTaskManager] 已清理 ${expiredTaskCountResult.value} 个过期任务记录`,
          );
        }
      } catch (cleanError) {
        errorLogger.warn(
          new AppError("CLEANUP_ERROR", "清理过期任务失败", cleanError),
          "VideoTaskManager",
        );
      }

      checkAndStartOrStopPolling();
    } catch (error) {
      if (!isElectron()) {
        errorLogger.debug("Failed to load video tasks (browser mode)", error);
        store.set((state) => ({ ...state, isInitialized: true, initError: null }));
      } else {
        // Task 4.9: 启动期 DB 不可用属于可降级场景，降级为 warn 避免污染 devtools console。
        // 底层 safeQuery/safeRun 已移除 error 级别日志，此处保留 warn 提供问题追踪线索。
        errorLogger.warn("Failed to load video tasks", error);
        const msg = extractErrorMessage(error);
        store.set((state) => ({ ...state, isInitialized: true, initError: msg }));
        emitToast("error", t("video.taskLoadFailed"), msg);
      }
    } finally {
      pollingState.isInitializing = false;
    }
  };
}

export function setupRecoveredEventListener(store: StoreAccessor): void {
  if (typeof window === "undefined") return;
  // 幂等保护：先移除旧监听器，避免重复注册
  if (pollingState.recoveredEventHandler) {
    window.removeEventListener("video-task-recovered", pollingState.recoveredEventHandler);
  }
  const handleRecovered = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail?.taskId) {
      store.getState().recoverTask(detail.taskId, detail.status, detail.videoUrl);
    }
  };
  pollingState.recoveredEventHandler = handleRecovered;
  window.addEventListener("video-task-recovered", handleRecovered);
}

export function setupBackgroundRecoveryInterval(): void {
  if (typeof window === "undefined") return;
  // 幂等保护：先清除旧定时器，避免重复注册导致多个定时器并行
  if (pollingState.recoveryIntervalId) {
    clearInterval(pollingState.recoveryIntervalId);
  }
  pollingState.recoveryIntervalId = setInterval(() => {
    startBackgroundRecovery().catch((err) => {
      errorLogger.warn("[VideoTaskManager] 后台恢复失败", err);
    });
  }, 60000);
}

export function setupCacheCleanupInterval(): void {
  if (typeof window === "undefined") return;
  // 幂等保护：先清除旧定时器，避免重复注册导致多个定时器并行
  if (pollingState.cacheCleanupIntervalId) {
    clearInterval(pollingState.cacheCleanupIntervalId);
  }
  pollingState.cacheCleanupIntervalId = setInterval(async () => {
    try {
      const cleanedCache = await cleanExpiredVideoCache();
      if (cleanedCache.ok && cleanedCache.value > 0) {
        errorLogger.info(`[VideoTaskManager] 定期清理: ${cleanedCache.value} 个过期视频缓存`);
      }
      const cleanedTasksResult = await cleanExpiredTasks();
      if (cleanedTasksResult.ok && cleanedTasksResult.value > 0) {
        errorLogger.info(`[VideoTaskManager] 定期清理: ${cleanedTasksResult.value} 个过期任务记录`);
      }
    } catch (err) {
      errorLogger.warn("[VideoTaskManager] 定期清理失败", err);
    }
  }, CACHE_CLEANUP_INTERVAL_MS);
}

/**
 * 在页面卸载前通过 HTTP keepalive 批量保存任务到后端。
 *
 * 使用 fetch + keepalive 替代已弃用的同步 XHR：keepalive 让请求在页面卸载后
 * 仍能完成，且支持自定义 header。注意 keepalive 请求有 64KB body 限制，
 * 超限时需分批发送。beforeunload 是同步事件，不能用 await。
 */
function persistTasksBeforeUnload(allTasks: VideoTask[]): void {
  try {
    const bulkData = allTasks.map((task) => ({
      taskId: task.taskId,
      status: task.status,
      progress: task.progress,
      videoUrl: task.videoUrl,
      message: task.message,
      storyId: task.storyId,
      beatId: task.beatId,
      createdAt: task.createdAt,
      config: task.parameters ? { model: task.model, prompt: task.prompt, parameters: task.parameters, apiUrl: task.apiUrl, apiEndpoint: task.apiEndpoint } : undefined,
      provider: task.providerId ? { providerId: task.providerId, providerModelId: task.providerModelId, providerFormat: task.providerFormat } : undefined,
      mediaRefs: task.fixedImageUrl ? { fixedImageUrl: task.fixedImageUrl, fixedImageLockType: task.fixedImageLockType } : undefined,
      tracking: undefined,
    }));
    const bulkSaveUrl = `http://localhost:${API_SERVER_PORT}/video-tasks/bulk-save`;
    const fetchOptions = (body: string): RequestInit => ({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Electron-App": "true",
      },
      body,
      keepalive: true,
    });
    const fullPayload = JSON.stringify({ tasks: bulkData });
    const PAYLOAD_LIMIT = 60 * 1024; // 60KB, 留余量

    if (fullPayload.length > PAYLOAD_LIMIT) {
      // 超限时分批发送
      const batchSize = Math.max(
        1,
        Math.floor((allTasks.length * PAYLOAD_LIMIT) / fullPayload.length),
      );
      const promises: Promise<unknown>[] = [];
      for (let i = 0; i < allTasks.length; i += batchSize) {
        const batch = bulkData.slice(i, i + batchSize);
        const batchPayload = JSON.stringify({ tasks: batch });
        promises.push(
          fetch(bulkSaveUrl, fetchOptions(batchPayload)).catch((err) => {
            errorLogger.warn(
              "[VideoTaskManager] beforeunload 分批保存失败",
              err instanceof Error ? err : undefined,
            );
          }),
        );
      }
      // 防御性 catch：内层每个 promise 已有 .catch，但 Promise.all 本身仍可能
      // 因 catch handler 抛出而 reject，外层再兜底一次
      void Promise.all(promises).catch((err) => {
        errorLogger.warn(
          "[VideoTaskManager] beforeunload Promise.all 兜底失败",
          err instanceof Error ? err : undefined,
        );
      });
    } else {
      // 未超限，单次发送
      void fetch(bulkSaveUrl, fetchOptions(fullPayload)).catch((err) => {
        errorLogger.warn("[VideoTaskManager] beforeunload keepalive 保存失败", err instanceof Error ? err : undefined);
      });
    }
  } catch (err) {
    errorLogger.error("[VideoTaskManager] beforeunload同步保存失败", err instanceof Error ? err : undefined);
  }
}

export function setupBeforeUnloadHandler(store: StoreAccessor): void {
  if (typeof window === "undefined") return;
  // 幂等保护：先移除旧监听器，避免重复注册导致 beforeunload 触发多次
  if (pollingState.beforeUnloadHandler) {
    window.removeEventListener("beforeunload", pollingState.beforeUnloadHandler);
  }
  pollingState.beforeUnloadHandler = (e: BeforeUnloadEvent) => {
    const allTasks = store.getState().allTasks;
    const hasActive = allTasks.some(
      (t) => t.status === "pending" || t.status === "generating",
    );

    if (typeof window !== "undefined" && !!window.electronAPI) {
      // 存在任务时通过 keepalive 批量保存到后端
      if (allTasks.length > 0) {
        persistTasksBeforeUnload(allTasks);
      }
      if (pollingState.syncTimeoutId) {
        clearTimeout(pollingState.syncTimeoutId);
        pollingState.syncTimeoutId = null;
      }
      return;
    }

    if (hasActive) {
      e.preventDefault();
      e.returnValue = "";
      return "";
    }
    if (pollingState.syncTimeoutId) {
      clearTimeout(pollingState.syncTimeoutId);
      pollingState.syncTimeoutId = null;
    }
    return;
  };
  window.addEventListener("beforeunload", pollingState.beforeUnloadHandler);
}

/**
 * P1-6 修复：启动跨窗口任务变更监听。
 *
 * 多窗口场景下，窗口 A 持久化任务后通过 BroadcastChannel 通知窗口 B。
 * 窗口 B 收到通知后从 SQLite 重新加载任务到内存 store，实现准实时同步。
 * 在任务初始化时调用一次。
 */
export function setupCrossWindowSync(store: StoreAccessor): void {
  if (typeof window === "undefined") return;
  startCrossWindowSync(async () => {
    try {
      const tasks = await container.videoTaskStorage.getVideoTasks();
      // 竞态保护：组件卸载后不再更新状态
      if (pollingState.beforeUnloadHandler === null) return;
      store.set((state) => {
        const loadedIds = new Set(tasks.map((t) => t.taskId));
        const concurrentAdditions = state.allTasks.filter((t) => !loadedIds.has(t.taskId));
        return { allTasks: [...tasks, ...concurrentAdditions] };
      });
      checkAndStartOrStopPolling();
    } catch (err) {
      errorLogger.warn("[VideoTaskManager] 跨窗口同步重新加载失败", err);
    }
  });
}
