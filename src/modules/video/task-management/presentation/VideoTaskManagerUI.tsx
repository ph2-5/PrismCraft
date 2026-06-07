import { useState, useMemo, useCallback, memo } from "react";
import { useVirtualList } from "@/shared/hooks/use-virtual-list";
import { t } from "@/shared/constants/messages";
import { useCurrentTime } from "@/shared/hooks/use-current-time";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  Loader2,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronRight,
  Info,
} from "lucide-react";
import type { VideoTask } from "@/domain/schemas";
import { recoverVideoByTaskId } from "@/modules/video/recovery";
import { resolveImageUrl } from "@/shared/utils/image-url";
import { createVideoErrorHandler } from "@/shared/utils/media-error-handler";
import { errorLogger } from "@/shared/error-logger";
import { confirm } from "@/shared/utils/confirm";
import { EmptyState } from "@/shared/ui/empty-state";

interface VideoTaskManagerProps {
  tasks: VideoTask[];
  pollTask: (taskId: string) => void;
  removeTask: (taskId: string) => void;
  removeTasks: (taskIds: string[]) => void;
}

type TaskDisplayStatus = "pending" | "generating" | "completed" | "failed";

function getTaskDisplayStatus(task: VideoTask): TaskDisplayStatus {
  if (task.status === "completed") return "completed";
  if (task.status === "failed" || task.status === "cancelled") return "failed";
  if (task.status === "generating") return "generating";
  return "pending";
}

function formatTime(timestamp: string | undefined): string {
  if (!timestamp) return t("common.unknown");
  const date = new Date(timestamp);
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return t("task.justNow");
  if (ms < 60000) return t("task.secondsAgo", { count: Math.floor(ms / 1000) });
  if (ms < 3600000) return t("task.minutesAgo", { count: Math.floor(ms / 60000) });
  return t("task.hoursAgo", { count: Math.floor(ms / 3600000) });
}

