import { useMemo } from "react";
import { useVideoTaskStore } from "./use-video-task-manager";
import type { VideoTask } from "@/domain/schemas";

export interface VideoTaskQueries {
  allTasks: VideoTask[];
  activeTasks: VideoTask[];
  completedTasks: VideoTask[];
  failedTasks: VideoTask[];
  hasActiveTasks: boolean;
  activeTaskId: string | null;
  taskCount: number;
  isBackgroundProcessing: boolean;
  isInitialized: boolean;
  isCreating: boolean;
  initError: string | null;
}

export function useVideoTaskQueries(): VideoTaskQueries {
  const allTasks = useVideoTaskStore((s) => s.allTasks);
  const isBackgroundProcessing = useVideoTaskStore((s) => s.isBackgroundProcessing);
  const isInitialized = useVideoTaskStore((s) => s.isInitialized);
  const isCreating = useVideoTaskStore((s) => s.isCreating);
  const initError = useVideoTaskStore((s) => s.initError);

  // 性能优化：单次遍历 allTasks 完成三组分类
  // 原实现使用 3 个 useMemo + 3 次 filter()，每次 allTasks 变更触发 3 次遍历
  // 现合并为 1 次 reduce，O(n) → O(n)（常数项减为 1/3）
  const { activeTasks, completedTasks, failedTasks } = useMemo(() => {
    const active: VideoTask[] = [];
    const completed: VideoTask[] = [];
    const failed: VideoTask[] = [];
    for (const t of allTasks) {
      if (t.status === "pending" || t.status === "generating") {
        active.push(t);
      } else if (t.status === "completed") {
        completed.push(t);
      } else if (t.status === "failed" || t.status === "timeout") {
        failed.push(t);
      }
    }
    return { activeTasks: active, completedTasks: completed, failedTasks: failed };
  }, [allTasks]);

  const hasActiveTasks = activeTasks.length > 0;
  const activeTaskId = activeTasks.length > 0 ? activeTasks[activeTasks.length - 1]?.taskId ?? null : null;
  const taskCount = allTasks.length;

  return useMemo(() => ({
    allTasks,
    activeTasks,
    completedTasks,
    failedTasks,
    hasActiveTasks,
    activeTaskId,
    taskCount,
    isBackgroundProcessing,
    isInitialized,
    isCreating,
    initError,
  }), [allTasks, activeTasks, completedTasks, failedTasks, hasActiveTasks, activeTaskId, taskCount, isBackgroundProcessing, isInitialized, isCreating, initError]);
}
