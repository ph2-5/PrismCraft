import { useRef, useMemo, useCallback } from "react";
import {
  PlayCircle,
  Download,
  Trash2,
  Square,
  CheckSquare,
  FileDown,
  FolderOpen,
} from "lucide-react";
import { type VideoTask } from "@/modules/video/task-management";
import { t } from "@/shared/constants";

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

/** 计算失败任务恢复列表（优先用外部传入的全量失败任务，未传则从 tasks 兜底） */
function useFailedTasksForRecovery(
  failedTasks: VideoTask[] | undefined,
  tasks: VideoTask[],
): VideoTask[] {
  return useMemo(
    () =>
      failedTasks ??
      tasks.filter(
        (task) => task.status === "failed" || task.status === "timeout" || task.status === "cancelled",
      ),
    [failedTasks, tasks],
  );
}

/** 提取所有 Dialog 渲染为子组件以降低主函数行数 */
interface VideoTaskDialogsProps {
  trackingDialogOpen: boolean;
  setTrackingDialogOpen: (open: boolean) => void;
  selectedTask: VideoTask | null;
  toastSuccess: (title: string, detail: string) => void;
  toastError: (title: string, detail: string) => void;
  previewDialogOpen: boolean;
  setPreviewDialogOpen: (open: boolean) => void;
  setPreviewTask: (task: VideoTask | null) => void;
  previewTask: VideoTask | null;
  cachedVideoUrl: string | null;
  videoLoadError: boolean;
  videoLoading: boolean;
  setVideoLoadError: (err: boolean) => void;
  handleDownloadVideo: (task: VideoTask) => Promise<void>;
  deleteConfirmOpen: boolean;
  setDeleteConfirmOpen: (open: boolean) => void;
  taskToDelete: VideoTask | null;
  isDeleting: boolean;
  confirmDeleteCache: () => Promise<void>;
  cacheStates: Map<string, { exists: boolean; fileSizeMB?: number }>;
  bulkDeleteConfirmOpen: boolean;
  setBulkDeleteConfirmOpen: (open: boolean) => void;
  selectedTaskIds: Set<string>;
  filteredTasks: VideoTask[];
  confirmBulkDelete: () => Promise<void>;
  detailDrawerOpen: boolean;
  setDetailDrawerOpen: (open: boolean) => void;
  detailTask: VideoTask | null;
  handleOpenPreview: (task: VideoTask) => void;
  handleJumpToBeat: (task: VideoTask) => void;
  handleRetryTask: (task: VideoTask) => Promise<void>;
}

function VideoTaskDialogs(props: VideoTaskDialogsProps) {
  const {
    trackingDialogOpen, setTrackingDialogOpen, selectedTask, toastSuccess, toastError,
    previewDialogOpen, setPreviewDialogOpen, setPreviewTask, previewTask,
    cachedVideoUrl, videoLoadError, videoLoading, setVideoLoadError, handleDownloadVideo,
    deleteConfirmOpen, setDeleteConfirmOpen, taskToDelete, isDeleting, confirmDeleteCache, cacheStates,
    bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen, selectedTaskIds, filteredTasks, confirmBulkDelete,
    detailDrawerOpen, setDetailDrawerOpen, detailTask, handleOpenPreview, handleJumpToBeat, handleRetryTask,
  } = props;
  return (
    <>
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
    </>
  );
}

interface VideoTaskManagerProps {
  tasks: VideoTask[];
  /** 跨筛选器的全量失败任务（用于失败恢复列表；不传则从 tasks 计算） */
  failedTasks?: VideoTask[];
  onClose?: () => void;
  onBackgroundProcess?: () => void;
  onTaskRecovered?: (taskId: string, status: string, videoUrl?: string) => void;
  pollTask?: (taskId: string) => Promise<void>;
  removeTask?: (taskId: string) => Promise<void>;
  removeTasks?: (taskIds: string[]) => Promise<void>;
  /** 可选：诊断回调（如提供则在失败列表展示诊断按钮） */
  onDiagnose?: (taskId: string) => void;
}

