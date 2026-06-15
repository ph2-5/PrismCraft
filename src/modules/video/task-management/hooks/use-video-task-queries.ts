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

  const activeTasks = useMemo(
    () => allTasks.filter((t) => t.status === "pending" || t.status === "generating"),
    [allTasks],
  );

  const completedTasks = useMemo(
    () => allTasks.filter((t) => t.status === "completed"),
    [allTasks],
  );

  const failedTasks = useMemo(
    () => allTasks.filter((t) => t.status === "failed" || t.status === "timeout"),
    [allTasks],
  );

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
