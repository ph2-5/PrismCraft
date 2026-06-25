import { Film, Download, Layers, Trash2, RefreshCw, AlertCircle } from "lucide-react";
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
          className="card"
          style={{
            padding: 16,
            border: "2px solid rgba(var(--primary-rgb), 0.5)",
            background: "var(--card)",
          }}
        >
          <div style={{ padding: "12px 16px 4px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 16,
                fontWeight: 600,
                color: "var(--fg)",
              }}
            >
              <Film className="w-5 h-5" style={{ color: "var(--primary)" }} />
              {t("quickGenerate.currentTask")}
            </div>
          </div>
          <div style={{ padding: "0 16px 16px" }} className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span style={{ color: "var(--muted-fg)" }}>
                  {currentTask.status === "pending" && t("quickGenerate.queuing")}
                  {currentTask.status === "generating" && t("quickGenerate.generating")}
                  {currentTask.status === "completed" && t("quickGenerate.completed")}
                  {currentTask.status === "failed" && t("quickGenerate.generateFailed")}
                  {currentTask.status === "timeout" && t("quickGenerate.generateTimeout")}
                </span>
                <span style={{ color: "var(--muted-fg)" }}>
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
                className="flex items-start gap-2 p-3 rounded-lg border"
                style={{
                  background: "rgba(var(--destructive-rgb), 0.3)",
                  borderColor: "rgba(var(--destructive-rgb), 0.5)",
                }}
              >
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "var(--destructive)" }} />
                <p className="text-sm" style={{ color: "var(--destructive)" }}>
                  {mapUserFacingError(currentTask.message) || t("quickGenerate.generateFailedRetry")}
                </p>
              </div>
            )}

            {currentTask.status === "completed" &&
              effectiveVideoUrl && (
                <div className="space-y-4">
                  <div className="aspect-video rounded-lg overflow-hidden border" style={{ background: "#000", borderColor: "var(--border)" }}>
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
                      className="btn btn-primary"
                      style={{ flex: 1 }}
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

      {tasks.filter((t) => t.taskId !== activeTaskId).length > 0 && (
        <div
          className="card"
          style={{
            padding: 16,
            border: "1px solid var(--border)",
            background: "var(--card)",
          }}
        >
          <div style={{ padding: "12px 16px 4px" }}>
            <div className="flex items-center justify-between">
              <div style={{ fontSize: 18, fontWeight: 600, color: "var(--fg)" }}>
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
          <div style={{ padding: "0 16px 16px" }} className="space-y-3 max-h-96 overflow-y-auto">
            {tasks
              .filter((t) => t.taskId !== activeTaskId)
              .slice()
              .reverse()
              .map((task) => (
                <div
                  key={task.taskId}
                  className="p-3 rounded-lg border"
                  style={{ background: "var(--muted)", borderColor: "var(--border)" }}
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
                    <span className="text-xs" style={{ color: "var(--muted-fg)" }}>
                      {new Date(task.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  {task.videoUrl && (
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        style={{ flex: 1 }}
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
                        className="btn btn-outline btn-sm"
                        style={{ flex: 1 }}
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
      )}

      <div
        className="card"
        style={{
          padding: 16,
          border: "1px solid var(--border)",
          background:
            "linear-gradient(to bottom right, rgba(var(--primary-rgb), 0.2), var(--card))",
        }}
      >
        <div style={{ padding: "12px 16px 4px" }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: "var(--fg)" }}>
            {t("quickGenerate.tips")}
          </div>
        </div>
        <div
          style={{ padding: "0 16px 16px" }}
          className="space-y-3 text-sm"
        >
          <p style={{ color: "var(--muted-fg)" }}>💡 {t("quickGenerate.tipDetailedDesc")}</p>
          <p style={{ color: "var(--muted-fg)" }}>🎭 {t("quickGenerate.tipLockCharacter")}</p>
          <p style={{ color: "var(--muted-fg)" }}>🏠 {t("quickGenerate.tipLockScene")}</p>
          <p style={{ color: "var(--muted-fg)" }}>⚙️ {t("quickGenerate.tipProMode")}</p>
        </div>
      </div>
    </div>
  );
}
