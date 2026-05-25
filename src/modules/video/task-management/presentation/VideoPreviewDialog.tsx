import React from "react";
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
            视频预览
          </DialogTitle>
          <DialogDescription>
            {task
              ? task.beatTitle || `任务 ${(task.taskId || "unknown").substring(0, 8)}`
              : "查看生成的视频"}
          </DialogDescription>
        </DialogHeader>

        {task && videoLoading && (
          <div className="p-12 text-center space-y-4">
            <div className="animate-spin w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full mx-auto" />
            <p className="text-gray-400">正在加载视频...</p>
          </div>
        )}

        {task && (cachedVideoUrl || task.videoUrl) && !videoLoadError && !videoLoading && (
          <div className="space-y-4">
            <div className="bg-black rounded-lg overflow-hidden">
              <video
                src={cachedVideoUrl || task.videoUrl}
                controls
                className="w-full"
                style={{ maxHeight: "60vh" }}
                onError={() => onSetVideoLoadError(true)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">
                任务ID:{" "}
                <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
                  {task.taskId}
                </code>
              </div>
              <Button onClick={() => onDownloadVideo(task)} className="gap-2">
                <Download className="w-4 h-4" />
                下载视频
              </Button>
            </div>
          </div>
        )}

        {task && videoLoadError && (
          <div className="p-8 text-center space-y-4">
            <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto" />
            <p className="text-gray-400">视频加载失败，远程链接可能已过期</p>
            <p className="text-sm text-gray-500">任务ID: {task.taskId}</p>
            <Button onClick={() => onDownloadVideo(task)} className="gap-2">
              <Download className="w-4 h-4" />
              尝试下载视频
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
