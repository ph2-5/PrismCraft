import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { Badge } from "@/shared/ui/badge";
import { Video, Play, Download, Film, RotateCcw } from "lucide-react";
import type { VideoTask } from "@/modules/video/task-management";
import { getStatusColor, getStatusLabel } from "./task-status-helpers";
import { t } from "@/shared/constants";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";

interface TaskDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: VideoTask | null;
  onOpenPreview: (task: VideoTask) => void;
  onDownloadVideo: (task: VideoTask) => void;
  onJumpToBeat: (task: VideoTask) => void;
  onRetryTask: (task: VideoTask) => void;
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="w-5 h-5" />
            {t("task.taskLabel") + t("common.detail")}
          </DialogTitle>
          <DialogDescription>
            {task.beatTitle || `${t("task.taskLabel")} ${task.taskId?.substring(0, 8)}`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">{t("task.taskIdLabel")}</Label>
              <div className="text-sm font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded break-all">
                {task.taskId}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">{t("task.statusLabel")}</Label>
              <Badge className={getStatusColor(task.status)}>
                {getStatusLabel(task.status)}
              </Badge>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">{t("task.progressLabel")}</Label>
              <div className="text-sm">{task.progress || 0}%</div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">{t("task.modelLabel", { model: "" }).replace(": ", "")}</Label>
              <div className="text-sm">{task.model || t("task.modelNotRecorded")}</div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">{t("task.storyLabel")}</Label>
              <div className="text-sm">{task.storyTitle || "-"}</div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">{t("task.beatLabel")}</Label>
              <div className="text-sm">{task.beatTitle || "-"}</div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">{t("task.createdAtLabel")}</Label>
              <div className="text-sm">{new Date(task.createdAt).toLocaleString()}</div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">{t("task.apiUrlLabel")}</Label>
              <div className="text-sm break-all">{task.apiUrl || "-"}</div>
            </div>
          </div>

          {(task.providerId || task.providerModelId || task.providerFormat) && (
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">{t("task.providerInfo")}</Label>
              <div className="text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded space-y-1">
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
              <Label className="text-xs text-gray-500">{t("task.refImageLabel")}</Label>
              <div className="mt-1">
                <img
                  src={task.fixedImageUrl}
                  alt={t("task.refImageLabel")}
                  className="max-h-32 rounded border border-gray-200 dark:border-gray-700"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
              <div className="text-xs text-gray-400 break-all mt-1">{task.fixedImageUrl}</div>
            </div>
          )}

          {task.prompt && (
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">{t("task.promptLabel")}</Label>
              <div className="text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded max-h-32 overflow-y-auto">
                {task.prompt}
              </div>
            </div>
          )}

          {task.videoUrl && (
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">{t("task.videoUrlLabel")}</Label>
              <div className="text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded break-all">
                {task.videoUrl}
              </div>
            </div>
          )}

          {task.message && (task.status === "failed" || task.status === "timeout") && (
            <div className="space-y-1">
              <Label className="text-xs text-red-500">{t("task.errorMessage")}</Label>
              <div className="text-sm bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 px-2 py-1 rounded">
                {mapUserFacingError(task.message)}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            {task.videoUrl && (
              <Button
                variant="outline"
                className="flex-1 gap-1"
                onClick={() => onOpenPreview(task)}
              >
                <Play className="w-4 h-4" />
                {t("task.previewButton")}
              </Button>
            )}
            {task.videoUrl && (
              <Button
                variant="outline"
                className="flex-1 gap-1"
                onClick={() => onDownloadVideo(task)}
              >
                <Download className="w-4 h-4" />
                {t("task.downloadButton")}
              </Button>
            )}
            {task.beatId && (
              <Button
                variant="outline"
                className="flex-1 gap-1"
                onClick={() => onJumpToBeat(task)}
              >
                <Film className="w-4 h-4" />
                {t("task.beatButton")}
              </Button>
            )}
            {(task.status === "failed" || task.status === "timeout") && (
              <Button
                variant="outline"
                className="flex-1 gap-1 text-orange-600"
                onClick={() => onRetryTask(task)}
              >
                <RotateCcw className="w-4 h-4" />
                {t("task.retryButton")}
              </Button>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
