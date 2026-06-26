import { useState, useMemo } from "react";
import { useNavigationGuard } from "@/shared/presentation/BeforeUnloadGuard";
import { useVideoTaskManager, useVideoTaskStore } from "@/modules/video";
import { confirm } from "@/shared/utils/confirm";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { t } from "@/shared/constants";

type StatusFilter = "all" | "processing" | "completed" | "failed";

export function useVideoTasksPage() {
  const { guardedPush } = useNavigationGuard();
  const { success: showSuccess } = useToastHelpers();
  const {
    allTasks,
    startBackgroundProcessing,
    clearCompletedTasks,
    clearFailedTasks,
    recoverTask,
  } = useVideoTaskManager();
  const isInitialized = useVideoTaskStore((s) => s.isInitialized);

  const [isClearingCompleted, setIsClearingCompleted] = useState(false);
  const [isClearingFailed, setIsClearingFailed] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const tasks = allTasks ?? [];

  // 单次遍历计算所有统计值，避免 4 次 O(n) filter
  const {
    totalTasks,
    completedTasks,
    processingTasks,
    pendingTasks,
    failedTasks,
  } = useMemo(() => {
    let completed = 0;
    let processing = 0;
    let pending = 0;
    let failed = 0;
    for (const task of tasks) {
      switch (task.status) {
        case "completed":
          completed++;
          break;
        case "generating":
          processing++;
          break;
        case "pending":
          pending++;
          break;
        case "failed":
        case "timeout":
          failed++;
          break;
      }
    }
    return {
      totalTasks: tasks.length,
      completedTasks: completed,
      processingTasks: processing,
      pendingTasks: pending,
      failedTasks: failed,
    };
  }, [tasks]);

  const completionRate =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const filteredTasks = useMemo(() => {
    if (statusFilter === "all") return tasks;
    if (statusFilter === "processing") {
      return tasks.filter((task) => task.status === "generating" || task.status === "pending");
    }
    if (statusFilter === "completed") {
      return tasks.filter((task) => task.status === "completed");
    }
    if (statusFilter === "failed") {
      return tasks.filter((task) => task.status === "failed" || task.status === "timeout");
    }
    return tasks;
  }, [tasks, statusFilter]);

  const handleRefresh = () => {
    window.location.reload();
  };

  const handleClearCompleted = async () => {
    if (
      await confirm(
        t("task.confirmClearCompleted", { count: completedTasks }),
        t("task.clearCompleted"),
      )
    ) {
      setIsClearingCompleted(true);
      try {
        await clearCompletedTasks();
        showSuccess(t("task.clearCompletedSuccess"), t("task.clearCompletedSuccessDesc"));
      } finally {
        setIsClearingCompleted(false);
      }
    }
  };

  const handleClearFailed = async () => {
    if (
      await confirm(t("task.confirmClearFailed", { count: failedTasks }), t("task.clearFailedTasks"))
    ) {
      setIsClearingFailed(true);
      try {
        await clearFailedTasks();
        showSuccess(t("task.clearCompletedSuccess"), t("task.clearFailedSuccessDesc"));
      } finally {
        setIsClearingFailed(false);
      }
    }
  };

  const navigateToStory = () => guardedPush("/storyboard");
  const navigateToQuickGenerate = () => guardedPush("/quick-generate");

  return {
    // Stats
    totalTasks,
    completedTasks,
    processingTasks,
    pendingTasks,
    failedTasks,
    completionRate,
    isLoading: !isInitialized,
    // Task data
    allTasks: filteredTasks,
    startBackgroundProcessing,
    recoverTask,
    // Filter
    statusFilter,
    setStatusFilter,
    handleRefresh,
    // Loading states
    isClearingCompleted,
    isClearingFailed,
    // Handlers
    handleClearCompleted,
    handleClearFailed,
    navigateToStory,
    navigateToQuickGenerate,
  };
}
