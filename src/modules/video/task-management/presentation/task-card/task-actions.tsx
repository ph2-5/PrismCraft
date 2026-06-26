import {
  RefreshCw,
  Loader2,
  RotateCcw,
  Search,
  Copy,
  ExternalLink,
  Ban,
} from "lucide-react";
import type { VideoTask } from "@/modules/video/task-management";
import { t } from "@/shared/constants";

interface TaskActionsProps {
  task: VideoTask;
  onCopyTaskId: (taskId: string) => void;
  onManualPoll: (task: VideoTask) => void;
  onRetryTask: (task: VideoTask) => void;
  onCancelTask: (task: VideoTask) => void;
  onOpenTracking: (task: VideoTask) => void;
  onCopyTracking: (task: VideoTask) => void;
  onOpenCloudLink: (task: VideoTask) => void;
  pollingTaskId: string | null;
  retryingTaskId: string | null;
  cancellingTaskId: string | null;
  pollTask?: (taskId: string) => Promise<void>;
}

export function TaskActions({
  task,
  onCopyTaskId,
  onManualPoll,
  onRetryTask,
  onCancelTask,
  onOpenTracking,
  onCopyTracking,
  onOpenCloudLink,
  pollingTaskId,
  retryingTaskId,
  cancellingTaskId,
  pollTask,
}: TaskActionsProps) {
  return (
    <div className="flex flex-col gap-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: "var(--muted-fg)" }}>
          {t("task.taskIdPrefix")}
          <code className="px-1 py-0.5 rounded" style={{ background: "var(--muted)" }}>
            {task.taskId}
          </code>
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm h-6 px-2 text-xs"
          onClick={() => onCopyTaskId(task.taskId)}
        >
          {t("task.copyButton")}
        </button>
      </div>
      <div className="flex gap-2">
        {(task.status === "pending" || task.status === "generating") &&
          pollTask && (
            <button
              type="button"
              className="btn btn-ghost btn-sm h-7 px-3 text-xs flex-1 gap-1"
              onClick={() => onManualPoll(task)}
              disabled={pollingTaskId === task.taskId}
            >
              {pollingTaskId === task.taskId ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              {t("task.manualQuery")}
            </button>
          )}
        {(task.status === "failed" || task.status === "timeout") && (
          <button
            type="button"
            className="btn btn-ghost btn-sm h-7 px-3 text-xs flex-1 gap-1 text-orange-600 hover:text-orange-700"
            onClick={() => onRetryTask(task)}
            disabled={retryingTaskId === task.taskId}
          >
            {retryingTaskId === task.taskId ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RotateCcw className="w-3 h-3" />
            )}
            {t("task.regenerateButton")}
          </button>
        )}
        {(task.status === "pending" || task.status === "generating" || task.status === "retrying" || task.status === "timeout") && (
          <button
            type="button"
            className="btn btn-ghost btn-sm h-7 px-3 text-xs flex-1 gap-1 hover:text-foreground"
            style={{ color: "var(--muted-fg)" }}
            onClick={() => onCancelTask(task)}
            disabled={cancellingTaskId === task.taskId}
          >
            {cancellingTaskId === task.taskId ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Ban className="w-3 h-3" />
            )}
            {t("task.cancelButton")}
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-sm h-7 px-3 text-xs flex-1 gap-1"
          onClick={() => onOpenTracking(task)}
        >
          <Search className="w-3 h-3" />
          {t("task.trackingButton")}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm h-7 px-3 text-xs flex-1 gap-1"
          onClick={() => onCopyTracking(task)}
        >
          <Copy className="w-3 h-3" />
          {t("task.copyButton")}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm h-7 px-3 text-xs flex-1 gap-1"
          onClick={() => onOpenCloudLink(task)}
        >
          <ExternalLink className="w-3 h-3" />
          {t("task.consoleButton")}
        </button>
      </div>
    </div>
  );
}
