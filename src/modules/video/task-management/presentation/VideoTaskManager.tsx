"use client";

import React, { useRef, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import {
  PlayCircle,
  Download,
  Trash2,
  Square,
  CheckSquare,
  FileDown,
  FolderOpen,
} from "lucide-react";
import { VideoTask } from "@/modules/video/task-management";

import { useTaskFilter } from "./use-task-filter";
import { useVideoPreview } from "./use-video-preview";
import { useVideoTaskHandlers } from "./handlers/video-task-handlers";
import { TaskFilterBar } from "./TaskFilterBar";
import { TaskCard } from "./TaskCard";
import { RecoverySection } from "./RecoverySection";
import { TaskTrackingDialog } from "./TaskTrackingDialog";
import { VideoPreviewDialog } from "./VideoPreviewDialog";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { BulkDeleteDialog } from "./BulkDeleteDialog";
import { TaskDetailDialog } from "./TaskDetailDialog";

interface VideoTaskManagerProps {
  tasks: VideoTask[];
  onClose?: () => void;
  onBackgroundProcess?: () => void;
  onTaskRecovered?: (taskId: string, status: string, videoUrl?: string) => void;
  pollTask?: (taskId: string) => Promise<void>;
  removeTask?: (taskId: string) => Promise<void>;
  removeTasks?: (taskIds: string[]) => Promise<void>;
}

export function VideoTaskManager({
  tasks,
  onBackgroundProcess,
  onTaskRecovered,
  pollTask,
  removeTasks,
}: VideoTaskManagerProps) {
  const taskListRef = useRef<HTMLDivElement>(null);

  const {
    statusFilter,
    setStatusFilter,
    sortField,
    setSortField,
    sortDesc,
    setSortDesc,
    groupBy,
    setGroupBy,
    timeRange,
    setTimeRange,
    searchQuery,
    setSearchQuery,
    collapsedGroups,
    toggleGroupCollapse,
    filteredTasks,
    groupedTasks,
  } = useTaskFilter(tasks);

  const {
    previewDialogOpen,
    setPreviewDialogOpen,
    previewTask,
    setPreviewTask,
    cachedVideoUrl,
    videoLoadError,
    setVideoLoadError,
    videoLoading,
    openPreview,
  } = useVideoPreview();

  const completedTaskIds = useMemo(
    () =>
      tasks
        .filter((t) => t.status === "completed" && t.videoUrl)
        .map((t) => t.taskId),
    [tasks],
  );

  const {
    recoveryTaskId,
    setRecoveryTaskId,
    isRecovering,
    trackingDialogOpen,
    setTrackingDialogOpen,
    selectedTask,
    setSelectedTask,
    pollingTaskId,
    retryingTaskId,
    cancellingTaskId,
    cacheStates,
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    taskToDelete,
    isDeleting,
    cacheStats,
    selectedTaskIds,
    bulkDeleteConfirmOpen,
    setBulkDeleteConfirmOpen,
    detailDrawerOpen,
    setDetailDrawerOpen,
    detailTask,
    handleDeleteCache,
    confirmDeleteCache,
    toggleTaskSelection,
    selectAllFilteredTasks,
    deselectAllTasks,
    handleBulkDelete,
    confirmBulkDelete,
    handleRecoverVideo,
    handleCopyTracking,
    handleOpenCloudLink,
    handleOpenPreview,
    handleManualPoll,
    handleRetryTask,
    handleCancelTask,
    handleJumpToBeat,
    handleOpenDetail,
    handleCopyTaskId,
    handleExportCSV,
    handleBatchDownload,
    handleDownloadVideo,
    hasActiveTasks,
    toastSuccess,
    toastError,
  } = useVideoTaskHandlers({
    tasks,
    filteredTasks,
    completedTaskIds,
    pollTask,
    removeTasks,
    onTaskRecovered,
    openPreview,
  });

  return (
    <div className="w-full">
      <Card className="border border-gray-200 dark:border-gray-800">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-medium">视频任务管理</CardTitle>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-1">
                <CardDescription>管理视频生成任务和找回失败视频</CardDescription>
                {cacheStats && cacheStats.count > 0 && (
                  <Badge className="bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                    本地缓存: {cacheStats.count} 个视频, {cacheStats.totalSizeMB.toFixed(2)}MB
                  </Badge>
                )}
                {selectedTaskIds.size > 0 && (
                  <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
                    已选择: {selectedTaskIds.size} 个任务
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {filteredTasks.length > 0 && (
                <>
                  {selectedTaskIds.size < filteredTasks.length ? (
                    <Button variant="outline" size="sm" onClick={selectAllFilteredTasks} className="gap-1">
                      <Square className="w-4 h-4" />
                      全选
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={deselectAllTasks} className="gap-1">
                      <CheckSquare className="w-4 h-4" />
                      取消全选
                    </Button>
                  )}
                </>
              )}
              {selectedTaskIds.size > 0 && (
                <>
                  <Button variant="outline" size="sm" onClick={handleBatchDownload} className="gap-1">
                    <Download className="w-4 h-4" />
                    批量下载
                  </Button>
                  <Button variant="destructive" size="sm" onClick={handleBulkDelete} className="gap-1">
                    <Trash2 className="w-4 h-4" />
                    批量删除
                  </Button>
                </>
              )}
              <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-1">
                <FileDown className="w-4 h-4" />
                导出CSV
              </Button>
            </div>
          </div>

          <TaskFilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
            groupBy={groupBy}
            onGroupByChange={setGroupBy}
            sortField={sortField}
            onSortFieldChange={setSortField}
            sortDesc={sortDesc}
            onSortDescChange={setSortDesc}
          />
        </CardHeader>
        <CardContent className="space-y-6">
          {filteredTasks.length > 0 && (
            <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center justify-between">
              <span>共 {filteredTasks.length} 个任务</span>
              {filteredTasks.length > 50 && (
                <span>已启用分组折叠以优化性能</span>
              )}
            </div>
          )}
          {filteredTasks.length > 0 ? (
            <div className="space-y-4" ref={taskListRef}>
              {Object.entries(groupedTasks).map(([groupId, groupTasks]) => {
                if (groupTasks.length === 0) return null;
                const isStoryGroup = groupId !== "others";
                const firstTask = groupTasks[0];
                const storyTitle = isStoryGroup
                  ? firstTask.storyTitle
                  : groupBy === "model"
                    ? groupId
                    : groupBy === "date"
                      ? groupId
                      : "未分组";
                const isCollapsed = collapsedGroups.has(groupId);

                return (
                  <div key={groupId || "ungrouped"} className="space-y-2">
                    {isStoryGroup || groupBy !== "none" ? (
                      <button
                        className="flex items-center gap-2 text-purple-700 dark:text-purple-400 mb-2 w-full hover:bg-purple-50 dark:hover:bg-purple-900/10 rounded px-2 py-1 transition-colors"
                        onClick={() => toggleGroupCollapse(groupId)}
                      >
                        <FolderOpen className="w-4 h-4" />
                        <span className="font-medium">{storyTitle}</span>
                        <Badge variant="outline" className="ml-2">
                          {groupTasks.length}个镜头
                        </Badge>
                        <span className="ml-auto text-xs">
                          {isCollapsed ? "展开" : "折叠"}
                        </span>
                      </button>
                    ) : null}
                    {!isCollapsed && (
                      <div className="space-y-3">
                        {groupTasks.map((task, index) => (
                          <TaskCard
                            key={task.taskId || `task-${index}`}
                            task={task}
                            index={index}
                            isSelected={selectedTaskIds.has(task.taskId)}
                            onToggleSelection={toggleTaskSelection}
                            onOpenPreview={handleOpenPreview}
                            onOpenDetail={handleOpenDetail}
                            onDownloadVideo={handleDownloadVideo}
                            onDeleteCache={handleDeleteCache}
                            onManualPoll={handleManualPoll}
                            onRetryTask={handleRetryTask}
                            onCancelTask={handleCancelTask}
                            onOpenTracking={(task) => {
                              setSelectedTask(task);
                              setTrackingDialogOpen(true);
                            }}
                            onCopyTracking={handleCopyTracking}
                            onOpenCloudLink={handleOpenCloudLink}
                            onJumpToBeat={handleJumpToBeat}
                            onCopyTaskId={handleCopyTaskId}
                            pollingTaskId={pollingTaskId}
                            retryingTaskId={retryingTaskId}
                            cancellingTaskId={cancellingTaskId}
                            pollTask={pollTask}
                            cacheState={cacheStates.get(task.taskId)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">暂无视频任务</div>
          )}

          <RecoverySection
            recoveryTaskId={recoveryTaskId}
            onRecoveryTaskIdChange={setRecoveryTaskId}
            onRecover={handleRecoverVideo}
            isRecovering={isRecovering}
          />

          {hasActiveTasks && onBackgroundProcess && (
            <Button variant="default" onClick={onBackgroundProcess} className="w-full">
              <PlayCircle className="w-4 h-4 mr-2" />
              后台继续处理
            </Button>
          )}
        </CardContent>
      </Card>

      <TaskTrackingDialog
        open={trackingDialogOpen}
        onOpenChange={setTrackingDialogOpen}
        task={selectedTask}
        onToastSuccess={toastSuccess}
        onToastError={toastError}
      />

      <VideoPreviewDialog
        open={previewDialogOpen}
        onOpenChange={(open) => {
          setPreviewDialogOpen(open);
          if (!open) setPreviewTask(null);
        }}
        task={previewTask}
        cachedVideoUrl={cachedVideoUrl}
        videoLoadError={videoLoadError}
        videoLoading={videoLoading}
        onSetVideoLoadError={setVideoLoadError}
        onDownloadVideo={handleDownloadVideo}
      />

      <DeleteConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        task={taskToDelete}
        isDeleting={isDeleting}
        onConfirm={confirmDeleteCache}
        cacheFileSizeMB={taskToDelete ? cacheStates.get(taskToDelete.taskId)?.fileSizeMB : undefined}
      />

      <BulkDeleteDialog
        open={bulkDeleteConfirmOpen}
        onOpenChange={setBulkDeleteConfirmOpen}
        selectedTaskIds={selectedTaskIds}
        filteredTasks={filteredTasks}
        isDeleting={isDeleting}
        onConfirm={confirmBulkDelete}
      />

      <TaskDetailDialog
        open={detailDrawerOpen}
        onOpenChange={setDetailDrawerOpen}
        task={detailTask}
        onOpenPreview={handleOpenPreview}
        onDownloadVideo={handleDownloadVideo}
        onJumpToBeat={handleJumpToBeat}
        onRetryTask={handleRetryTask}
      />
    </div>
  );
}
