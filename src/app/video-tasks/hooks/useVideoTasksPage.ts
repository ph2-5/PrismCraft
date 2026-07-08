import { useState, useMemo, useCallback } from "react";
import { useNavigationGuard } from "@/shared/presentation/BeforeUnloadGuard";
import { useVideoTaskManager, useVideoTaskStore } from "@/modules/video";
import { confirm } from "@/shared/utils/confirm";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { errorLogger } from "@/shared/error-logger";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import { t } from "@/shared/constants";

type StatusFilter = "all" | "processing" | "completed" | "failed";

export function useVideoTasksPage() {
  const { guardedPush } = useNavigationGuard();
  const { success: showSuccess, error: showError } = useToastHelpers();
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
        case "retrying": // retrying 视为进行中（与 POLLABLE_STATUSES 一致）
          processing++;
          break;
        case "pending":
          pending++;
          break;
        case "failed":
        case "timeout":
        case "cancelled": // cancelled 视为失败类（不可恢复终态）
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
      return tasks.filter(
        (task) => task.status === "failed" || task.status === "timeout" || task.status === "cancelled",
      );
    }
    return tasks;
  }, [tasks, statusFilter]);

  const handleRefresh = useCallback(() => {
    // 重新从 DB 加载任务，而不是重载整个 renderer 进程
    useVideoTaskStore.getState().initialize();
  }, []);

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
      } catch (e) {
        // R47/R50: 清除任务失败时必须给用户反馈，不能让 rejection 静默冒泡
        errorLogger.error("[VideoTasksPage] clearCompletedTasks failed", e);
        showError(t("error.clearFailed"), mapUserFacingError(e));
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
        showSuccess(t("task.clearFailedSuccess"), t("task.clearFailedSuccessDesc"));
      } catch (e) {
        // R47/R50: 清除失败任务本身失败时也要反馈
        errorLogger.error("[VideoTasksPage] clearFailedTasks failed", e);
        showError(t("error.clearFailed"), mapUserFacingError(e));
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
