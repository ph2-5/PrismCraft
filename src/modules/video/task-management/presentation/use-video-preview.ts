import { useState, useCallback } from "react";
import type { VideoTask } from "@/modules/video/task-management";
import { getVideoUrlWithCache } from "@/modules/video/cache";

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
      } catch {
        setVideoLoadError(true);
      } finally {
        setVideoLoading(false);
      }
    }
  }, []);

  const closePreview = useCallback(() => {
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
