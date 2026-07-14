import { useState, useEffect, useRef, useCallback } from "react";
import { type VideoTask, useVideoTaskStore } from "@/modules/video/task-management";
import { recoverVideoByTaskId } from "@/modules/video/recovery";
import { getVideoUrlWithCache } from "@/modules/video/cache";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { buildTrackingInfoByProviderId, copyTrackingInfoToClipboard, openTaskQueryLink } from "@/modules/video/task-management";
import { useNavigationGuard } from "@/shared/presentation/BeforeUnloadGuard";
import { errorLogger } from "@/shared/error-logger";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import { isAllowedVideoUrl } from "@/shared/utils/url-validation";
import { t } from "@/shared/constants/messages";
import { BATCH_OPERATION_INTERVAL_MS, MINUTE_MS } from "@/shared/constants";
import { useCacheOperations } from "./use-cache-operations";
import { useTaskSelection } from "./use-task-selection";

interface UseVideoTaskHandlersDeps {
  tasks: VideoTask[];
  filteredTasks: VideoTask[];
  completedTaskIds: string[];
  pollTask?: (taskId: string) => Promise<void>;
  removeTasks?: (taskIds: string[]) => Promise<void>;
  onTaskRecovered?: (taskId: string, status: string, videoUrl?: string) => void;
  openPreview: (task: VideoTask) => void;
}

