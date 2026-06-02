import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Progress } from "@/shared/ui/progress";
import { Button } from "@/shared/ui/button";
import { t } from "@/shared/constants";
import { Badge } from "@/shared/ui/badge";
import {
  Square,
  CheckSquare,
  Film,
} from "lucide-react";
import type { VideoTask } from "@/modules/video/task-management";
import { getStatusIcon, getStatusColor, getStatusLabel } from "./task-status-helpers";
import { VideoPreview, TaskActions } from "./task-card";

interface TaskCardProps {
  task: VideoTask;
  index: number;
  isSelected: boolean;
  onToggleSelection: (taskId: string) => void;
  onOpenPreview: (task: VideoTask) => void;
  onOpenDetail: (task: VideoTask) => void;
  onDownloadVideo: (task: VideoTask) => void;
  onDeleteCache: (task: VideoTask) => void;
  onManualPoll: (task: VideoTask) => void;
  onRetryTask: (task: VideoTask) => void;
  onCancelTask: (task: VideoTask) => void;
  onOpenTracking: (task: VideoTask) => void;
  onCopyTracking: (task: VideoTask) => void;
  onOpenCloudLink: (task: VideoTask) => void;
  onJumpToBeat: (task: VideoTask) => void;
  onCopyTaskId: (taskId: string) => void;
  pollingTaskId: string | null;
  retryingTaskId: string | null;
  cancellingTaskId: string | null;
  pollTask?: (taskId: string) => Promise<void>;
  cacheState?: { exists: boolean; fileSizeMB?: number };
}

export const TaskCard = React.memo(function TaskCard({
  task,
  index,
  isSelected,
  onToggleSelection,
  onOpenPreview,
  onOpenDetail,
  onDownloadVideo,
  onDeleteCache,
  onManualPoll,
  onRetryTask,
  onCancelTask,
  onOpenTracking,
  onCopyTracking,
  onOpenCloudLink,
  onJumpToBeat,
  onCopyTaskId,
  pollingTaskId,
  retryingTaskId,
  cancellingTaskId,
  pollTask,
  cacheState,
}: TaskCardProps) {
  const taskKey =
    task.taskId ||
    `task-${task.storyId || index}-${task.createdAt || index}-${index}`;

  return (
    <Card
      key={taskKey}
      className={`border transition-colors ${
        isSelected
          ? "border-purple-500 bg-purple-50/50 dark:bg-purple-900/20"
          : "border-gray-200 dark:border-gray-800"
      }`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelection(task.taskId);
              }}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              {isSelected ? (
                <CheckSquare className="w-4 h-4 text-purple-600" />
              ) : (
                <Square className="w-4 h-4 text-gray-400" />
              )}
            </button>
            <CardTitle className="text-sm font-medium">
              {task.beatTitle || `${t("task.taskLabel")} ${(task.taskId || "unknown").substring(0, 8)}...`}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={getStatusColor(task.status)}>
              {getStatusLabel(task.status)}
            </Badge>
            {task.beatId && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs gap-1"
                onClick={() => onJumpToBeat(task)}
              >
                <Film className="w-3 h-3" />
                {t("task.beatButton")}
              </Button>
            )}
          </div>
        </div>
        <CardDescription className="text-xs text-gray-500 dark:text-gray-400">
          {t("task.createdAtAgo", { time: new Date(task.createdAt).toLocaleString() })}
          {task.model && ` · ${t("task.modelLabel", { model: task.model })}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            {getStatusIcon(task.status)}
            <span className="text-sm">{task.message}</span>
          </div>
          {task.status === "generating" && (
            <>
              <Progress value={task.progress || 0} className="h-2" />
              <div className="text-xs text-gray-500 dark:text-gray-400 text-right">
                {task.progress || 0}%
              </div>
            </>
          )}
          <VideoPreview
            task={task}
            onOpenPreview={onOpenPreview}
            onOpenDetail={onOpenDetail}
            onDownloadVideo={onDownloadVideo}
            onDeleteCache={onDeleteCache}
            cacheState={cacheState}
          />
          <TaskActions
            task={task}
            onCopyTaskId={onCopyTaskId}
            onManualPoll={onManualPoll}
            onRetryTask={onRetryTask}
            onCancelTask={onCancelTask}
            onOpenTracking={onOpenTracking}
            onCopyTracking={onCopyTracking}
            onOpenCloudLink={onOpenCloudLink}
            pollingTaskId={pollingTaskId}
            retryingTaskId={retryingTaskId}
            cancellingTaskId={cancellingTaskId}
            pollTask={pollTask}
          />
        </div>
      </CardContent>
    </Card>
  );
});
