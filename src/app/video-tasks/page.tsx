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
  const failedTasks = tasks.filter((task) => task.status === "failed").length;
  const completionRate =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <PageErrorBoundary pageName="视频任务">
      <div className="h-full space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">视频任务管理</h2>
            <p className="text-sm text-muted-foreground">
              管理所有视频生成任务
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
                      `确定要清除 ${completedTasks} 个已完成的任务吗？`,
                      "清除已完成任务",
                    )
                  ) {
                    setIsClearingCompleted(true);
                    try {
                      await clearCompletedTasks();
                      showSuccess("清除成功", "已完成的任务已清除");
                    } finally {
                      setIsClearingCompleted(false);
                    }
                  }
                }}
              >
                {isClearingCompleted ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                {isClearingCompleted ? "清除中..." : "清除已完成"}
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
                    await confirm(`确定要清除 ${failedTasks} 个失败的任务吗？`, "清除失败任务")
                  ) {
                    setIsClearingFailed(true);
                    try {
                      await clearFailedTasks();
                      showSuccess("清除成功", "失败的任务已清除");
                    } finally {
                      setIsClearingFailed(false);
                    }
                  }
                }}
              >
                {isClearingFailed ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                {isClearingFailed ? "清除中..." : "清除失败"}
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
                <List className="w-4 h-4" />
                总任务
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalTasks}</div>
            </CardContent>
          </Card>
          <Card className="bg-green-900/20 border-green-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-green-400">
                <CheckCircle2 className="w-4 h-4" />
                已完成
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-300">
                {completedTasks}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-yellow-900/20 border-yellow-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-yellow-400">
                <Clock className="w-4 h-4" />
                等待中
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-300">
                {pendingTasks}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-blue-900/20 border-blue-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-blue-400">
                <Clock className="w-4 h-4" />
                生成中
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-300">
                {processingTasks}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-red-900/20 border-red-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-red-400">
                <XCircle className="w-4 h-4" />
                失败
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-300">
                {failedTasks}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-purple-900/20 border-purple-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-purple-400">
                <CheckCircle2 className="w-4 h-4" />
                完成率
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-300">
                {completionRate}%
              </div>
              <div className="w-full bg-purple-950 rounded-full h-1.5 mt-2">
                <div
                  className="bg-purple-400 h-1.5 rounded-full transition-all"
                  style={{ width: `${completionRate}%` }}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>任务列表</CardTitle>
              <CardDescription>
                管理所有视频生成任务，支持手动找回失败任务
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {totalTasks === 0 ? (
              <div className="text-center py-16">
                <Video className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-20" />
                <h2 className="text-lg font-semibold mb-2">暂无视频任务</h2>
                <p className="text-muted-foreground mb-6">
                  在故事页面编排分镜后生成视频，或使用快速生成模式
                </p>
                <div className="flex items-center justify-center gap-3">
                  <Button onClick={() => guardedPush("/story")}>
                    查看分镜
                  </Button>
                  <Button variant="outline" onClick={() => guardedPush("/quick-generate")}>
                    快速生成
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
