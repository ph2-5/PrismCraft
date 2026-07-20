import { Film, Download, Layers, Trash2, RefreshCw, AlertCircle, Lightbulb, Drama, Home, Settings } from "lucide-react";
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
        <div
          className="card !border-2 !border-[rgba(var(--primary-rgb),0.5)]"
        >
          <div className="px-4 pt-3 pb-1">
            <div
              className="flex items-center gap-2 text-base font-semibold text-foreground"
            >
              <Film className="w-5 h-5 text-primary" />
              {t("quickGenerate.currentTask")}
            </div>
          </div>
          <div className="px-4 pb-4 space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {currentTask.status === "pending" && t("quickGenerate.queuing")}
                  {currentTask.status === "generating" && t("quickGenerate.generating")}
                  {currentTask.status === "completed" && t("quickGenerate.completed")}
                  {currentTask.status === "failed" && t("quickGenerate.generateFailed")}
                  {currentTask.status === "timeout" && t("quickGenerate.generateTimeout")}
                </span>
                <span className="text-muted-foreground">
                  {currentTask.progress}%
                </span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${currentTask.progress}%` }}
                />
              </div>
            </div>

            {(currentTask.status === "failed" || currentTask.status === "timeout") && (
              <div
                className="flex items-start gap-2 p-3 rounded-lg border !bg-[rgba(var(--destructive-rgb),0.3)] !border-[rgba(var(--destructive-rgb),0.5)]"
              >
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-destructive" />
                <p className="text-sm text-destructive">
                  {mapUserFacingError(currentTask.message) || t("quickGenerate.generateFailedRetry")}
                </p>
              </div>
            )}

            {currentTask.status === "completed" &&
              effectiveVideoUrl && (
                <div className="space-y-4">
                  <div className="aspect-video rounded-lg overflow-hidden border bg-black border-border">
                    <video
                      src={effectiveVideoUrl}
                      controls
                      className="w-full h-full"
                      poster={characterPosterImage || undefined}
                      onError={createVideoErrorHandler()}
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn btn-primary flex-1"
                      onClick={() =>
                        onDownload(
                          effectiveVideoUrl || "",
                          `quick-video-${Date.now()}.mp4`,
                        )
                      }
                    >
                      <Download className="w-4 h-4 mr-2" />
                      {t("quickGenerate.downloadVideo")}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => onSaveToAssets(currentTask)}
                    >
                      <Layers className="w-4 h-4 mr-2" />
                      {t("common.save")}
                    </button>
                  </div>
                </div>
              )}
          </div>
        </div>
      )}

      {!currentTask && tasks.filter((t) => t.taskId !== activeTaskId).length === 0 && (
        <div
          className="card !p-8 !border-dashed !bg-card2 text-center"
        >
          <Film size={48} className="mx-auto mb-3 text-muted-foreground opacity-30" />
          <div className="text-[15px] font-semibold text-foreground mb-1.5">
            {t("quickGenerate.noResultTitle")}
          </div>
          <p className="text-xs text-muted-foreground leading-[1.6]">
            {t("quickGenerate.noResultDesc")}
          </p>
        </div>
      )}

      {tasks.filter((t) => t.taskId !== activeTaskId).length > 0 && (
        <TaskHistoryList
          tasks={tasks}
          activeTaskId={activeTaskId}
          isGenerating={isGenerating}
          onDownload={onDownload}
          onRetry={onRetry}
          onClearCompleted={onClearCompleted}
        />
      )}

      <QuickTipsCard />
    </div>
  );
}

interface TaskHistoryListProps {
  tasks: VideoTask[];
  activeTaskId: string | null;
  isGenerating: boolean;
  onDownload: (videoUrl: string | undefined, filename: string) => void;
  onRetry: (task: VideoTask) => void;
  onClearCompleted: () => void;
}

function TaskHistoryList({
  tasks, activeTaskId, isGenerating, onDownload, onRetry, onClearCompleted,
}: TaskHistoryListProps) {
  return (
    <div className="card">
      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold text-foreground">
            {t("quickGenerate.history")}
          </div>
          <button
            type="button"
            className="btn btn-outline btn-sm"
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
          </button>
        </div>
      </div>
      <div className="px-4 pb-4 space-y-3 max-h-96 overflow-y-auto">
        {tasks
          .filter((t) => t.taskId !== activeTaskId)
          .slice()
          .reverse()
          .map((task) => (
            <div
              key={task.taskId}
              className="p-3 rounded-lg border bg-muted border-border"
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    background:
                      task.status === "completed"
                        ? "rgba(var(--success-rgb), 0.5)"
                        : task.status === "failed"
                          ? "rgba(var(--destructive-rgb), 0.5)"
                          : "rgba(var(--warning-rgb), 0.5)",
                    color:
                      task.status === "completed"
                        ? "var(--success)"
                        : task.status === "failed"
                          ? "var(--destructive)"
                          : "var(--warning)",
                  }}
                >
                  {task.status === "completed" && t("quickGenerate.statusCompleted")}
                  {task.status === "failed" && t("quickGenerate.statusFailed")}
                  {task.status === "timeout" && t("quickGenerate.statusTimeout")}
                  {["pending", "generating"].includes(task.status) &&
                    t("quickGenerate.statusProcessing")}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(task.createdAt).toLocaleTimeString()}
                </span>
              </div>
              {task.videoUrl && (
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm flex-1"
                    onClick={() =>
                      onDownload(
                        task.videoUrl,
                        `quick-video-${task.taskId}.mp4`,
                      )
                    }
                  >
                    <Download className="w-4 h-4 mr-1" />
                    {t("beat.download")}
                  </button>
                </div>
              )}
              {(task.status === "failed" || task.status === "timeout") && (
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm flex-1"
                    disabled={isGenerating}
                    onClick={() => {
                      if (isGenerating) return;
                      onRetry(task);
                    }}
                  >
                    <RefreshCw className="w-4 h-4 mr-1" />
                    {t("common.retry")}
                  </button>
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}

function QuickTipsCard() {
  return (
    <div className="card quick-tips-card">
      <div className="px-4 pt-3 pb-1">
        <div className="text-lg font-semibold text-foreground">
          {t("quickGenerate.tips")}
        </div>
      </div>
      <div className="px-4 pb-4 space-y-3 text-sm">
        <p className="text-muted-foreground"><Lightbulb className="inline-block" size={12} /> {t("quickGenerate.tipDetailedDesc")}</p>
        <p className="text-muted-foreground"><Drama className="inline-block" size={12} /> {t("quickGenerate.tipLockCharacter")}</p>
        <p className="text-muted-foreground"><Home className="inline-block" size={12} /> {t("quickGenerate.tipLockScene")}</p>
        <p className="text-muted-foreground"><Settings className="inline-block" size={12} /> {t("quickGenerate.tipProMode")}</p>
      </div>
    </div>
  );
}