function StatusBadge({ status }: { status: TaskDisplayStatus }) {
  const config = {
    pending: { color: "bg-yellow-900/50 text-yellow-300 border-yellow-700", icon: Clock, label: t("common.pending") },
    generating: { color: "bg-blue-900/50 text-blue-300 border-blue-700", icon: Loader2, label: t("common.generatingShort"), animate: true },
    completed: { color: "bg-green-900/50 text-green-300 border-green-700", icon: CheckCircle2, label: t("common.completed") },
    failed: { color: "bg-red-900/50 text-red-300 border-red-700", icon: AlertCircle, label: t("common.failed") },
  }[status];

  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${config.color}`}>
      <Icon className={`w-3 h-3 ${(config as { animate?: boolean }).animate ? "animate-spin" : ""}`} />
      {config.label}
    </span>
  );
}

interface TaskDetailDialogProps {
  task: VideoTask;
  isOpen: boolean;
  onClose: () => void;
  onRecover: () => void;
  onRemove: () => void;
}

function TaskDetailDialog({ task, isOpen, onClose, onRecover, onRemove }: TaskDetailDialogProps) {
  const [isRecovering, setIsRecovering] = useState(false);

  const handleRecover = async () => {
    setIsRecovering(true);
    try {
      await onRecover();
    } finally {
      setIsRecovering(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="w-5 h-5" />
            {t("task.detailTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("task.taskIdLabel", { id: task.taskId })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">{t("task.currentStatus")}</p>
              <StatusBadge status={getTaskDisplayStatus(task)} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("beat.createdAt")}</p>
              <p className="text-sm font-medium">{formatTime(task.createdAt)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("task.retryCount")}</p>
              <p className="text-sm font-medium">{task.recoveryAttempts || 0} / 60</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("task.provider")}</p>
              <p className="text-sm font-medium">{task.providerId || t("common.unknown")}</p>
            </div>
          </div>

          {task.message && (
            <div>
              <p className="text-sm text-muted-foreground">{t("task.statusMessage")}</p>
              <p className="text-sm font-medium text-yellow-400">{task.message}</p>
            </div>
          )}

          {task.videoUrl && (
            <div>
              <p className="text-sm text-muted-foreground mb-2">{t("task.videoPreview")}</p>
              <video
                src={resolveImageUrl(task.videoUrl)}
                controls
                className="w-full max-h-48 rounded-lg border border-border"
                onError={createVideoErrorHandler()}
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="destructive" onClick={onRemove} disabled={isRecovering}>
            <Trash2 className="w-4 h-4 mr-2" />
            {t("common.delete")}
          </Button>
          <Button
            variant="default"
            onClick={handleRecover}
            disabled={isRecovering || task.status === "completed"}
          >
            {isRecovering ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            {t("common.retry")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface TaskCardProps {
  task: VideoTask;
  isSelected: boolean;
  isExpanded: boolean;
  now: number;
  onToggleSelection: (taskId: string) => void;
  onToggleExpanded: (taskId: string) => void;
  onRetry: (taskId: string) => void;
  onViewDetail: (task: VideoTask) => void;
}

const TaskCard = memo(function TaskCard({
  task,
  isSelected,
  isExpanded,
  now,
  onToggleSelection,
  onToggleExpanded,
  onRetry,
  onViewDetail,
}: TaskCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        className="pb-3 cursor-pointer"
        onClick={() => onToggleExpanded(task.taskId)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => {
                e.stopPropagation();
                onToggleSelection(task.taskId);
              }}
              className="h-4 w-4 rounded border-gray-600 text-blue-500 focus:ring-blue-500"
            />
            <StatusBadge status={getTaskDisplayStatus(task)} />
            <div>
              <CardTitle className="text-sm">
                {task.prompt?.slice(0, 50) || t("task.noPrompt")}
                {(task.prompt?.length || 0) > 50 ? "..." : ""}
              </CardTitle>
              <CardDescription className="text-xs">
                {formatDuration(now - new Date(task.createdAt).getTime())} · {task.providerId || t("common.unknown")}
                {task.storyId ? ` · ${t("task.beatLabel")}: ${task.storyTitle || task.beatTitle || t("task.relatedStory")}` : ` · ${t("sidebar.quickGenerate")}`}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getTaskDisplayStatus(task) === "failed" && (
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry(task.taskId);
                }}
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                {t("common.retry")}
              </Button>
            )}
            {task.videoUrl && (
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewDetail(task);
                }}
              >
                <Eye className="w-3 h-3 mr-1" />
                {t("task.view")}
              </Button>
            )}
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0 space-y-4">
          {task.prompt && (
            <div>
              <p className="text-sm text-muted-foreground mb-1">{t("beat.prompt")}</p>
              <p className="text-sm bg-black/20 p-3 rounded">{task.prompt}</p>
            </div>
          )}

          {task.videoUrl && (
            <div>
              <p className="text-sm text-muted-foreground mb-2">{t("task.videoLabel")}</p>
              <video
                src={resolveImageUrl(task.videoUrl)}
                controls
                className="w-full max-h-48 rounded-lg border border-border"
                onError={createVideoErrorHandler()}
              />
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onViewDetail(task)}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  {t("task.viewDetail")}
                </Button>
                <a
                  href={resolveImageUrl(task.videoUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                >
                  <Button size="sm" variant="outline">
                    <Download className="w-4 h-4 mr-2" />
                    {t("beat.download")}
                  </Button>
                </a>
              </div>
            </div>
          )}

          {task.message && (
            <div>
              <p className="text-sm text-muted-foreground mb-1">{t("task.messageLabel")}</p>
              <p className="text-sm text-yellow-400">{task.message}</p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
});

export function VideoTaskManagerUI({ tasks, pollTask, removeTask, removeTasks }: VideoTaskManagerProps) {
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [detailTask, setDetailTask] = useState<VideoTask | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(20);
  const now = useCurrentTime();

  const toggleTaskSelection = useCallback((taskId: string) => {
    setSelectedTaskIds((prev) => {
      const newSelected = new Set(prev);
      if (newSelected.has(taskId)) {
        newSelected.delete(taskId);
      } else {
        newSelected.add(taskId);
      }
      return newSelected;
    });
  }, []);

  const toggleExpanded = useCallback((taskId: string) => {
    setExpandedTaskId((prev) => prev === taskId ? null : taskId);
  }, []);

  const openTaskDetail = useCallback((task: VideoTask) => {
    setDetailTask(task);
    setIsDetailOpen(true);
  }, []);

  const handleRecoverTask = useCallback(async () => {
    if (detailTask) {
      const result = await recoverVideoByTaskId(detailTask.taskId);
      if (!result.ok) {
        errorLogger.warn("[VideoTaskManagerUI] 视频找回失败", result.error);
      }
    }
  }, [detailTask]);

  const handleRemoveTask = useCallback(async () => {
    if (!detailTask) return;
    const confirmed = await confirm({
      title: t("confirm.deleteTitle"),
      description: t("task.confirmDeleteDesc"),
      confirmText: t("common.delete"),
      cancelText: t("common.cancel"),
      variant: "danger",
    });
    if (!confirmed) return;
    removeTask(detailTask.taskId);
    setIsDetailOpen(false);
  }, [detailTask, removeTask]);

  const handleRemoveSelected = useCallback(async () => {
    if (selectedTaskIds.size === 0) return;
    const confirmed = await confirm({
      title: t("task.confirmBatchDeleteTitle"),
      description: t("task.confirmBatchDeleteDesc", { count: selectedTaskIds.size }),
      confirmText: t("common.delete"),
      cancelText: t("common.cancel"),
      variant: "danger",
    });
    if (!confirmed) return;
    removeTasks(Array.from(selectedTaskIds));
    setSelectedTaskIds(new Set());
  }, [selectedTaskIds, removeTasks]);

  const sortedTasks = useMemo(
    () => [...tasks].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [tasks],
  );

  const shouldVirtualize = sortedTasks.length > 20;

  const { parentRef, virtualItems, totalSize } = useVirtualList({
    items: sortedTasks,
    estimateSize: 80,
    overscan: 5,
  });

  const visibleTasks = useMemo(() => sortedTasks.slice(0, visibleCount), [sortedTasks, visibleCount]);
  const hasMore = sortedTasks.length > visibleCount;

  return (
    <div className="space-y-4">
      {selectedTaskIds.size > 0 && (
        <div className="flex items-center justify-between p-4 bg-red-900/20 border border-red-700 rounded-lg">
          <p className="text-sm text-red-300">
            {t("task.selectedCount", { count: selectedTaskIds.size })}
          </p>
          <Button variant="destructive" size="sm" onClick={handleRemoveSelected}>
            <Trash2 className="w-4 h-4 mr-2" />
            {t("task.deleteSelected")}
          </Button>
        </div>
      )}

      {shouldVirtualize ? (
        <div ref={parentRef} style={{ maxHeight: "60vh", overflow: "auto" }} className="space-y-3">
          <div style={{ height: totalSize, position: "relative" }}>
            {virtualItems.map((virtualItem) => {
              const task = sortedTasks[virtualItem.index]!;
              return (
                <div key={task.taskId} style={{ position: "absolute", top: virtualItem.start, left: 0, width: "100%", height: virtualItem.size }}>
                  <TaskCard
                    task={task}
                    isSelected={selectedTaskIds.has(task.taskId)}
                    isExpanded={expandedTaskId === task.taskId}
                    now={now}
                    onToggleSelection={toggleTaskSelection}
                    onToggleExpanded={toggleExpanded}
                    onRetry={pollTask}
                    onViewDetail={openTaskDetail}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleTasks.map((task) => (
            <TaskCard
              key={task.taskId}
              task={task}
              isSelected={selectedTaskIds.has(task.taskId)}
              isExpanded={expandedTaskId === task.taskId}
              now={now}
              onToggleSelection={toggleTaskSelection}
              onToggleExpanded={toggleExpanded}
              onRetry={pollTask}
              onViewDetail={openTaskDetail}
            />
          ))}

          {hasMore && (
            <div className="flex justify-center py-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setVisibleCount((c) => c + 20)}
              >
                {t("task.loadMore", { count: sortedTasks.length - visibleCount })}
              </Button>
            </div>
          )}

          {sortedTasks.length === 0 && (
            <EmptyState
              icon={Clock}
              title={t("task.noTasks")}
            />
          )}
        </div>
      )}

      {detailTask && (
        <TaskDetailDialog
          task={detailTask}
          isOpen={isDetailOpen}
          onClose={() => setIsDetailOpen(false)}
          onRecover={handleRecoverTask}
          onRemove={handleRemoveTask}
        />
      )}
    </div>
  );
}
