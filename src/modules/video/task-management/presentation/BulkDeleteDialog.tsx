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
import { Badge } from "@/shared/ui/badge";
import { Loader2, Trash2 } from "lucide-react";
import type { VideoTask } from "@/modules/video/task-management";
import { getStatusColor, getStatusLabel } from "./task-status-helpers";

interface BulkDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTaskIds: Set<string>;
  filteredTasks: VideoTask[];
  isDeleting: boolean;
  onConfirm: () => void;
}

export function BulkDeleteDialog({
  open,
  onOpenChange,
  selectedTaskIds,
  filteredTasks,
  isDeleting,
  onConfirm,
}: BulkDeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>确认批量删除</DialogTitle>
          <DialogDescription>
            确定要删除选中的 {selectedTaskIds.size} 个任务吗？
            <br />
            这将同时删除任务记录和本地缓存（如果有）。
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-2">
          <div className="text-sm text-gray-600 dark:text-gray-300">将要删除的任务：</div>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {Array.from(selectedTaskIds)
              .map((taskId) => filteredTasks.find((t) => t.taskId === taskId))
              .filter(Boolean)
              .slice(0, 10)
              .map((task, index) => (
                <div
                  key={task?.taskId || `task-${index}`}
                  className="text-sm bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded flex items-center justify-between"
                >
                  <span className="truncate flex-1">
                    {task?.beatTitle || `任务 ${(task?.taskId || "unknown").substring(0, 8)}...`}
                  </span>
                  <Badge className={`ml-2 ${task ? getStatusColor(task.status) : ""}`}>
                    {task ? getStatusLabel(task.status) : ""}
                  </Badge>
                </div>
              ))}
            {selectedTaskIds.size > 10 && (
              <div className="text-xs text-gray-500 text-center py-1">
                ...还有 {selectedTaskIds.size - 10} 个任务
              </div>
            )}
          </div>
        </div>

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
              <Trash2 className="w-4 h-4" />
            )}
            {isDeleting ? "删除中..." : `删除 ${selectedTaskIds.size} 个任务`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
