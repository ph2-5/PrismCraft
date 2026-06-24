import { useState } from "react";
import { useNavigationGuard } from "@/shared/presentation/BeforeUnloadGuard";
import { useVideoTaskManager } from "@/modules/video";
import { confirm } from "@/shared/utils/confirm";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { t } from "@/shared/constants";

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

  const [isClearingCompleted, setIsClearingCompleted] = useState(false);
  const [isClearingFailed, setIsClearingFailed] = useState(false);

  const tasks = allTasks ?? [];
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(
    (task) => task.status === "completed",
  ).length;
  const processingTasks = tasks.filter(
    (task) => task.status === "generating",
  ).length;
  const pendingTasks = tasks.filter((task) => task.status === "pending").length;
  const failedTasks = tasks.filter((task) => task.status === "failed" || task.status === "timeout").length;
  const completionRate =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

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

  const navigateToStory = () => guardedPush("/story");
  const navigateToQuickGenerate = () => guardedPush("/quick-generate");

  return {
    // Stats
    totalTasks,
    completedTasks,
    processingTasks,
    pendingTasks,
    failedTasks,
    completionRate,
    // Task data
    allTasks,
    startBackgroundProcessing,
    recoverTask,
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