export function useVideoTaskHandlers(deps: UseVideoTaskHandlersDeps) {
  const { tasks, filteredTasks, completedTaskIds, pollTask, removeTasks, onTaskRecovered, openPreview } = deps;
  const { guardedPush } = useNavigationGuard();
  const { success, error } = useToastHelpers();
  const blobUrlTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  /** CSV 导出 blob URL 释放延迟（30 秒） */
  const CSV_BLOB_REVOKE_DELAY_MS = 30 * 1000;
  /** 视频下载 blob URL 释放延迟（1 分钟） */
  const VIDEO_BLOB_REVOKE_DELAY_MS = MINUTE_MS;

  const cacheOps = useCacheOperations({ completedTaskIds });
  const selection = useTaskSelection({
    filteredTasks,
    removeTasks,
    onAfterDelete: cacheOps.refreshCacheStats,
  });

  const [recoveryTaskId, setRecoveryTaskId] = useState("");
  const [isRecovering, setIsRecovering] = useState(false);
  const [trackingDialogOpen, setTrackingDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<VideoTask | null>(null);
  const [pollingTaskId, setPollingTaskId] = useState<string | null>(null);
  const [retryingTaskId, setRetryingTaskId] = useState<string | null>(null);
  const [cancellingTaskId, setCancellingTaskId] = useState<string | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [detailTask, setDetailTask] = useState<VideoTask | null>(null);

  useEffect(() => {
    const currentTimers = blobUrlTimersRef.current;
    return () => {
      for (const timer of currentTimers) clearTimeout(timer);
      currentTimers.clear();
    };
  }, []);

  const handleRecoverVideo = async () => {
    if (!recoveryTaskId.trim()) { error(t("video.enterTaskId"), t("video.enterTaskIdHint")); return; }
    setIsRecovering(true);
    try {
      const result = await recoverVideoByTaskId(recoveryTaskId.trim());
      if (result.ok) {
        success(t("video.recovered"), result.value.message);
        setRecoveryTaskId("");
        if (onTaskRecovered && result.value.status) onTaskRecovered(recoveryTaskId.trim(), result.value.status, result.value.videoUrl);
      } else {
        error(t("error.operationFailed"), mapUserFacingError(result.error));
      }
    } catch (err) { error(t("error.operationFailed"), mapUserFacingError(err)); }
    finally { setIsRecovering(false); }
  };

  const handleCopyTracking = useCallback(async (task: VideoTask) => {
    const trackingInfo = buildTrackingInfoByProviderId(task.taskId, task.apiUrl, undefined, task.model);
    const result = await copyTrackingInfoToClipboard(trackingInfo);
    if (result.ok) success(t("video.copySuccess"), t("video.trackingCopied"));
    else error(t("error.copyFailed"), t("error.clipboardUnavailable"));
  }, [success, error]);

  const handleOpenCloudLink = useCallback((task: VideoTask) => {
    const trackingInfo = buildTrackingInfoByProviderId(task.taskId, task.apiUrl, undefined, task.model);
    const opened = openTaskQueryLink(trackingInfo);
    if (!opened) error(t("error.cannotOpenLink"), t("video.openCloudConsoleHint"));
  }, [error]);

  const handleOpenPreview = useCallback((task: VideoTask) => { if (task.videoUrl) openPreview(task); }, [openPreview]);

  const handleManualPoll = useCallback(async (task: VideoTask) => {
    if (!pollTask) return;
    setPollingTaskId(task.taskId);
    try { await pollTask(task.taskId); success(t("video.querySuccess"), t("video.querySuccessDesc")); }
    catch (err) { errorLogger.error("[VideoTaskHandlers] 手动轮询失败", err instanceof Error ? err : undefined); error(t("error.operationFailed"), t("error.queryTaskStatusFailed")); }
    finally { setPollingTaskId(null); }
  }, [pollTask, success, error]);

  const handleRetryTask = useCallback(async (task: VideoTask) => {
    if (!task.beatId) { error(t("error.cannotRetry"), t("video.noBeatId")); return; }
    setRetryingTaskId(task.taskId);
    try { guardedPush(`/story/beat/${task.beatId}`); success(t("video.jumpSuccess"), t("video.jumpToBeatDesc")); }
    catch (err) { error(t("error.operationFailed"), mapUserFacingError(err)); }
    finally { setRetryingTaskId(null); }
  }, [guardedPush, success, error]);

  const handleCancelTask = useCallback(async (task: VideoTask) => {
    setCancellingTaskId(task.taskId);
    try { await useVideoTaskStore.getState().cancelTask(task.taskId); success(t("video.cancelled"), t("video.taskCancelled")); }
    catch (err) { error(t("error.operationFailed"), mapUserFacingError(err)); }
    finally { setCancellingTaskId(null); }
  }, [success, error]);

  const handleJumpToBeat = useCallback((task: VideoTask) => {
    if (task.beatId) guardedPush(`/story/beat/${task.beatId}`);
    else error(t("error.cannotJump"), t("video.noBeatAssociated"));
  }, [guardedPush, error]);

  const handleOpenDetail = useCallback((task: VideoTask) => { setDetailTask(task); setDetailDrawerOpen(true); }, []);

  const handleCopyTaskId = useCallback(async (taskId: string) => {
    try { await navigator.clipboard.writeText(taskId); success(t("success.copied"), t("video.taskIdCopiedToClipboard")); }
    catch (err) { errorLogger.error("[VideoTaskHandlers] 复制任务ID失败", err instanceof Error ? err : undefined); error(t("error.operationFailed"), t("error.clipboardUnavailable")); }
  }, [success, error]);

  const handleExportCSV = useCallback(() => {
    const headers = [t("task.csvTaskId"), t("task.csvStatus"), t("task.csvProgress"), t("task.csvModel"), t("task.csvStory"), t("task.csvBeat"), t("task.csvCreatedAt"), t("task.csvVideoUrl")];
    const rows = filteredTasks.map((t) => [t.taskId, t.status, `${t.progress}%`, t.model || "", t.storyTitle || "", t.beatTitle || "", new Date(t.createdAt).toLocaleString(), t.videoUrl || ""]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `video-tasks-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    const timer = setTimeout(() => URL.revokeObjectURL(url), CSV_BLOB_REVOKE_DELAY_MS);
    blobUrlTimersRef.current.add(timer);
    success(t("success.exported"), t("video.exportedToCsv", { count: rows.length }));
  }, [filteredTasks, success]);

  const handleDownloadVideo = useCallback(async (task: VideoTask) => {
    if (!task.videoUrl) return;
    const filename = `video-${(task.taskId || "unknown").substring(0, 8)}.mp4`;
    try {
      const result = await getVideoUrlWithCache(task.taskId, task.videoUrl);
      const downloadUrl = (result.ok && result.value.url) || task.videoUrl;
      if (downloadUrl.startsWith("blob:")) {
        const link = document.createElement("a"); link.href = downloadUrl; link.download = filename;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        success(t("video.downloadStarted"), t("video.videoDownloading")); return;
      }
      if (!isAllowedVideoUrl(downloadUrl)) {
        errorLogger.warn("[VideoTaskHandlers] 不安全的视频URL", { url: downloadUrl });
        const link = document.createElement("a"); link.href = downloadUrl; link.download = filename; link.target = "_blank"; link.rel = "noopener noreferrer";
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        success(t("video.videoOpened"), t("video.urlValidationFailed")); return;
      }
      try {
        const response = await fetch(downloadUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const contentLength = response.headers.get("content-length");
        const maxSize = 500 * 1024 * 1024; // 500MB 视频下载大小上限
        if (contentLength && !Number.isNaN(parseInt(contentLength, 10)) && parseInt(contentLength, 10) > maxSize) throw new Error("File too large");
        const blob = await response.blob();
        if (blob.size > maxSize) throw new Error("File too large");
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a"); link.href = url; link.download = filename;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        const timer = setTimeout(() => URL.revokeObjectURL(url), VIDEO_BLOB_REVOKE_DELAY_MS);
        blobUrlTimersRef.current.add(timer);
        success(t("video.downloadStarted"), t("video.videoDownloadingShort"));
      } catch (err) {
        errorLogger.error(t("error.videoDirectDownloadFailed"), err instanceof Error ? err : undefined);
        const link = document.createElement("a"); link.href = downloadUrl; link.download = filename; link.target = "_blank"; link.rel = "noopener noreferrer";
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        success(t("video.videoOpened"), t("video.directDownloadFailed"));
      }
    } catch (err) {
      errorLogger.error(t("error.videoDownloadFailedFallback"), err instanceof Error ? err : undefined);
      const link = document.createElement("a"); link.href = task.videoUrl; link.target = "_blank"; link.rel = "noopener noreferrer";
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      success(t("video.videoOpened"), t("video.downloadFailedOpened"));
    }
  }, [success]);

  const handleBatchDownload = useCallback(async () => {
    const selectedTasks = filteredTasks.filter((t) => selection.selectedTaskIds.has(t.taskId));
    const completedTasks = selectedTasks.filter((t) => t.status === "completed" && t.videoUrl);
    if (completedTasks.length === 0) { error(t("error.cannotDownload"), t("video.noCompletedVideos")); return; }
    for (const task of completedTasks) { await handleDownloadVideo(task); await new Promise((r) => setTimeout(r, BATCH_OPERATION_INTERVAL_MS)); }
    success(t("video.batchDownload"), t("video.batchDownloadStarted", { count: completedTasks.length }));
  }, [filteredTasks, selection.selectedTaskIds, handleDownloadVideo, success, error]);

  const hasActiveTasks = tasks.some((task) => task.status === "pending" || task.status === "generating");

  return {
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
    cacheStates: cacheOps.cacheStates,
    deleteConfirmOpen: cacheOps.deleteConfirmOpen,
    setDeleteConfirmOpen: cacheOps.setDeleteConfirmOpen,
    taskToDelete: cacheOps.taskToDelete,
    isDeleting: cacheOps.isDeleting || selection.isDeleting,
    cacheStats: cacheOps.cacheStats,
    selectedTaskIds: selection.selectedTaskIds,
    bulkDeleteConfirmOpen: selection.bulkDeleteConfirmOpen,
    setBulkDeleteConfirmOpen: selection.setBulkDeleteConfirmOpen,
    detailDrawerOpen,
    setDetailDrawerOpen,
    detailTask,
    handleDeleteCache: cacheOps.handleDeleteCache,
    confirmDeleteCache: cacheOps.confirmDeleteCache,
    toggleTaskSelection: selection.toggleTaskSelection,
    selectAllFilteredTasks: selection.selectAllFilteredTasks,
    deselectAllTasks: selection.deselectAllTasks,
    handleBulkDelete: selection.handleBulkDelete,
    confirmBulkDelete: selection.confirmBulkDelete,
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
    toastSuccess: success,
    toastError: error,
  };
}
