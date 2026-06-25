import React from "react";
import { t } from "@/shared/constants";
import {
  Square,
  CheckSquare,
  Film,
} from "lucide-react";
import type { VideoTask } from "@/modules/video/task-management";
import { getStatusIcon, getStatusColor, getStatusStyle, getStatusLabel } from "./task-status-helpers";
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
    <div
      key={taskKey}
      className={`card border transition-colors ${
        isSelected
          ? "border-purple-500 bg-purple-50/50 dark:bg-purple-900/20"
          : ""
      }`}
      style={{ padding: 16, ...(isSelected ? undefined : { borderColor: "var(--border)" }) }}
    >
      <div style={{ paddingBottom: 12 }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelection(task.taskId);
              }}
              className="p-1 rounded hover:bg-muted"
            >
              {isSelected ? (
                <CheckSquare className="w-4 h-4 text-purple-600" />
              ) : (
                <Square className="w-4 h-4" style={{ color: "var(--muted-fg)" }} />
              )}
            </button>
            <div className="text-sm font-medium" style={{ fontSize: 16, fontWeight: 600 }}>
              {task.beatTitle || `${t("task.taskLabel")} ${(task.taskId || "unknown").substring(0, 8)}...`}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`badge badge-info ${getStatusColor(task.status)}`} style={getStatusStyle(task.status)}>
              {getStatusLabel(task.status)}
            </span>
            {task.beatId && (
              <button
                type="button"
                className="btn btn-ghost btn-sm h-6 px-2 text-xs gap-1"
                onClick={() => onJumpToBeat(task)}
              >
                <Film className="w-3 h-3" />
                {t("task.beatButton")}
              </button>
            )}
          </div>
        </div>
        <div className="text-xs" style={{ fontSize: 12, color: "var(--muted-fg)" }}>
          {t("task.createdAtAgo", { time: new Date(task.createdAt).toLocaleString() })}
          {task.model && ` · ${t("task.modelLabel", { model: task.model })}`}
        </div>
      </div>
      <div>
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            {getStatusIcon(task.status)}
            <span className="text-sm">{task.message}</span>
          </div>
          {task.status === "generating" && (
            <>
              <div className="progress-bar h-2">
                <div className="progress-fill" style={{ width: `${task.progress || 0}%` }} />
              </div>
              <div className="text-xs text-right" style={{ color: "var(--muted-fg)" }}>
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
      </div>
    </div>
  );
});
