import type { VideoTask } from "@/domain/schemas";
import { container } from "@/infrastructure/di";
import { cleanExpiredTasks } from "@/modules/video/recovery";
import { cleanExpiredVideoCache } from "@/modules/video/cache";
import { errorLogger } from "@/shared/error-logger";
import { pollingState } from "./polling-engine";

const SYNC_DEBOUNCE_MS = 2000;

interface SyncStoreAccessor {
  getState: () => { allTasks: VideoTask[] };
}

let _syncStore: SyncStoreAccessor | null = null;

export function registerSyncStore(store: SyncStoreAccessor) {
  _syncStore = store;
}

export function scheduleSync() {
  if (pollingState.syncTimeoutId) {
    clearTimeout(pollingState.syncTimeoutId);
  }
  pollingState.syncTimeoutId = setTimeout(async () => {
    if (pollingState.isSyncing) return;
    pollingState.isSyncing = true;
    try {
      if (!_syncStore) return;
      const state = _syncStore.getState();
      const bulkData: Partial<VideoTask>[] = state.allTasks.map((task) => ({
        taskId: task.taskId,
        status: task.status,
        progress: task.progress,
        videoUrl: task.videoUrl,
        message: task.message,
        createdAt: task.createdAt,
        model: task.model,
        prompt: task.prompt,
        parameters: task.parameters,
        expiresAt: task.createdAt
          ? new Date(new Date(task.createdAt).getTime() + 720 * 60 * 60 * 1000).toISOString()
          : new Date(Date.now() + 720 * 60 * 60 * 1000).toISOString(),
        lastPolledAt: new Date().toISOString(),
        apiUrl: task.apiUrl,
        apiEndpoint: task.apiEndpoint,
        providerId: task.providerId,
        providerModelId: task.providerModelId,
        providerFormat: task.providerFormat,
        fixedImageUrl: task.fixedImageUrl,
        fixedImageLockType: task.fixedImageLockType,
        storyId: task.storyId,
        beatId: task.beatId,
      }));
      await container.videoTaskStorage.bulkPutVideoTasks(bulkData);
    } catch (error) {
      errorLogger.error("Failed to sync video tasks", error);
      if (typeof window !== "undefined" && error instanceof Error) {
        if (error.name === "QuotaExceededError" || error.message.includes("quota")) {
          errorLogger.warn("[VideoTaskManager] 数据库配额不足，尝试清理旧数据");
          try {
            const cleanedTasksResult = await cleanExpiredTasks();
            const cleanedCache = await cleanExpiredVideoCache();
            errorLogger.info(
              `[VideoTaskManager] 已清理 ${cleanedTasksResult.ok ? cleanedTasksResult.value : 0} 个过期任务和 ${cleanedCache.ok ? cleanedCache.value : 0} 个过期缓存`,
            );
          } catch (cleanError) {
            errorLogger.error("[VideoTaskManager] 清理过期数据失败，数据库空间不足", cleanError);
          }
        }
      }
    } finally {
      pollingState.isSyncing = false;
    }
  }, SYNC_DEBOUNCE_MS);
}
