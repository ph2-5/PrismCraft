import { useState, useEffect } from "react";
import { checkCachedVideo, removeCachedVideo, getCacheStats } from "@/modules/video/cache";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { errorLogger } from "@/shared/error-logger";
import type { VideoTask } from "@/domain/schemas";
import { t } from "@/shared/constants/messages";

interface UseCacheOperationsParams {
  completedTaskIds: string[];
}

export function useCacheOperations({ completedTaskIds }: UseCacheOperationsParams) {
  const { success, error } = useToastHelpers();
  const [cacheStates, setCacheStates] = useState<Map<string, { exists: boolean; fileSizeMB?: number }>>(new Map());
  const [cacheStats, setCacheStats] = useState<{ count: number; totalSizeMB: number } | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<VideoTask | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadCacheStates = async () => {
      const newCacheStates = new Map<string, { exists: boolean; fileSizeMB?: number }>();
      for (const taskId of completedTaskIds) {
        try {
          const cacheState = await checkCachedVideo(taskId);
          newCacheStates.set(taskId, { exists: cacheState.exists, fileSizeMB: cacheState.fileSizeMB });
        } catch (e) {
          errorLogger.warn("[CacheOps] Failed to check cache state", e);
          newCacheStates.set(taskId, { exists: false });
        }
      }
      if (!cancelled) setCacheStates(newCacheStates);
    };
    loadCacheStates();
    return () => { cancelled = true; };
  }, [completedTaskIds]);

  useEffect(() => {
    let cancelled = false;
    const loadStats = async () => {
      try {
        const stats = await getCacheStats();
        if (!cancelled && stats.ok) setCacheStats({ count: stats.value.count, totalSizeMB: stats.value.totalSizeMB });
      } catch (e) {
        errorLogger.warn({ code: "CACHE_STATS_ERROR", message: t("error.cacheStatsFetchFailed") }, String(e));
      }
    };
    loadStats();
    return () => { cancelled = true; };
  }, [completedTaskIds]);

  const refreshCacheStats = async () => {
    try {
      const stats = await getCacheStats();
      if (stats.ok) setCacheStats({ count: stats.value.count, totalSizeMB: stats.value.totalSizeMB });
    } catch (e) {
      errorLogger.warn({ code: "CACHE_STATS_REFRESH_ERROR", message: t("error.cacheStatsRefreshFailed") }, String(e));
    }
  };

  const handleDeleteCache = (task: VideoTask) => {
    setTaskToDelete(task);
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteCache = async () => {
    if (!taskToDelete) return;
    setIsDeleting(true);
    try {
      await removeCachedVideo(taskToDelete.taskId);
      setCacheStates((prev) => {
        const newStates = new Map(prev);
        newStates.set(taskToDelete.taskId, { exists: false });
        return newStates;
      });
      await refreshCacheStats();
      success(t("success.deleted"), t("success.cacheDeleted"));
    } catch (err) {
      error(t("error.deleteFailed"), err instanceof Error ? err.message : t("error.unknown"));
    } finally {
      setIsDeleting(false);
      setDeleteConfirmOpen(false);
      setTaskToDelete(null);
    }
  };

  return {
    cacheStates,
    cacheStats,
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    taskToDelete,
    isDeleting,
    handleDeleteCache,
    confirmDeleteCache,
    refreshCacheStats,
  };
}
