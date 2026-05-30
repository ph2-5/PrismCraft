import { useState, useCallback } from "react";
import type { VideoTask } from "@/modules/video/task-management";
import { getVideoUrlWithCache } from "@/modules/video/cache";
import { errorLogger } from "@/shared/error-logger";

export function useVideoPreview() {
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewTask, setPreviewTask] = useState<VideoTask | null>(null);
  const [cachedVideoUrl, setCachedVideoUrl] = useState<string | null>(null);
  const [videoLoadError, setVideoLoadError] = useState(false);
  const [videoLoading, setVideoLoading] = useState(false);

  const openPreview = useCallback(async (task: VideoTask) => {
    setPreviewTask(task);
    setPreviewDialogOpen(true);
    setVideoLoadError(false);
    setCachedVideoUrl(null);

    if (task.videoUrl) {
      setVideoLoading(true);
      try {
        const result = await getVideoUrlWithCache(task.taskId, task.videoUrl);
        if (result.ok && result.value.url) {
          setCachedVideoUrl(result.value.url);
        }
      } catch (e) {
        errorLogger.warn("[VideoPreview] Failed to load video cache", e);
        setVideoLoadError(true);
      } finally {
        setVideoLoading(false);
      }
    }
  }, []);

  const closePreview = useCallback(() => {
    if (cachedVideoUrl && cachedVideoUrl.startsWith("blob:")) {
      try { URL.revokeObjectURL(cachedVideoUrl); } catch {}
    }
    setPreviewDialogOpen(false);
    setPreviewTask(null);
    setCachedVideoUrl(null);
    setVideoLoadError(false);
    setVideoLoading(false);
  }, [cachedVideoUrl]);

  return {
    previewDialogOpen,
    setPreviewDialogOpen,
    previewTask,
    setPreviewTask,
    cachedVideoUrl,
    setCachedVideoUrl,
    videoLoadError,
    setVideoLoadError,
    videoLoading,
    openPreview,
    closePreview,
  };
}
