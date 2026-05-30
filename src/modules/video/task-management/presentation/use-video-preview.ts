import { useState, useCallback, useRef } from "react";
import type { VideoTask } from "@/modules/video/task-management";
import { getVideoUrlWithCache } from "@/modules/video/cache";
import { errorLogger } from "@/shared/error-logger";

export function useVideoPreview() {
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewTask, setPreviewTask] = useState<VideoTask | null>(null);
  const [cachedVideoUrl, setCachedVideoUrl] = useState<string | null>(null);
  const [videoLoadError, setVideoLoadError] = useState(false);
  const [videoLoading, setVideoLoading] = useState(false);

  const cachedVideoUrlRef = useRef<string | null>(null);
  // eslint-disable-next-line react-hooks/refs
  cachedVideoUrlRef.current = cachedVideoUrl;

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
    const url = cachedVideoUrlRef.current;
    if (url && url.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        errorLogger.warn("[VideoPreview] 释放 Blob URL 失败", e);
      }
    }
    setPreviewDialogOpen(false);
    setPreviewTask(null);
    setCachedVideoUrl(null);
    setVideoLoadError(false);
    setVideoLoading(false);
  }, []);

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
