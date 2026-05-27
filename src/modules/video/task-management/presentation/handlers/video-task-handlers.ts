import { useState, useEffect, useRef, useCallback } from "react";
import { VideoTask, useVideoTaskStore } from "@/modules/video/task-management";
import { recoverVideoByTaskId } from "@/modules/video/recovery";
import { getVideoUrlWithCache } from "@/modules/video/cache";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { buildTrackingInfo, copyTrackingInfoToClipboard, openTaskQueryLink } from "@/modules/video/task-management";
import { useNavigationGuard } from "@/shared/presentation/BeforeUnloadGuard";
import { errorLogger } from "@/shared/error-logger";
import { isAllowedVideoUrl } from "@/shared/utils/url-validation";
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
    if (!recoveryTaskId.trim()) { error("请输入任务ID", "请输入要找回的视频任务ID"); return; }
    setIsRecovering(true);
    try {
      const result = await recoverVideoByTaskId(recoveryTaskId.trim());
      if (result.ok) {
        success("找回成功", result.value.message);
        setRecoveryTaskId("");
        if (onTaskRecovered && result.value.status) onTaskRecovered(recoveryTaskId.trim(), result.value.status, result.value.videoUrl);
      } else {
        const errMsg = result.error instanceof Error ? result.error.message : "未知错误";
        error("找回失败", errMsg);
      }
    } catch (err) { error("找回失败", err instanceof Error ? err.message : "未知错误"); }
    finally { setIsRecovering(false); }
  };

  const handleCopyTracking = async (task: VideoTask) => {
    const trackingInfo = buildTrackingInfo(task.taskId, task.apiUrl, undefined, task.model);
    const result = await copyTrackingInfoToClipboard(trackingInfo);
    if (result.ok) success("复制成功", "任务追踪信息已复制到剪贴板");
    else error("复制失败", "无法复制信息到剪贴板");
  };

  const handleOpenCloudLink = (task: VideoTask) => {
    const trackingInfo = buildTrackingInfo(task.taskId, task.apiUrl, undefined, task.model);
    const opened = openTaskQueryLink(trackingInfo);
    if (!opened) error("无法打开链接", "请手动打开云服务商控制台查询");
  };

  const handleOpenPreview = (task: VideoTask) => { if (task.videoUrl) openPreview(task); };

  const handleManualPoll = async (task: VideoTask) => {
    if (!pollTask) return;
    setPollingTaskId(task.taskId);
    try { await pollTask(task.taskId); success("查询成功", "已手动查询任务状态已更新"); }
    catch { error("查询失败", "查询任务状态时出错"); }
    finally { setPollingTaskId(null); }
  };

  const handleRetryTask = async (task: VideoTask) => {
    if (!task.beatId) { error("无法重试", "该任务没有关联的分镜ID"); return; }
    setRetryingTaskId(task.taskId);
    try { guardedPush(`/story/beat/${task.beatId}`); success("跳转成功", "已跳转到分镜详情页，请重新生成视频"); }
    catch (err) { error("跳转失败", err instanceof Error ? err.message : "未知错误"); }
    finally { setRetryingTaskId(null); }
  };

  const handleCancelTask = async (task: VideoTask) => {
    setCancellingTaskId(task.taskId);
    try { await useVideoTaskStore.getState().cancelTask(task.taskId); success("已取消", "视频生成任务已取消"); }
    catch (err) { error("取消失败", err instanceof Error ? err.message : "未知错误"); }
    finally { setCancellingTaskId(null); }
  };

  const handleJumpToBeat = (task: VideoTask) => {
    if (task.beatId) guardedPush(`/story/beat/${task.beatId}`);
    else error("无法跳转", "该任务没有关联的分镜");
  };

  const handleOpenDetail = (task: VideoTask) => { setDetailTask(task); setDetailDrawerOpen(true); };

  const handleCopyTaskId = async (taskId: string) => {
    try { await navigator.clipboard.writeText(taskId); success("已复制", "任务ID已复制到剪贴板"); }
    catch { error("复制失败", "无法复制到剪贴板"); }
  };

  const handleExportCSV = () => {
    const headers = ["任务ID", "状态", "进度", "模型", "故事", "分镜", "创建时间", "视频URL"];
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
    const timer = setTimeout(() => URL.revokeObjectURL(url), 30000);
    blobUrlTimersRef.current.add(timer);
    success("导出成功", `已导出 ${rows.length} 个任务到CSV`);
  };

  const handleDownloadVideo = useCallback(async (task: VideoTask) => {
    if (!task.videoUrl) return;
    const filename = `video-${(task.taskId || "unknown").substring(0, 8)}.mp4`;
    try {
      const result = await getVideoUrlWithCache(task.taskId, task.videoUrl);
      const downloadUrl = (result.ok && result.value.url) || task.videoUrl;
      if (downloadUrl.startsWith("blob:")) {
        const link = document.createElement("a"); link.href = downloadUrl; link.download = filename;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        success("下载开始", "视频正在下载..."); return;
      }
      if (!isAllowedVideoUrl(downloadUrl)) {
        errorLogger.warn("[VideoTaskHandlers] 不安全的视频URL", { url: downloadUrl });
        const link = document.createElement("a"); link.href = downloadUrl; link.download = filename; link.target = "_blank"; link.rel = "noopener noreferrer";
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        success("已打开视频", "URL安全验证失败，已在新标签页打开视频"); return;
      }
      try {
        const response = await fetch(downloadUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const contentLength = response.headers.get("content-length");
        const maxSize = 500 * 1024 * 1024;
        if (contentLength && !Number.isNaN(parseInt(contentLength, 10)) && parseInt(contentLength, 10) > maxSize) throw new Error("File too large");
        const blob = await response.blob();
        if (blob.size > maxSize) throw new Error("File too large");
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a"); link.href = url; link.download = filename;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        const timer = setTimeout(() => URL.revokeObjectURL(url), 60000);
        blobUrlTimersRef.current.add(timer);
        success("下载开始", "正在下载视频");
      } catch {
        const link = document.createElement("a"); link.href = downloadUrl; link.download = filename; link.target = "_blank"; link.rel = "noopener noreferrer";
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        success("已打开视频", "直接下载失败，已在新标签页打开视频");
      }
    } catch {
      const link = document.createElement("a"); link.href = task.videoUrl; link.target = "_blank"; link.rel = "noopener noreferrer";
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      success("已打开视频", "下载失败，已在新标签页打开视频");
    }
  }, [success]);

  const handleBatchDownload = async () => {
    const selectedTasks = filteredTasks.filter((t) => selection.selectedTaskIds.has(t.taskId));
    const completedTasks = selectedTasks.filter((t) => t.status === "completed" && t.videoUrl);
    if (completedTasks.length === 0) { error("无法下载", "选中的任务中没有已完成的视频"); return; }
    for (const task of completedTasks) { await handleDownloadVideo(task); await new Promise((r) => setTimeout(r, 500)); }
    success("批量下载", `已开始下载 ${completedTasks.length} 个视频`);
  };

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
