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
import { getStatusColor, getStatusStyle, getStatusLabel } from "./task-status-helpers";
import { t } from "@/shared/constants";

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
          <DialogTitle>{t("task.confirmBatchDelete")}</DialogTitle>
          <DialogDescription>
            {t("task.confirmBatchDeleteDesc", { count: selectedTaskIds.size })}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-2">
          <div className="text-sm" style={{ color: "var(--muted-fg)" }}>{t("task.tasksToDelete")}</div>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {Array.from(selectedTaskIds)
              .map((taskId) => filteredTasks.find((t) => t.taskId === taskId))
              .filter(Boolean)
              .slice(0, 10)
              .map((task, index) => (
                <div
                  key={task?.taskId || `task-${index}`}
                  className="text-sm px-3 py-2 rounded flex items-center justify-between"
                  style={{ background: "var(--muted)" }}
                >
                  <span className="truncate flex-1">
                    {task?.beatTitle || `${t("task.taskLabel")} ${(task?.taskId || "unknown").substring(0, 8)}...`}
                  </span>
                  <Badge
                    className={`ml-2 ${task ? getStatusColor(task.status) : ""}`}
                    style={task ? getStatusStyle(task.status) : undefined}
                  >
                    {task ? getStatusLabel(task.status) : ""}
                  </Badge>
                </div>
              ))}
            {selectedTaskIds.size > 10 && (
              <div className="text-xs text-center py-1" style={{ color: "var(--muted-fg)" }}>
                {t("task.moreTasks", { count: selectedTaskIds.size - 10 })}
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
            {t("common.cancel")}
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
            {isDeleting ? t("common.deleting") : t("task.deleteCountTasks", { count: selectedTaskIds.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