interface VideoTaskManagerToolbarProps {
  filteredTasks: VideoTask[];
  selectedTaskIds: Set<string>;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onBatchDownload: () => void;
  onBulkDelete: () => void;
  onExportCSV: () => void;
}

function VideoTaskManagerToolbar({
  filteredTasks,
  selectedTaskIds,
  onSelectAll,
  onDeselectAll,
  onBatchDownload,
  onBulkDelete,
  onExportCSV,
}: VideoTaskManagerToolbarProps) {
  return (
    <div className="flex items-center gap-2">
      {filteredTasks.length > 0 && (
        <>
          {selectedTaskIds.size < filteredTasks.length ? (
            <button type="button" className="btn btn-outline btn-sm gap-1" onClick={onSelectAll}>
              <Square className="w-4 h-4" />
              {t("task.selectAll")}
            </button>
          ) : (
            <button type="button" className="btn btn-outline btn-sm gap-1" onClick={onDeselectAll}>
              <CheckSquare className="w-4 h-4" />
              {t("task.deselectAll")}
            </button>
          )}
        </>
      )}
      {selectedTaskIds.size > 0 && (
        <>
          <button type="button" className="btn btn-outline btn-sm gap-1" onClick={onBatchDownload}>
            <Download className="w-4 h-4" />
            {t("video.batchDownload")}
          </button>
          <button type="button" className="btn btn-danger btn-sm gap-1" onClick={onBulkDelete}>
            <Trash2 className="w-4 h-4" />
            {t("task.batchDelete")}
          </button>
        </>
      )}
      <button type="button" className="btn btn-outline btn-sm gap-1" onClick={onExportCSV}>
        <FileDown className="w-4 h-4" />
        {t("task.exportCSV")}
      </button>
    </div>
  );
}

