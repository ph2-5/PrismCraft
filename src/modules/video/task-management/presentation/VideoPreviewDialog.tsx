import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Video, Download, AlertTriangle } from "lucide-react";
import type { VideoTask } from "@/modules/video/task-management";
import { t } from "@/shared/constants";

const VIDEO_MAX_HEIGHT_STYLE = { maxHeight: "60vh" } as const;

interface VideoPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: VideoTask | null;
  cachedVideoUrl: string | null;
  videoLoadError: boolean;
  videoLoading: boolean;
  onSetVideoLoadError: (error: boolean) => void;
  onDownloadVideo: (task: VideoTask) => void;
}

export function VideoPreviewDialog({
  open,
  onOpenChange,
  task,
  cachedVideoUrl,
  videoLoadError,
  videoLoading,
  onSetVideoLoadError,
  onDownloadVideo,
}: VideoPreviewDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        onOpenChange(isOpen);
      }}
    >
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="w-5 h-5" />
            {t("task.videoPreview")}
          </DialogTitle>
          <DialogDescription>
            {task
              ? task.beatTitle || `${t("task.taskLabel")} ${(task.taskId || "unknown").substring(0, 8)}`
              : t("task.viewGeneratedVideo")}
          </DialogDescription>
        </DialogHeader>

        {task && videoLoading && (
          <div className="p-12 text-center space-y-4">
            <div className="animate-spin w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full mx-auto" />
            <p style={{ color: "var(--muted-fg)" }}>{t("task.videoLoading")}</p>
          </div>
        )}

        {task && (cachedVideoUrl || task.videoUrl) && !videoLoadError && !videoLoading && (
          <div className="space-y-4">
            <div className="bg-black rounded-lg overflow-hidden">
              <video
                src={cachedVideoUrl || task.videoUrl}
                controls
                className="w-full"
                style={VIDEO_MAX_HEIGHT_STYLE}
                onError={(e) => {
                  const target = e.currentTarget;
                  if (target.dataset.retried) return;
                  target.dataset.retried = "1";
                  onSetVideoLoadError(true);
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm" style={{ color: "var(--muted-fg)" }}>
                {t("task.taskIdPrefix")}
                <code className="px-1 py-0.5 rounded" style={{ background: "var(--muted)" }}>
                  {task.taskId}
                </code>
              </div>
              <Button onClick={() => onDownloadVideo(task)} className="gap-2">
                <Download className="w-4 h-4" />
                {t("task.downloadVideo")}
              </Button>
            </div>
          </div>
        )}

        {task && videoLoadError && (
          <div className="p-8 text-center space-y-4">
            <AlertTriangle className="w-12 h-12 mx-auto" style={{ color: "var(--warning)" }} />
            <p style={{ color: "var(--muted-fg)" }}>{t("task.videoLoadFailed")}</p>
            <p className="text-sm" style={{ color: "var(--muted-fg)" }}>{t("task.taskIdPrefix")}{task.taskId}</p>
            <Button onClick={() => onDownloadVideo(task)} className="gap-2">
              <Download className="w-4 h-4" />
              {t("task.tryDownloadVideo")}
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
