import { Film, Download, Layers, Trash2, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Progress } from "@/shared/ui/progress";
import { type VideoTask } from "@/modules/video";
import { createVideoErrorHandler } from "@/shared/utils/media-error-handler";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import { confirm } from "@/shared/utils/confirm";
import { t } from "@/shared/constants/messages";

interface TaskResultPanelProps {
  currentTask: VideoTask | null;
  effectiveVideoUrl: string | null;
  tasks: VideoTask[];
  activeTaskId: string | null;
  isGenerating: boolean;
  onDownload: (videoUrl: string | undefined, filename: string) => void;
  onSaveToAssets: (task: VideoTask) => void;
  onRetry: (task: VideoTask) => void;
  onClearCompleted: () => void;
  characterPosterImage?: string | null;
}

export function TaskResultPanel({
  currentTask,
  effectiveVideoUrl,
  tasks,
  activeTaskId,
  isGenerating,
  onDownload,
  onSaveToAssets,
  onRetry,
  onClearCompleted,
  characterPosterImage,
}: TaskResultPanelProps) {
  return (
    <div className="space-y-6">
      {currentTask && (
        <Card className="border-2 border-purple-700/50 bg-slate-900/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Film className="w-5 h-5 text-purple-400" />
              {t("quickGenerate.currentTask")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">
                  {currentTask.status === "pending" && t("quickGenerate.queuing")}
                  {currentTask.status === "generating" && t("quickGenerate.generating")}
                  {currentTask.status === "completed" && t("quickGenerate.completed")}
                  {currentTask.status === "failed" && t("quickGenerate.generateFailed")}
                  {currentTask.status === "timeout" && t("quickGenerate.generateTimeout")}
                </span>
                <span className="text-slate-500">
                  {currentTask.progress}%
                </span>
              </div>
              <Progress
                value={currentTask.progress}
                className="bg-slate-800"
              />
            </div>

            {(currentTask.status === "failed" || currentTask.status === "timeout") && (
              <div className="flex items-start gap-2 p-3 bg-red-900/30 rounded-lg border border-red-800/50">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-300">
                  {mapUserFacingError(currentTask.message) || t("quickGenerate.generateFailedRetry")}
                </p>
              </div>
            )}

            {currentTask.status === "completed" &&
              effectiveVideoUrl && (
                <div className="space-y-4">
                  <div className="aspect-video bg-black rounded-lg overflow-hidden border border-slate-700">
                    <video
                      src={effectiveVideoUrl}
                      controls
                      className="w-full h-full"
                      poster={characterPosterImage || undefined}
                      onError={createVideoErrorHandler()}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={() =>
                        onDownload(
                          effectiveVideoUrl || "",
                          `quick-video-${Date.now()}.mp4`,
                        )
                      }
                    >
                      <Download className="w-4 h-4 mr-2" />
                      {t("quickGenerate.downloadVideo")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => onSaveToAssets(currentTask)}
                    >
                      <Layers className="w-4 h-4 mr-2" />
                      {t("common.save")}
                    </Button>
                  </div>
                </div>
              )}
          </CardContent>
        </Card>
      )}

      {tasks.filter((t) => t.taskId !== activeTaskId).length > 0 && (
        <Card className="border border-slate-800 bg-slate-900/60">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">{t("quickGenerate.history")}</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (
                    await confirm(t("confirm.clearCompletedTasks"), t("confirm.clearCompletedTasksTitle"))
                  ) {
                    onClearCompleted();
                  }
                }}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                {t("quickGenerate.clear")}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 max-h-96 overflow-y-auto">
            {tasks
              .filter((t) => t.taskId !== activeTaskId)
              .slice()
              .reverse()
              .map((task) => (
                <div
                  key={task.taskId}
                  className="p-3 rounded-lg bg-slate-800/50 border border-slate-700"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`
                        text-xs px-2 py-0.5 rounded-full
                        ${
                          task.status === "completed"
                            ? "bg-green-900/50 text-green-400"
                            : task.status === "failed"
                              ? "bg-red-900/50 text-red-400"
                              : task.status === "timeout"
                                ? "bg-orange-900/50 text-orange-400"
                                : "bg-yellow-900/50 text-yellow-400"
                        }
                      `}
                    >
                      {task.status === "completed" && t("quickGenerate.statusCompleted")}
                      {task.status === "failed" && t("quickGenerate.statusFailed")}
                      {task.status === "timeout" && t("quickGenerate.statusTimeout")}
                      {["pending", "generating"].includes(task.status) &&
                        t("quickGenerate.statusProcessing")}
                    </span>
                    <span className="text-xs text-slate-500">
                      {new Date(task.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  {task.videoUrl && (
                    <div className="flex gap-2 mt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() =>
                          onDownload(
                            task.videoUrl,
                            `quick-video-${task.taskId}.mp4`,
                          )
                        }
                      >
                        <Download className="w-4 h-4 mr-1" />
                        {t("beat.download")}
                      </Button>
                    </div>
                  )}
                  {(task.status === "failed" || task.status === "timeout") && (
                    <div className="flex gap-2 mt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        disabled={isGenerating}
                        onClick={() => {
                          if (isGenerating) return;
                          onRetry(task);
                        }}
                      >
                        <RefreshCw className="w-4 h-4 mr-1" />
                        {t("common.retry")}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      <Card className="border border-slate-800 bg-gradient-to-br from-purple-900/20 to-slate-900/60">
        <CardHeader>
          <CardTitle className="text-lg">{t("quickGenerate.tips")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-400">
          <p>💡 {t("quickGenerate.tipDetailedDesc")}</p>
          <p>🎭 {t("quickGenerate.tipLockCharacter")}</p>
          <p>🏠 {t("quickGenerate.tipLockScene")}</p>
          <p>⚙️ {t("quickGenerate.tipProMode")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