export function VideoTaskManager({
  tasks,
  failedTasks,
  onBackgroundProcess,
  onTaskRecovered,
  pollTask,
  removeTasks,
  onDiagnose,
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
    handleRecoverTaskById,
    handleRecoverAllFailed,
    recoveringTaskIds,
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

  const handleOpenTracking = useCallback((task: VideoTask) => {
    setSelectedTask(task);
    setTrackingDialogOpen(true);
  }, []);

  // 失败任务恢复列表：优先使用外部传入的 failedTasks（跨筛选器全量），
  // 未传则从 tasks 计算（仍受筛选器影响，作为兜底）
  const failedTasksForRecovery = useFailedTasksForRecovery(failedTasks, tasks);

  return (
    <div className="w-full">
      <div className="card border" style={{ padding: 16, borderColor: "var(--border)" }}>
        <div style={{ paddingBottom: 12 }}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="text-lg font-medium" style={{ fontSize: 16, fontWeight: 600 }}>{t("task.videoTaskManagement")}</div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-1">
                <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>{t("task.videoTaskManagementDesc")}</div>
                {cacheStats && cacheStats.count > 0 && (
                  <span className="badge badge-info" style={{ background: "rgba(var(--primary-rgb), 0.1)", color: "var(--primary)" }}>
                    {t("task.localCacheInfo", { count: cacheStats.count, size: cacheStats.totalSizeMB.toFixed(2) })}
                  </span>
                )}
                {selectedTaskIds.size > 0 && (
                  <span className="badge badge-info bg-primary/10 text-primary">
                    {t("task.selectedCount", { count: selectedTaskIds.size })}
                  </span>
                )}
              </div>
            </div>
            <VideoTaskManagerToolbar
              filteredTasks={filteredTasks}
              selectedTaskIds={selectedTaskIds}
              onSelectAll={selectAllFilteredTasks}
              onDeselectAll={deselectAllTasks}
              onBatchDownload={handleBatchDownload}
              onBulkDelete={handleBulkDelete}
              onExportCSV={handleExportCSV}
            />
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
        </div>
        <div className="space-y-6">
          {filteredTasks.length > 0 && (
            <div className="text-xs flex items-center justify-between" style={{ color: "var(--muted-fg)" }}>
              <span>{t("task.totalTaskCount", { count: filteredTasks.length })}</span>
              {filteredTasks.length > 50 && (
                <span>{t("task.groupCollapseEnabled")}</span>
              )}
            </div>
          )}
          {filteredTasks.length > 0 ? (
            <div className="space-y-4" ref={taskListRef}>
              {Object.entries(groupedTasks).map(([groupId, groupTasks]) => {
                if (groupTasks.length === 0) return null;
                const isStoryGroup = groupId !== "others";
                const firstTask = groupTasks[0]!;
                const storyTitle = isStoryGroup
                  ? firstTask.storyTitle
                  : groupBy === "model"
                    ? groupId
                    : groupBy === "date"
                      ? groupId
                      : t("task.noGroup");
                const isCollapsed = collapsedGroups.has(groupId);

                return (
                  <div key={groupId || "ungrouped"} className="space-y-2">
                    {isStoryGroup || groupBy !== "none" ? (
                      <button
                        type="button"
                        className="flex items-center gap-2 text-primary mb-2 w-full hover:bg-primary/10 rounded px-2 py-1 transition-colors"
                        onClick={() => toggleGroupCollapse(groupId)}
                      >
                        <FolderOpen className="w-4 h-4" />
                        <span className="font-medium">{storyTitle}</span>
                        <span className="badge ml-2">
                          {t("task.shotCount", { count: groupTasks.length })}
                        </span>
                        <span className="ml-auto text-xs">
                          {isCollapsed ? t("common.expand") : t("common.collapse")}
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
                            onOpenTracking={handleOpenTracking}
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
            <div className="text-center py-12" style={{ color: "var(--muted-fg)" }}>
              <PlayCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">{t("task.noTasks")}</p>
              <p className="text-xs mt-1" style={{ color: "var(--muted-fg)" }}>{t("task.noTasksHint")}</p>
            </div>
          )}

          <RecoverySection
            failedTasks={failedTasksForRecovery}
            recoveryTaskId={recoveryTaskId}
            onRecoveryTaskIdChange={setRecoveryTaskId}
            onRecover={handleRecoverVideo}
            isRecovering={isRecovering}
            onRecoverTaskById={handleRecoverTaskById}
            onRecoverAllFailed={handleRecoverAllFailed}
            recoveringTaskIds={recoveringTaskIds}
            onDiagnose={onDiagnose}
          />

          {hasActiveTasks && onBackgroundProcess && (
            <button type="button" className="btn btn-primary w-full" onClick={onBackgroundProcess}>
              <PlayCircle className="w-4 h-4 mr-2" />
              {t("task.backgroundProcessing")}
            </button>
          )}
        </div>
      </div>

      <VideoTaskDialogs
        trackingDialogOpen={trackingDialogOpen}
        setTrackingDialogOpen={setTrackingDialogOpen}
        selectedTask={selectedTask}
        toastSuccess={toastSuccess}
        toastError={toastError}
        previewDialogOpen={previewDialogOpen}
        setPreviewDialogOpen={setPreviewDialogOpen}
        setPreviewTask={setPreviewTask}
        previewTask={previewTask}
        cachedVideoUrl={cachedVideoUrl}
        videoLoadError={videoLoadError}
        videoLoading={videoLoading}
        setVideoLoadError={setVideoLoadError}
        handleDownloadVideo={handleDownloadVideo}
        deleteConfirmOpen={deleteConfirmOpen}
        setDeleteConfirmOpen={setDeleteConfirmOpen}
        taskToDelete={taskToDelete}
        isDeleting={isDeleting}
        confirmDeleteCache={confirmDeleteCache}
        cacheStates={cacheStates}
        bulkDeleteConfirmOpen={bulkDeleteConfirmOpen}
        setBulkDeleteConfirmOpen={setBulkDeleteConfirmOpen}
        selectedTaskIds={selectedTaskIds}
        filteredTasks={filteredTasks}
        confirmBulkDelete={confirmBulkDelete}
        detailDrawerOpen={detailDrawerOpen}
        setDetailDrawerOpen={setDetailDrawerOpen}
        detailTask={detailTask}
        handleOpenPreview={handleOpenPreview}
        handleJumpToBeat={handleJumpToBeat}
        handleRetryTask={handleRetryTask}
      />
    </div>
  );
}
