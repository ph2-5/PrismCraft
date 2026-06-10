import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/shared/ui/card";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { useNavigationGuard } from "@/shared/presentation/BeforeUnloadGuard";
import { Button } from "@/shared/ui/button";
import { useVideoTaskManager } from "@/modules/video";
import { VideoTaskManager as VideoTaskManagerComponent } from "@/modules/video";
import {
  CheckCircle2,
  Clock,
  XCircle,
  List,
  Trash2,
  Video,
  Loader2,
} from "lucide-react";
import { useState } from "react";
import { confirm } from "@/shared/utils/confirm";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { t } from "@/shared/constants";

export default function VideoTasksPage() {
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

  return (
    <PageErrorBoundary pageName={t("page.videoTasks")}>
      <div className="h-full space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">{t("task.videoTaskManagement")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("task.pageTitle")}
            </p>
          </div>
          <div className="flex gap-2">
            {completedTasks > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                disabled={isClearingCompleted}
                onClick={async () => {
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
                }}
              >
                {isClearingCompleted ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                {isClearingCompleted ? t("common.clearing") : t("task.clearCompleted")}
              </Button>
            )}
            {failedTasks > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1 text-red-400 hover:text-red-300"
                disabled={isClearingFailed}
                onClick={async () => {
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
                }}
              >
                {isClearingFailed ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                {isClearingFailed ? t("common.clearing") : t("task.clearFailed")}
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
                <List className="w-4 h-4" />
                {t("task.totalTasks")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalTasks}</div>
            </CardContent>
          </Card>
          <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle2 className="w-4 h-4" />
                {t("task.completedCount")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                {completedTasks}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                <Clock className="w-4 h-4" />
                {t("task.pendingCount")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">
                {pendingTasks}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-blue-600 dark:text-blue-400">
                <Clock className="w-4 h-4" />
                {t("task.generatingCount")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                {processingTasks}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-red-600 dark:text-red-400">
                <XCircle className="w-4 h-4" />
                {t("task.failedCount")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-700 dark:text-red-300">
                {failedTasks}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-purple-600 dark:text-purple-400">
                <CheckCircle2 className="w-4 h-4" />
                {t("task.completionRate")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                {completionRate}%
              </div>
              <div className="w-full bg-purple-100 dark:bg-purple-950 rounded-full h-1.5 mt-2">
                <div
                  className="bg-purple-500 dark:bg-purple-400 h-1.5 rounded-full transition-all"
                  style={{ width: `${completionRate}%` }}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t("task.taskList")}</CardTitle>
              <CardDescription>
                {t("task.taskListDesc")}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {totalTasks === 0 ? (
              <div className="text-center py-16">
                <Video className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-20" />
                <h2 className="text-lg font-semibold mb-2">{t("task.noTasks")}</h2>
                <p className="text-muted-foreground mb-6">
                  {t("task.noTasksHint")}
                </p>
                <div className="flex items-center justify-center gap-3">
                  <Button onClick={() => guardedPush("/story")}>
                    {t("task.viewStoryboard")}
                  </Button>
                  <Button variant="outline" onClick={() => guardedPush("/quick-generate")}>
                    {t("task.quickGenerate")}
                  </Button>
                </div>
              </div>
            ) : (
              <VideoTaskManagerComponent
                tasks={allTasks}
                onBackgroundProcess={startBackgroundProcessing}
                onTaskRecovered={recoverTask}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </PageErrorBoundary>
  );
}
