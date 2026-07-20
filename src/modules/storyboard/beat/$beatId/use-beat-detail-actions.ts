import { errorLogger } from "@/shared/error-logger";
import { handleError } from "@/shared/error-handler";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import { useState, useCallback, useRef, useEffect } from "react";
import { t, BLOB_URL_LONG_REVOKE_DELAY_MS } from "@/shared/constants";
import { useToastHelpers } from "@/shared/presentation/Toast";
import {
  type ModelParameterValues,
} from "@/shared/presentation/ModelParameterPanel";
import type { StoryBeat, Story } from "@/domain/schemas";
import { getFirstFrameUrl } from "@/domain/utils";
import type { VideoTask } from "@/modules/video";
import { container } from "@/infrastructure/di";
import { useModelSelection } from "@/modules/prompt";
import { useNavigationGuard } from "@/shared/presentation/BeforeUnloadGuard";
import { generateBeatFramePair, storyService } from "@/modules/storyboard";
import { checkVisualConsistency } from "@/modules/shot";
import { StoryGenerationService } from "@/domain/services";
import { characterService } from "@/modules/character";
import { sceneService } from "@/modules/scene";

interface UseBeatDetailActionsParams {
  story: Story;
  beat: StoryBeat;
  task?: VideoTask;
  setBeat: (beat: StoryBeat | null) => void;
  onUpdateBeat?: (id: string, updates: Partial<StoryBeat>) => void;
}

const STATUS_COLOR_MAP: Record<string, string> = {
  completed: "bg-success/10 text-success",
  failed: "bg-destructive/10 text-destructive",
  generating: "bg-primary/10 text-primary",
  pending: "bg-warning/10 text-warning",
};

const STATUS_LABEL_MAP: Record<string, string> = {
  completed: t("beat.statusCompleted"),
  failed: t("beat.statusFailed"),
  generating: t("beat.statusProcessing"),
  pending: t("beat.statusWaiting"),
};

function getBeatStatusColor(status?: string): string {
  return status ? (STATUS_COLOR_MAP[status] ?? "bg-muted text-muted-foreground") : "bg-muted text-muted-foreground";
}

function getBeatStatusLabel(status?: string): string {
  return status ? (STATUS_LABEL_MAP[status] ?? t("beat.statusNotStarted")) : t("beat.statusNotStarted");
}

async function loadBeatElementNames(elementIds: string[]): Promise<Record<string, string>> {
  const mgr = await container.elementManager;
  const names: Record<string, string> = {};
  await Promise.all(
    elementIds.map(async (id) => {
      const el = await mgr.getElement(id);
      if (el) names[id] = el.name;
    }),
  );
  return names;
}

async function downloadBeatVideo(url: string, beat: StoryBeat): Promise<void> {
  const response = await fetch(url);
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = `${beat.title || t("beat.downloadVideo")}_${beat.sequence}.mp4`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), BLOB_URL_LONG_REVOKE_DELAY_MS);
}

async function refreshBeatVideoUrl(
  taskId: string,
  task?: VideoTask,
): Promise<{ videoUrl?: string; status?: string }> {
  const response = await container.videoProvider.queryVideoStatus(
    taskId,
    {
      providerId: task?.providerId,
      modelId: task?.providerModelId,
      format: task?.providerFormat,
    },
  );
  return { videoUrl: response.data?.videoUrl, status: response.data?.status };
}

interface RegenerateBeatContext {
  beat: StoryBeat;
  story: Story;
  setBeat: (beat: StoryBeat | null) => void;
  onUpdateBeat?: (id: string, updates: Partial<StoryBeat>) => void;
  success: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;
}

