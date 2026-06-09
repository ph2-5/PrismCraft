import { container } from "@/infrastructure/di";
import { removeCachedVideo } from "@/modules/video/cache";
import { errorLogger } from "@/shared/error-logger";
import { emitToast } from "@/shared/utils/toast-bridge";
import { t } from "@/shared/constants";
import { AppError } from "@/domain/types/result";
import type { VideoTask } from "@/domain/schemas";

export async function removeTaskFromStorageAndCache(taskId: string): Promise<void> {
  await container.videoTaskStorage.deleteVideoTask(taskId);
  try {
    await removeCachedVideo(taskId);
  } catch (e) {
    errorLogger.warn(
      "[VideoTaskManager] 清除视频缓存失败",
      e instanceof Error ? e.message : e,
    );
  }
}

export async function removeTasksFromStorageAndCache(taskIds: string[]): Promise<void> {
  await container.videoTaskStorage.batchDeleteVideoTasks(taskIds);
  for (const id of taskIds) {
    try {
      await removeCachedVideo(id);
    } catch (e) {
      errorLogger.warn(
        new AppError("CACHE_CLEANUP_ERROR", "清除视频缓存失败", e),
        "VideoTaskManager",
      );
    }
  }
}

export async function removeTaskWithErrorHandling(taskId: string): Promise<void> {
  try {
    await removeTaskFromStorageAndCache(taskId);
  } catch (error) {
    errorLogger.error("Failed to remove video task", error);
    emitToast("error", t("video.taskDeleteTitle"), t("video.taskDeleteFailed"));
  }
}

export async function removeTasksWithErrorHandling(taskIds: string[]): Promise<void> {
  try {
    await removeTasksFromStorageAndCache(taskIds);
  } catch (error) {
    errorLogger.error("Failed to remove video tasks", error);
    emitToast("error", t("video.taskDeleteTitle"), t("video.batchDeleteFailed"));
  }
}

export async function clearCacheForTasks(taskIds: string[]): Promise<void> {
  for (const id of taskIds) {
    try {
      await removeCachedVideo(id);
    } catch (e) {
      errorLogger.warn(
        new AppError("CACHE_CLEANUP_ERROR", "清除视频缓存失败", e),
        "VideoTaskManager",
      );
    }
  }
}

export function filterTasksByStatus(
  tasks: VideoTask[],
  statuses: VideoTask["status"][],
): VideoTask[] {
  return tasks.filter((t) => statuses.includes(t.status));
}

export function excludeTasksByStatus(
  tasks: VideoTask[],
  statuses: VideoTask["status"][],
): VideoTask[] {
  return tasks.filter((t) => !statuses.includes(t.status));
}

export function excludeTasksByIds(
  tasks: VideoTask[],
  ids: string[],
): VideoTask[] {
  const idSet = new Set(ids);
  return tasks.filter((t) => !idSet.has(t.taskId));
}
