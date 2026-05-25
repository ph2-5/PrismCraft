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
import { Search, Copy, ExternalLink, BookOpen } from "lucide-react";
import type { VideoTask } from "@/modules/video/task-management";
import { buildTrackingInfo, copyTrackingInfoToClipboard, openTaskQueryLink } from "../services/video-tracker";

interface TaskTrackingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: VideoTask | null;
  onToastSuccess: (title: string, message: string) => void;
  onToastError: (title: string, message: string) => void;
}

export function TaskTrackingDialog({
  open,
  onOpenChange,
  task,
  onToastSuccess,
  onToastError,
}: TaskTrackingDialogProps) {
  if (!task) return null;

  const handleCopyTracking = async () => {
    const trackingInfo = buildTrackingInfo(task.taskId, task.apiUrl, undefined, task.model);
    const result = await copyTrackingInfoToClipboard(trackingInfo);
    if (result.ok) {
      onToastSuccess("复制成功", "任务追踪信息已复制到剪贴板");
    } else {
      onToastError("复制失败", "无法复制信息到剪贴板");
    }
  };

  const handleOpenCloudLink = () => {
    const trackingInfo = buildTrackingInfo(task.taskId, task.apiUrl, undefined, task.model);
    const opened = openTaskQueryLink(trackingInfo);
    if (!opened) {
      onToastError("无法打开链接", "请手动打开云服务商控制台查询");
    }
  };

  const trackingInfo = buildTrackingInfo(task.taskId, task.apiUrl, undefined, task.model);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            视频任务追踪信息
          </DialogTitle>
          <DialogDescription>
            查看视频生成任务的详细信息，或直接前往云服务商控制台查询
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">云服务商</Label>
              <div className="text-sm font-medium">{trackingInfo.providerName}</div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">任务ID</Label>
              <div className="text-sm font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                {task.taskId}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">模型</Label>
              <div className="text-sm">{trackingInfo.model || "未记录"}</div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">创建时间</Label>
              <div className="text-sm">{new Date(task.createdAt).toLocaleString()}</div>
            </div>
          </div>

          {trackingInfo.apiUrl && (
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">API地址</Label>
              <div className="text-sm font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded break-all">
                {trackingInfo.apiUrl}
              </div>
            </div>
          )}

          {trackingInfo.queryEndpoint && (
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">查询端点</Label>
              <div className="text-sm font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded break-all">
                {trackingInfo.queryEndpoint}
              </div>
            </div>
          )}

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
            <Label className="text-sm font-medium">查询说明</Label>
            <div className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg whitespace-pre-line">
              {trackingInfo.howToCheck}
            </div>
          </div>

          {trackingInfo.apiDocUrl && (
            <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
              <BookOpen className="w-4 h-4" />
              <a
                href={trackingInfo.apiDocUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                查看API文档
              </a>
            </div>
          )}
        </div>
        <DialogFooter className="flex items-center justify-between sm:justify-end gap-2">
          <Button variant="ghost" onClick={handleCopyTracking}>
            <Copy className="w-4 h-4 mr-2" />
            复制所有信息
          </Button>
          <Button variant="default" onClick={handleOpenCloudLink}>
            <ExternalLink className="w-4 h-4 mr-2" />
            打开云控制台
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
