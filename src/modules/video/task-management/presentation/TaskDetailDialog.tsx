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
import { Label } from "@/shared/ui/label";
import { Badge } from "@/shared/ui/badge";
import { Video, Play, Download, Film, RotateCcw } from "lucide-react";
import type { VideoTask } from "@/modules/video/task-management";
import { getStatusColor, getStatusLabel } from "./task-status-helpers";

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
            任务详情
          </DialogTitle>
          <DialogDescription>
            {task.beatTitle || `任务 ${task.taskId?.substring(0, 8)}`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">任务ID</Label>
              <div className="text-sm font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded break-all">
                {task.taskId}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">状态</Label>
              <Badge className={getStatusColor(task.status)}>
                {getStatusLabel(task.status)}
              </Badge>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">进度</Label>
              <div className="text-sm">{task.progress || 0}%</div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">模型</Label>
              <div className="text-sm">{task.model || "未记录"}</div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">故事</Label>
              <div className="text-sm">{task.storyTitle || "-"}</div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">分镜</Label>
              <div className="text-sm">{task.beatTitle || "-"}</div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">创建时间</Label>
              <div className="text-sm">{new Date(task.createdAt).toLocaleString()}</div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">API地址</Label>
              <div className="text-sm break-all">{task.apiUrl || "-"}</div>
            </div>
          </div>

          {(task.providerId || task.providerModelId || task.providerFormat) && (
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">服务商信息</Label>
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
              <Label className="text-xs text-gray-500">参考图</Label>
              <div className="mt-1">
                <img
                  src={task.fixedImageUrl}
                  alt="参考图"
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
              <Label className="text-xs text-gray-500">提示词</Label>
              <div className="text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded max-h-32 overflow-y-auto">
                {task.prompt}
              </div>
            </div>
          )}

          {task.videoUrl && (
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">视频URL</Label>
              <div className="text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded break-all">
                {task.videoUrl}
              </div>
            </div>
          )}

          {task.message && task.status === "failed" && (
            <div className="space-y-1">
              <Label className="text-xs text-red-500">错误信息</Label>
              <div className="text-sm bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 px-2 py-1 rounded">
                {task.message}
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
                预览
              </Button>
            )}
            {task.videoUrl && (
              <Button
                variant="outline"
                className="flex-1 gap-1"
                onClick={() => onDownloadVideo(task)}
              >
                <Download className="w-4 h-4" />
                下载
              </Button>
            )}
            {task.beatId && (
              <Button
                variant="outline"
                className="flex-1 gap-1"
                onClick={() => onJumpToBeat(task)}
              >
                <Film className="w-4 h-4" />
                分镜
              </Button>
            )}
            {task.status === "failed" && task.beatId && (
              <Button
                variant="outline"
                className="flex-1 gap-1 text-orange-600"
                onClick={() => onRetryTask(task)}
              >
                <RotateCcw className="w-4 h-4" />
                重试
              </Button>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
