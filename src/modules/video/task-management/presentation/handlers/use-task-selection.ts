import { useState } from "react";
import { useToastHelpers } from "@/shared/presentation/Toast";
import type { VideoTask } from "@/domain/schemas";

interface UseTaskSelectionParams {
  filteredTasks: VideoTask[];
  removeTasks?: (taskIds: string[]) => Promise<void>;
  onAfterDelete?: () => Promise<void>;
}

export function useTaskSelection({ filteredTasks, removeTasks, onAfterDelete }: UseTaskSelectionParams) {
  const { success, error } = useToastHelpers();
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const toggleTaskSelection = (taskId: string) => {
    setSelectedTaskIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) newSet.delete(taskId);
      else newSet.add(taskId);
      return newSet;
    });
  };

  const selectAllFilteredTasks = () => {
    setSelectedTaskIds(new Set(filteredTasks.map((task) => task.taskId)));
  };

  const deselectAllTasks = () => {
    setSelectedTaskIds(new Set());
  };

  const handleBulkDelete = () => {
    if (selectedTaskIds.size === 0) return;
    setBulkDeleteConfirmOpen(true);
  };

  const confirmBulkDelete = async () => {
    if (!removeTasks || selectedTaskIds.size === 0) return;
    setIsDeleting(true);
    const taskIdsArray = Array.from(selectedTaskIds);
    try {
      await removeTasks(taskIdsArray);
      setSelectedTaskIds(new Set());
      if (onAfterDelete) await onAfterDelete();
      success("删除成功", `已删除 ${taskIdsArray.length} 个任务`);
    } catch (err) {
      error("删除失败", err instanceof Error ? err.message : "未知错误");
    } finally {
      setIsDeleting(false);
      setBulkDeleteConfirmOpen(false);
    }
  };

  return {
    selectedTaskIds,
    bulkDeleteConfirmOpen,
    setBulkDeleteConfirmOpen,
    isDeleting,
    toggleTaskSelection,
    selectAllFilteredTasks,
    deselectAllTasks,
    handleBulkDelete,
    confirmBulkDelete,
  };
}
