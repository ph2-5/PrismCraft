import React from "react";
import { Button } from "@/shared/ui/button";
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
    <div className="flex flex-col gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          任务ID:{" "}
          <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
            {task.taskId}
          </code>
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => onCopyTaskId(task.taskId)}
        >
          复制
        </Button>
      </div>
      <div className="flex gap-2">
        {(task.status === "pending" || task.status === "generating") &&
          pollTask && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-3 text-xs flex-1 gap-1"
              onClick={() => onManualPoll(task)}
              disabled={pollingTaskId === task.taskId}
            >
              {pollingTaskId === task.taskId ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              手动查询
            </Button>
          )}
        {task.status === "failed" && task.beatId && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-3 text-xs flex-1 gap-1 text-orange-600 hover:text-orange-700"
            onClick={() => onRetryTask(task)}
            disabled={retryingTaskId === task.taskId}
          >
            {retryingTaskId === task.taskId ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RotateCcw className="w-3 h-3" />
            )}
            重新生成
          </Button>
        )}
        {(task.status === "pending" || task.status === "generating" || task.status === "retrying") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-3 text-xs flex-1 gap-1 text-gray-500 hover:text-gray-700"
            onClick={() => onCancelTask(task)}
            disabled={cancellingTaskId === task.taskId}
          >
            {cancellingTaskId === task.taskId ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Ban className="w-3 h-3" />
            )}
            取消
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-3 text-xs flex-1 gap-1"
          onClick={() => onOpenTracking(task)}
        >
          <Search className="w-3 h-3" />
          追踪
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-3 text-xs flex-1 gap-1"
          onClick={() => onCopyTracking(task)}
        >
          <Copy className="w-3 h-3" />
          复制
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-3 text-xs flex-1 gap-1"
          onClick={() => onOpenCloudLink(task)}
        >
          <ExternalLink className="w-3 h-3" />
          控制台
        </Button>
      </div>
    </div>
  );
}
