import { useState, useMemo, useCallback } from "react";
import { useVirtualList } from "@/shared/hooks/use-virtual-list";
import { t } from "@/shared/constants/messages";
import { useCurrentTime } from "@/shared/hooks/use-current-time";
import { Button } from "@/shared/ui/button";
import { Trash2, Clock } from "lucide-react";
import type { VideoTask } from "@/domain/schemas";
import { recoverVideoByTaskId } from "@/modules/video/recovery";
import { errorLogger } from "@/shared/error-logger";
import { confirm } from "@/shared/utils/confirm";
import { EmptyState } from "@/shared/ui/empty-state";
import { TaskCard } from "./video-task-manager-ui/task-card";
import { TaskDetailDialog } from "./video-task-manager-ui/task-detail-dialog";

const VIRTUAL_LIST_CONTAINER_STYLE = { maxHeight: "60vh", overflow: "auto" } as const;

interface VideoTaskManagerProps {
  tasks: VideoTask[];
  pollTask: (taskId: string) => void;
  removeTask: (taskId: string) => void;
  removeTasks: (taskIds: string[]) => void;
}

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
        <div ref={parentRef} style={VIRTUAL_LIST_CONTAINER_STYLE} className="space-y-3">
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