async function regenerateBeatFramePair({
  beat,
  story,
  setBeat,
  onUpdateBeat,
  success,
  showError,
}: RegenerateBeatContext): Promise<void> {
  const [charactersResult, scenesResult] = await Promise.all([
    characterService.getAll(),
    sceneService.getAll(),
  ]);
  const characters = charactersResult.ok ? charactersResult.value : [];
  const scenes = scenesResult.ok ? scenesResult.value : [];

  const beats = story.beats || [];
  const beatIndex = beats.findIndex((b) => b.id === beat.id);
  const prevBeat = beatIndex > 0 ? beats[beatIndex - 1]! : null;

  const { characterRefs, sceneRef, prevLastFrameUrl } = StoryGenerationService.resolveGenerationContext({
    beat,
    prevBeat,
    characters,
    scenes,
    elements: [],
  });

  const framePair = await generateBeatFramePair(beat, {
    characterRefs,
    sceneRef,
    prevLastFrameUrl,
    providerId: undefined,
    modelId: undefined,
    characters,
    scenes,
    autoGeneratePrompts: true,
    beatIndex,
    prevBeatDescription: prevBeat?.content || prevBeat?.description,
    nextBeatDescription: (() => {
      const nextBeat = beatIndex >= 0 && beatIndex < beats.length - 1
        ? beats[beatIndex + 1]
        : null;
      return nextBeat?.content || nextBeat?.description;
    })(),
  }, {
    videoProvider: container.videoProvider,
    imageProvider: container.imageProvider,
    textProvider: container.textProvider,
  });

  const updatedBeat = { ...beat, framePair } as StoryBeat;

  try {
    const elements = await container.elementStorage.getAllElements();
    const consistencyResult = await checkVisualConsistency({
      beat: updatedBeat,
      elements,
      generatedImageUrl: getFirstFrameUrl(updatedBeat.framePair),
    });
    if (consistencyResult.ok) {
      updatedBeat.consistencyCheck = consistencyResult.value;
    }
  } catch (checkErr) {
    errorLogger.warn(handleError(checkErr), "Consistency");
    showError(t("error.consistencyCheckError"), mapUserFacingError(checkErr));
  }

  setBeat(updatedBeat);
  onUpdateBeat?.(updatedBeat.id, updatedBeat);

  // Persist to DB so StoryProvider reloads fresh data when returning to list
  const updatedBeats = (story.beats || []).map((b) => (b.id === updatedBeat.id ? updatedBeat : b));
  void storyService.update(story.id, { id: story.id, beats: updatedBeats }).then((result) => {
    if (!result.ok) {
      errorLogger.warn("[BeatDetail] Failed to persist beat update", result.error);
    }
  }).catch((err) => {
    errorLogger.warn("[BeatDetail] Failed to persist beat update", err);
  });

  success(t("success.generated"), t("success.framePairGeneratedDesc"));
}

export function useBeatDetailActions({ story, beat, task, setBeat, onUpdateBeat }: UseBeatDetailActionsParams) {
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
  const [isRegenerating, setIsRegenerating] = useState(false);

  const handleModelParamsChange = useCallback((partial: Partial<ModelParameterValues>) => {
    setModelParams((prev) => ({ ...prev, ...partial }));
  }, []);

  const propsVideoUrl = beat.videoGen?.videoUrl || task?.videoUrl;
  useEffect(() => {
    if (prevPropsVideoUrlRef.current !== propsVideoUrl) {
      prevPropsVideoUrlRef.current = propsVideoUrl;
      setVideoUrl(propsVideoUrl);
    }
  }, [propsVideoUrl]);

  useEffect(() => {
    if (!beat.elementIds || beat.elementIds.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const names = await loadBeatElementNames(beat.elementIds);
        if (!cancelled) setElementNames(names);
      } catch (err) {
        errorLogger.warn("[BeatDetailClient] 加载元素名称失败", err instanceof Error ? err : undefined);
      }
    })();
    return () => { cancelled = true; };
  }, [beat.elementIds]);

  const handleCopyPrompt = useCallback(() => {
    const prompt = beat.videoGen?.prompt || "";
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
      await downloadBeatVideo(url, beat);
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
      const { videoUrl: refreshedUrl, status } = await refreshBeatVideoUrl(taskId, task);
      if (refreshedUrl) {
        setVideoUrl(refreshedUrl);
        success(t("success.urlRefreshed"), t("success.videoUrlUpdated"));
      } else if (status === "completed") {
        showError(t("error.fetchFailed"), t("error.videoUrlMissing"));
      } else {
        showError(t("error.fetchFailed"), t("error.taskStatus", { status: status || t("common.unknown") }));
      }
    } catch (err) {
      showError(t("error.fetchFailed"), mapUserFacingError(err));
    } finally {
      setIsRefreshingUrl(false);
    }
  }, [beat, task, success, showError]);

  const handleRegenerate = useCallback(async () => {
    if (!beat.keyframe?.imageUrl) {
      showError(t("story.cannotGenerateVideo"));
      return;
    }
    setIsRegenerating(true);
    try {
      await regenerateBeatFramePair({
        beat,
        story,
        setBeat,
        onUpdateBeat,
        success,
        showError,
      });
    } catch (err) {
      showError(t("story.cannotGenerateVideo"), mapUserFacingError(err));
    } finally {
      setIsRegenerating(false);
    }
  }, [beat, story, setBeat, onUpdateBeat, success, showError]);

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
    getStatusColor: getBeatStatusColor,
    getStatusLabel: getBeatStatusLabel,
    handleRegenerate,
    isRegenerating,
  };
}
