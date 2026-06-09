import { errorLogger } from "@/shared/error-logger";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import { useState, useCallback, useRef, useEffect } from "react";
import { t } from "@/shared/constants";
import { useToastHelpers } from "@/shared/presentation/Toast";
import {
  type ModelParameterValues,
} from "@/shared/presentation/ModelParameterPanel";
import type { StoryBeat } from "@/domain/schemas";
import type { VideoTask } from "@/modules/video";
import { container } from "@/infrastructure/di";
import { useModelSelection } from "@/modules/prompt";
import { useNavigationGuard } from "@/shared/presentation/BeforeUnloadGuard";

interface UseBeatDetailActionsParams {
  beat: StoryBeat;
  task?: VideoTask;
}

export function useBeatDetailActions({ beat, task }: UseBeatDetailActionsParams) {
  const { guardedPush } = useNavigationGuard();
  const { success, error: showError } = useToastHelpers();

  const [videoUrl, setVideoUrl] = useState<string | undefined>(
    beat.videoGen?.videoUrl || task?.videoUrl,
  );
  const [isRefreshingUrl, setIsRefreshingUrl] = useState(false);
  const prevPropsVideoUrlRef = useRef(beat.videoGen?.videoUrl || task?.videoUrl);
  const [elementNames, setElementNames] = useState<Record<string, string>>({});

  const [selectedVideoModel, setSelectedVideoModel] = useModelSelection("video");
  const [modelParams, setModelParams] = useState<ModelParameterValues>({
    duration: 5,
    resolution: "1920x1080",
    style: t("quickGenerate.defaultStyle"),
    negativePrompt: "",
    seed: "",
    cfgScale: 7,
  });

  const handleModelParamsChange = useCallback((partial: Partial<ModelParameterValues>) => {
    setModelParams((prev) => ({ ...prev, ...partial }));
  }, []);

  const propsVideoUrl = beat.videoGen?.videoUrl || task?.videoUrl;
  if (prevPropsVideoUrlRef.current !== propsVideoUrl) {
    prevPropsVideoUrlRef.current = propsVideoUrl;
    setVideoUrl(propsVideoUrl);
  }

  useEffect(() => {
    if (!beat.elementIds || beat.elementIds.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const mgr = await container.elementManager;
        const names: Record<string, string> = {};
        await Promise.all(
          beat.elementIds.map(async (id) => {
            const el = await mgr.getElement(id);
            if (el) names[id] = el.name;
          }),
        );
        if (!cancelled) setElementNames(names);
      } catch (err) {
        errorLogger.warn("[BeatDetailClient] 加载元素名称失败", err instanceof Error ? err : undefined);
      }
    })();
    return () => { cancelled = true; };
  }, [beat.elementIds]);

  const handleCopyPrompt = useCallback(() => {
    const prompt = beat.videoGen?.prompt || beat.generationPrompt || "";
    navigator.clipboard.writeText(prompt).then(() => {
      success(t("success.copied"), t("success.promptCopied"));
    }).catch((err) => {
      errorLogger.warn("[BeatDetailClient] 复制提示词失败:", err);
      showError(t("error.copyFailed"), t("error.clipboardUnavailable"));
    });
  }, [beat, success, showError]);

  const handleDownloadVideo = useCallback(async () => {
    const url = videoUrl || beat.videoGen?.videoUrl || task?.videoUrl;
    if (!url) {
      showError(t("error.cannotDownload"), t("error.videoNotReady"));
      return;
    }
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `${beat.title || t("beat.downloadVideo")}_${beat.sequence}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      success(t("success.downloadStarted"), t("success.videoDownloadStarted"));
    } catch (err) {
      errorLogger.warn("[BeatDetailClient] 视频下载失败:", err instanceof Error ? err : undefined);
      showError(t("error.downloadFailed"), t("error.videoDownloadFallback"));
    }
  }, [videoUrl, beat, task, success, showError]);

  const handleCopyVideoUrl = useCallback(() => {
    const url = videoUrl || beat.videoGen?.videoUrl || task?.videoUrl;
    if (!url) {
      showError(t("error.cannotCopy"), t("error.videoUrlNotFound"));
      return;
    }
    navigator.clipboard.writeText(url).then(() => {
      success(t("success.copied"), t("success.videoUrlCopied"));
    }).catch((err) => {
      errorLogger.warn("[BeatDetailClient] 复制视频URL失败", err);
      showError(t("error.copyFailed"), t("error.clipboardUnavailable"));
    });
  }, [videoUrl, beat, task, success, showError]);

  const handleRefreshVideoUrl = useCallback(async () => {
    const taskId = beat.videoGen?.taskId || task?.taskId;
    if (!taskId) {
      showError(t("error.cannotRefresh"), t("error.taskIdNotFound"));
      return;
    }
    setIsRefreshingUrl(true);
    try {
      const response = await container.videoProvider.queryVideoStatus(
        taskId,
        {
          providerId: task?.providerId,
          modelId: task?.providerModelId,
          format: task?.providerFormat,
        },
      );
      if (response.data?.videoUrl) {
        setVideoUrl(response.data.videoUrl);
        success(t("success.urlRefreshed"), t("success.videoUrlUpdated"));
      } else if (response.data?.status === "completed") {
        showError(t("error.fetchFailed"), t("error.videoUrlMissing"));
      } else {
        showError(t("error.fetchFailed"), t("error.taskStatus", { status: response.data?.status || t("common.unknown") }));
      }
    } catch (err) {
      showError(t("error.fetchFailed"), mapUserFacingError(err));
    } finally {
      setIsRefreshingUrl(false);
    }
  }, [beat, task, success, showError]);

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "failed":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      case "generating":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "pending":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
    }
  };

  const getStatusLabel = (status?: string) => {
    switch (status) {
      case "completed":
        return t("beat.statusCompleted");
      case "failed":
        return t("beat.statusFailed");
      case "generating":
        return t("beat.statusProcessing");
      case "pending":
        return t("beat.statusWaiting");
      default:
        return t("beat.statusNotStarted");
    }
  };

  return {
    guardedPush,
    success,
    showError,
    videoUrl,
    setVideoUrl,
    isRefreshingUrl,
    elementNames,
    selectedVideoModel,
    setSelectedVideoModel,
    modelParams,
    handleModelParamsChange,
    handleCopyPrompt,
    handleDownloadVideo,
    handleCopyVideoUrl,
    handleRefreshVideoUrl,
    getStatusColor,
    getStatusLabel,
  };
}
