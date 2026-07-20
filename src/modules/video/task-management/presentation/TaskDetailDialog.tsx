import { Video, Play, Download, Film, RotateCcw } from "lucide-react";
import type { VideoTask } from "@/modules/video/task-management";
import { getStatusColor, getStatusStyle, getStatusLabel } from "./task-status-helpers";
import { t } from "@/shared/constants";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import { Modal } from "@/shared/presentation/Modal";

interface TaskDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: VideoTask | null;
  onOpenPreview: (task: VideoTask) => void;
  onDownloadVideo: (task: VideoTask) => void;
  onJumpToBeat: (task: VideoTask) => void;
  onRetryTask: (task: VideoTask) => void;
}

interface TaskDetailActionsProps {
  task: VideoTask;
  onOpenPreview: (task: VideoTask) => void;
  onDownloadVideo: (task: VideoTask) => void;
  onJumpToBeat: (task: VideoTask) => void;
  onRetryTask: (task: VideoTask) => void;
}

function TaskDetailActions({
  task,
  onOpenPreview,
  onDownloadVideo,
  onJumpToBeat,
  onRetryTask,
}: TaskDetailActionsProps) {
  const isFailed = task.status === "failed" || task.status === "timeout";
  return (
    <div className="flex gap-2 pt-2">
      {task.videoUrl && (
        <button
          type="button"
          className="btn btn-outline flex-1 gap-1"
          onClick={() => onOpenPreview(task)}
        >
          <Play className="w-4 h-4" />
          {t("task.previewButton")}
        </button>
      )}
      {task.videoUrl && (
        <button
          type="button"
          className="btn btn-outline flex-1 gap-1"
          onClick={() => onDownloadVideo(task)}
        >
          <Download className="w-4 h-4" />
          {t("task.downloadButton")}
        </button>
      )}
      {task.beatId && (
        <button
          type="button"
          className="btn btn-outline flex-1 gap-1"
          onClick={() => onJumpToBeat(task)}
        >
          <Film className="w-4 h-4" />
          {t("task.beatButton")}
        </button>
      )}
      {isFailed && (
        <button
          type="button"
          className="btn btn-outline flex-1 gap-1 text-warning"
          onClick={() => onRetryTask(task)}
        >
          <RotateCcw className="w-4 h-4" />
          {t("task.retryButton")}
        </button>
      )}
    </div>
  );
}

export function TaskDetailDialog({
  open,
  onOpenChange,
  task,
  onOpenPreview,
  onDownloadVideo,
  onJumpToBeat,
  onRetryTask,
}: TaskDetailDialogProps) {
  if (!task) return null;

  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      ariaLabel={t("task.taskLabel") + t("common.detail")}
      style={{ maxWidth: "42rem", maxHeight: "90vh", overflowY: "auto" }}
    >
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          <Video className="w-5 h-5" />
          {t("task.taskLabel") + t("common.detail")}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>
          {task.beatTitle || `${t("task.taskLabel")} ${task.taskId?.substring(0, 8)}`}
        </div>
      </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs" style={{ color: "var(--muted-fg)" }}>{t("task.taskIdLabel")}</label>
                  <div className="text-sm font-mono px-2 py-1 rounded break-all" style={{ background: "var(--muted)" }}>
                    {task.taskId}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs" style={{ color: "var(--muted-fg)" }}>{t("task.statusLabel")}</label>
                  <span className={`badge badge-info ${getStatusColor(task.status)}`} style={getStatusStyle(task.status)}>
                    {getStatusLabel(task.status)}
                  </span>
                </div>
                <div className="space-y-1">
                  <label className="text-xs" style={{ color: "var(--muted-fg)" }}>{t("task.progressLabel")}</label>
                  <div className="text-sm">{task.progress || 0}%</div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs" style={{ color: "var(--muted-fg)" }}>{t("task.modelLabel", { model: "" }).replace(": ", "")}</label>
                  <div className="text-sm">{task.model || t("task.modelNotRecorded")}</div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs" style={{ color: "var(--muted-fg)" }}>{t("task.storyLabel")}</label>
                  <div className="text-sm">{task.storyTitle || "-"}</div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs" style={{ color: "var(--muted-fg)" }}>{t("task.beatLabel")}</label>
                  <div className="text-sm">{task.beatTitle || "-"}</div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs" style={{ color: "var(--muted-fg)" }}>{t("task.createdAtLabel")}</label>
                  <div className="text-sm">{new Date(task.createdAt).toLocaleString()}</div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs" style={{ color: "var(--muted-fg)" }}>{t("task.apiUrlLabel")}</label>
                  <div className="text-sm break-all">{task.apiUrl || "-"}</div>
                </div>
              </div>

              {(task.providerId || task.providerModelId || task.providerFormat) && (
                <div className="space-y-1">
                  <label className="text-xs" style={{ color: "var(--muted-fg)" }}>{t("task.providerInfo")}</label>
                  <div className="text-sm px-2 py-1 rounded space-y-1" style={{ background: "var(--muted)" }}>
                    {task.providerId && (
                      <div>
                        Provider: <span className="font-mono">{task.providerId}</span>
                      </div>
                    )}
                    {task.providerModelId && (
                      <div>
                        Model: <span className="font-mono">{task.providerModelId}</span>
                      </div>
                    )}
                    {task.providerFormat && (
                      <div>
                        Format: <span className="font-mono">{task.providerFormat}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {task.fixedImageUrl && (
                <div className="space-y-1">
                  <label className="text-xs" style={{ color: "var(--muted-fg)" }}>{t("task.refImageLabel")}</label>
                  <div className="mt-1">
                    <img
                      src={task.fixedImageUrl}
                      alt={t("task.refImageLabel")}
                      className="max-h-32 rounded border"
                      style={{ borderColor: "var(--border)" }}
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  </div>
                  <div className="text-xs break-all mt-1" style={{ color: "var(--muted-fg)" }}>{task.fixedImageUrl}</div>
                </div>
              )}

              {task.prompt && (
                <div className="space-y-1">
                  <label className="text-xs" style={{ color: "var(--muted-fg)" }}>{t("task.promptLabel")}</label>
                  <div className="text-sm px-2 py-1 rounded max-h-32 overflow-y-auto" style={{ background: "var(--muted)" }}>
                    {task.prompt}
                  </div>
                </div>
              )}

              {task.videoUrl && (
                <div className="space-y-1">
                  <label className="text-xs" style={{ color: "var(--muted-fg)" }}>{t("task.videoUrlLabel")}</label>
                  <div className="text-sm px-2 py-1 rounded break-all" style={{ background: "var(--muted)" }}>
                    {task.videoUrl}
                  </div>
                </div>
              )}

              {task.message && (task.status === "failed" || task.status === "timeout") && (
                <div className="space-y-1">
                  <label className="text-xs" style={{ color: "var(--destructive)" }}>{t("task.errorMessage")}</label>
                  <div
                    className="text-sm px-2 py-1 rounded"
                    style={{ background: "rgba(var(--destructive-rgb), 0.1)", color: "var(--destructive)" }}
                  >
                    {mapUserFacingError(task.message)}
                  </div>
                </div>
              )}

              <TaskDetailActions
                task={task}
                onOpenPreview={onOpenPreview}
                onDownloadVideo={onDownloadVideo}
                onJumpToBeat={onJumpToBeat}
                onRetryTask={onRetryTask}
              />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button type="button" className="btn btn-ghost" onClick={() => onOpenChange(false)}>
                {t("common.close")}
              </button>
            </div>
    </Modal>
  );
}
