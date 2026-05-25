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
import { Loader2 } from "lucide-react";
import type { VideoTask } from "@/modules/video/task-management";

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: VideoTask | null;
  isDeleting: boolean;
  onConfirm: () => void;
  cacheFileSizeMB?: number;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  task,
  isDeleting,
  onConfirm,
  cacheFileSizeMB,
}: DeleteConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>确认删除本地缓存</DialogTitle>
          <DialogDescription>
            确定要删除这个视频的本地缓存吗？删除后您仍然可以从云端重新下载。
          </DialogDescription>
        </DialogHeader>

        {task && (
          <div className="space-y-2 py-4">
            <div className="text-sm">
              <span className="text-gray-500">任务:</span>{" "}
              <span className="font-medium">
                {task.beatTitle || `任务 ${(task.taskId || "unknown").substring(0, 8)}...`}
              </span>
            </div>
            {cacheFileSizeMB !== undefined && (
              <div className="text-sm">
                <span className="text-gray-500">大小:</span>{" "}
                <span className="font-medium">{cacheFileSizeMB.toFixed(2)} MB</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            取消
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
            className="gap-2"
          >
            {isDeleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            )}
            {isDeleting ? "删除中..." : "确认删除"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
