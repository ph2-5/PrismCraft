 
import { useReducer, useEffect, useCallback, useMemo, useRef, useState } from "react";
import {
  generateQuickModeVideoPrompt,
} from "@/modules/prompt";
import {
  applyVideoTemplate,
  type VideoTemplate,
} from "@/modules/video";
import {
  useCharacters,
} from "@/modules/character";
import {
  useScenes,
} from "@/modules/scene";
import {
  useCreateMediaAsset,
} from "@/modules/asset";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { useVideoTaskManager, type VideoTask } from "@/modules/video";
import { getVideoUrlWithCache } from "@/modules/video";
import { useModelSelection } from "@/modules/prompt";
import { errorLogger } from "@/shared/error-logger";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import { t } from "@/shared/constants";
import { useNavigationGuard } from "@/shared/presentation/BeforeUnloadGuard";
import type { Character, Scene } from "@/domain/schemas";
import { quickGenerateReducer, initialState, type QuickGenerateAction } from "./quick-generate-reducer";

export type { QuickGenerateState, QuickGenerateAction } from "./quick-generate-reducer";

const MAX_VIDEO_SIZE = 50 * 1024 * 1024;

const QUICK_EXAMPLES = [
  t("quickGenerate.example1"),
  t("quickGenerate.example2"),
  t("quickGenerate.example3"),
];

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result === "string") {
        resolve(result);
      } else {
        reject(new Error("Failed to read file as Data URL"));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function downloadVideoFile(videoUrl: string, filename: string): Promise<void> {
  try {
    const response = await fetch(videoUrl);
    if (!response.ok) throw new Error(t("error.downloadFailedStatus", { status: response.status }));
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    errorLogger.warn("[QuickGenerate] Failed to download video via fetch, falling back to direct link", e as Error);
    const link = document.createElement("a");
    link.href = videoUrl;
    link.download = filename;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

interface SaveToAssetsArgs {
  task: VideoTask;
  isSavingToAssets: boolean;
  promptText: string;
  selectedStyle: string;
  duration: number;
}

function useSaveToAssets(
  createMediaAssetMutation: ReturnType<typeof useCreateMediaAsset>,
  showSuccess: (title: string, desc?: string) => void,
  showError: (title: string, desc?: string) => void,
  dispatch: React.Dispatch<QuickGenerateAction>,
) {
  return useCallback(async (args: SaveToAssetsArgs) => {
    const { task, isSavingToAssets, promptText, selectedStyle, duration } = args;
    if (!task.videoUrl || isSavingToAssets) return;
    dispatch({ type: "SET_IS_SAVING_TO_ASSETS", value: true });
    try {
      await createMediaAssetMutation.mutateAsync({
        name: t("quickGenerate.assetName", { prompt: promptText.slice(0, 20) }),
        description: promptText,
        type: "video",
        url: task.videoUrl,
        tags: [selectedStyle, t("quickGenerate.secondsTag", { count: duration })],
        duration,
      });
      showSuccess(t("video.savedToLibrary"));
    } catch (_error) {
      showError(t("error.saveFailed"), mapUserFacingError(_error));
    } finally {
      dispatch({ type: "SET_IS_SAVING_TO_ASSETS", value: false });
    }
  }, [createMediaAssetMutation, showSuccess, showError, dispatch]);
}

function useApplyTemplate(
  showSuccess: (title: string, desc?: string) => void,
  dispatch: React.Dispatch<QuickGenerateAction>,
) {
  return useCallback((template: VideoTemplate) => {
    const { prompt, duration: templateDuration, style } = applyVideoTemplate(template);
    dispatch({ type: "APPLY_TEMPLATE", prompt, duration: templateDuration, style });
    showSuccess(t("quickGenerate.templateApplied"), t("quickGenerate.templateAppliedDesc", { name: t(template.nameKey) }));
  }, [showSuccess, dispatch]);
}

interface SelectionState {
  selectedCharacters: string[];
  selectedScene: string | null;
}

function useSelectionHelpers(
  state: SelectionState,
  characters: Character[],
  scenes: Scene[],
  dispatch: React.Dispatch<QuickGenerateAction>,
) {
  const toggleCharacter = useCallback((charId: string) => {
    dispatch({ type: "TOGGLE_CHARACTER", charId });
  }, [dispatch]);

  const toggleScene = useCallback((sceneId: string) => {
    dispatch({ type: "TOGGLE_SCENE", sceneId });
  }, [dispatch]);

  const getSelectedCharacterObjects = useCallback(() => {
    return characters.filter((c) => state.selectedCharacters.includes(c.id));
  }, [characters, state.selectedCharacters]);

  const getSelectedSceneObject = useCallback(() => {
    return scenes.find((s) => s.id === state.selectedScene) || null;
  }, [scenes, state.selectedScene]);

  return { toggleCharacter, toggleScene, getSelectedCharacterObjects, getSelectedSceneObject };
}

interface GenerateActionDeps {
  showError: (title: string, desc?: string) => void;
  showWarning: (title: string, desc?: string) => void;
  showSuccess: (title: string, desc?: string) => void;
  selectedVideoModel: { providerId?: string; modelId?: string; format?: string } | null;
  getSelectedCharacterObjects: () => Character[];
  getSelectedSceneObject: () => Scene | null;
  createTask: GenerateDeps["createTask"];
  dispatch: React.Dispatch<QuickGenerateAction>;
}

function useGenerateActions(
  state: GenerateParams,
  deps: GenerateActionDeps,
) {
  const handleGenerate = useCallback(async (promptOverride?: string) => {
    const effectivePrompt = promptOverride ?? state.promptText;
    const result = generateQuickModeVideoPrompt({
      prompt: effectivePrompt,
      duration: state.duration,
      resolution: state.selectedResolution,
      style: state.selectedStyle,
      characters: deps.getSelectedCharacterObjects(),
      scene: deps.getSelectedSceneObject() || undefined,
      referenceImage: state.referenceImage || undefined,
      enableSmartOptimization: state.enableSmartOptimization,
      negativePrompt: state.negativePrompt || undefined,
    });
    deps.dispatch({ type: "SET_GENERATED_PROMPT", value: result });
    await executeGenerate(
      state,
      deps,
      promptOverride,
    );
  }, [state, deps]);

  const handleRetry = useCallback((task: VideoTask) => {
    if (task.prompt) {
      deps.dispatch({ type: "SET_PROMPT_TEXT", value: task.prompt });
    }
    return handleGenerate(task.prompt);
  }, [handleGenerate, deps]);

  return { handleGenerate, handleRetry };
}

interface VideoCacheResult {
  cachedVideoUrl: string | null;
  cachedVideoUrlTaskId: string | null;
}

function useVideoCacheEffect(
  currentTask: VideoTask | null | undefined,
  blobUrlsToRevokeRef: React.MutableRefObject<Set<string>>,
  dispatch: React.Dispatch<QuickGenerateAction>,
): VideoCacheResult {
  const [cache, setCache] = useState<{ url: string | null; taskId: string | null }>({ url: null, taskId: null });

  useEffect(() => {
    if (
      currentTask?.videoUrl &&
      currentTask?.taskId &&
      currentTask?.status === "completed"
    ) {
      let cancelled = false;
      const taskId = currentTask.taskId;
      getVideoUrlWithCache(currentTask.taskId, currentTask.videoUrl).then(
        (result) => {
          if (!cancelled && result.ok && result.value.url) {
            const url = result.value.url;
            if (url.startsWith("blob:")) {
              blobUrlsToRevokeRef.current.add(url);
            }
            setCache({ url, taskId });
          }
        },
      ).catch((e) => {
        errorLogger.warn("[QuickGenerate] 获取视频缓存URL失败:", e);
      });
      return () => {
        cancelled = true;
      };
    }
    return;
  }, [currentTask?.videoUrl, currentTask?.taskId, currentTask?.status, blobUrlsToRevokeRef]);

  // keep dispatch reference for future extension
  void dispatch;
  return { cachedVideoUrl: cache.url, cachedVideoUrlTaskId: cache.taskId };
}

interface ReferenceVideoHandlers {
  handleUploadReferenceVideo: (file: File) => void;
  handleRemoveReferenceVideo: () => void;
}

function useReferenceVideoHandlers(
  state: { referenceVideo: string | null },
  referenceVideoBlobRef: React.MutableRefObject<string | null>,
  dispatch: React.Dispatch<QuickGenerateAction>,
  showSuccess: (title: string, desc?: string) => void,
): ReferenceVideoHandlers {
  const handleUploadReferenceVideo = useCallback(
    (file: File) => {
      if (state.referenceVideo && state.referenceVideo.startsWith("blob:")) {
        URL.revokeObjectURL(state.referenceVideo);
      }
      const blobUrl = URL.createObjectURL(file);
      referenceVideoBlobRef.current = blobUrl;
      dispatch({ type: "UPLOAD_REFERENCE_VIDEO", blobUrl, file, name: file.name });
      showSuccess(t("video.refVideoUploaded"));
    },
    [showSuccess, state.referenceVideo, referenceVideoBlobRef, dispatch],
  );

  const handleRemoveReferenceVideo = useCallback(() => {
    if (state.referenceVideo && state.referenceVideo.startsWith("blob:")) {
      URL.revokeObjectURL(state.referenceVideo);
    }
    referenceVideoBlobRef.current = null;
    dispatch({ type: "REMOVE_REFERENCE_VIDEO" });
  }, [state.referenceVideo, referenceVideoBlobRef, dispatch]);

  return { handleUploadReferenceVideo, handleRemoveReferenceVideo };
}

interface GenerateParams {
  promptText: string;
  duration: number;
  selectedResolution: string;
  selectedStyle: string;
  referenceImage: string | null;
  enableSmartOptimization: boolean;
  negativePrompt: string | null;
  referenceVideoFile: File | null;
  selectedCharacters: string[];
  selectedScene: string | null;
}

interface GenerateDeps {
  showError: (title: string, desc?: string) => void;
  showWarning: (title: string, desc?: string) => void;
  showSuccess: (title: string, desc?: string) => void;
  selectedVideoModel: { providerId?: string; modelId?: string; format?: string } | null;
  getSelectedCharacterObjects: () => Character[];
  getSelectedSceneObject: () => Scene | null;
  createTask: (
    prompt: string,
    _unused?: undefined,
    opts?: {
      fixedImageUrl?: string;
      fixedImageLockType?: "scene" | "character";
      referenceVideo?: string | null;
      providerId?: string;
      modelId?: string;
      format?: string;
    },
  ) => Promise<{ promptWasTruncated?: boolean } | null>;
}

class GenerateAbortError extends Error {}

async function readReferenceVideo(file: File | null, showError: (title: string, desc?: string) => void): Promise<string | null> {
  if (!file) return null;
  if (file.size > MAX_VIDEO_SIZE) {
    showError(t("error.fileTooLarge"), t("video.refVideoSizeLimit"));
    throw new GenerateAbortError();
  }
  return await readFileAsDataURL(file);
}

function validateGenerateRequest(
  effectivePrompt: string,
  deps: GenerateDeps,
): boolean {
  if (!effectivePrompt.trim()) {
    deps.showError(t("video.enterDescription"));
    return false;
  }
  if (!deps.selectedVideoModel?.providerId || !deps.selectedVideoModel?.modelId) {
    deps.showError(t("video.selectModel"), t("video.selectModelHint"));
    return false;
  }
  return true;
}

function resolveImageUrl(
  params: GenerateParams,
  selectedSceneObj: Scene | null,
  selectedCharObjs: Character[],
): string | undefined {
  return (
    params.referenceImage ||
    selectedSceneObj?.generatedImage ||
    (selectedCharObjs.length > 0 ? selectedCharObjs[0]?.generatedImage : undefined)
  );
}

async function executeGenerate(
  params: GenerateParams,
  deps: GenerateDeps,
  promptOverride?: string,
): Promise<void> {
  const effectivePrompt = promptOverride ?? params.promptText;
  if (!validateGenerateRequest(effectivePrompt, deps)) return;

  try {
    const selectedCharObjs = deps.getSelectedCharacterObjects();
    const selectedSceneObj = deps.getSelectedSceneObject();

    const prompt = generateQuickModeVideoPrompt({
      prompt: effectivePrompt,
      duration: params.duration,
      resolution: params.selectedResolution,
      style: params.selectedStyle,
      characters: selectedCharObjs,
      scene: selectedSceneObj || undefined,
      referenceImage: params.referenceImage || undefined,
      enableSmartOptimization: params.enableSmartOptimization,
      negativePrompt: params.negativePrompt || undefined,
    });

    const imageUrl = resolveImageUrl(params, selectedSceneObj, selectedCharObjs);
    const referenceVideoBase64 = await readReferenceVideo(params.referenceVideoFile, deps.showError);

    const videoModel = deps.selectedVideoModel;
    const task = await deps.createTask(prompt, undefined, {
      fixedImageUrl: imageUrl,
      fixedImageLockType: selectedSceneObj ? "scene" : "character",
      referenceVideo: referenceVideoBase64,
      providerId: videoModel?.providerId,
      modelId: videoModel?.modelId,
      format: videoModel?.format,
    });

    if (!task) return;
    if (task.promptWasTruncated) {
      deps.showWarning(t("task.promptTooLong"), t("task.promptTruncated"));
    }
    deps.showSuccess(t("video.startGeneration"));
  } catch (error) {
    if (error instanceof GenerateAbortError) return;
    errorLogger.error("生成失败:", error);
    deps.showError(t("video.generateFailed"), mapUserFacingError(error));
  }
}

export function useQuickGenerateState() {
  const { guardedPush } = useNavigationGuard();
  const {
    success: showSuccess,
    error: showError,
    warning: showWarning,
  } = useToastHelpers();

  const { data: characters = [], isLoading: charactersLoading } = useCharacters();
  const { data: scenes = [], isLoading: scenesLoading } = useScenes();
  const createMediaAssetMutation = useCreateMediaAsset();

  const [state, dispatch] = useReducer(quickGenerateReducer, initialState);
  const referenceVideoBlobRef = useRef<string | null>(null);
  const blobUrlsToRevokeRef = useRef<Set<string>>(new Set());

  // 合并 blob URL 清理逻辑：卸载时撤销所有待清理的 blob URL 和引用视频 blob
  useEffect(() => {
    return () => {
      for (const url of blobUrlsToRevokeRef.current) {
        URL.revokeObjectURL(url);
      }
      blobUrlsToRevokeRef.current.clear();
      if (referenceVideoBlobRef.current) {
        URL.revokeObjectURL(referenceVideoBlobRef.current);
      }
    };
  }, []);

  const {
    tasks,
    isGenerating,
    activeTaskId,
    createTask,
    clearCompletedTasks,
    initialize,
  } = useVideoTaskManager();

  const [selectedVideoModel, setSelectedVideoModel] = useModelSelection("video");

  useEffect(() => {
    initialize();
  }, [initialize]);

  const currentTask = activeTaskId
    ? tasks.find((t) => t.taskId === activeTaskId)
    : null;

  const { cachedVideoUrl, cachedVideoUrlTaskId } = useVideoCacheEffect(currentTask, blobUrlsToRevokeRef, dispatch);

  const effectiveVideoUrl = useMemo(() => {
    if (currentTask?.status !== "completed") return null;
    if (cachedVideoUrl && cachedVideoUrlTaskId === currentTask?.taskId) {
      return cachedVideoUrl;
    }
    return currentTask?.videoUrl || null;
  }, [currentTask?.status, currentTask?.videoUrl, currentTask?.taskId, cachedVideoUrl, cachedVideoUrlTaskId]);

  const {
    toggleCharacter,
    toggleScene,
    getSelectedCharacterObjects,
    getSelectedSceneObject,
  } = useSelectionHelpers(state, characters, scenes, dispatch);

  const { handleGenerate, handleRetry } = useGenerateActions(
    {
      promptText: state.promptText,
      duration: state.duration,
      selectedResolution: state.selectedResolution,
      selectedStyle: state.selectedStyle,
      referenceImage: state.referenceImage,
      enableSmartOptimization: state.enableSmartOptimization,
      negativePrompt: state.negativePrompt,
      referenceVideoFile: state.referenceVideoFile,
      selectedCharacters: state.selectedCharacters,
      selectedScene: state.selectedScene,
    },
    {
      showError,
      showWarning,
      showSuccess,
      selectedVideoModel,
      getSelectedCharacterObjects,
      getSelectedSceneObject,
      createTask,
      dispatch,
    },
  );

  const handleDownload = useCallback(
    (videoUrl: string | undefined, filename: string) =>
      videoUrl ? downloadVideoFile(videoUrl, filename) : Promise.resolve(),
    [],
  );

  const saveToAssets = useSaveToAssets(createMediaAssetMutation, showSuccess, showError, dispatch);
  const handleSaveToAssets = useCallback(
    (task: VideoTask) => saveToAssets({
      task, isSavingToAssets: state.isSavingToAssets,
      promptText: state.promptText, selectedStyle: state.selectedStyle, duration: state.duration,
    }),
    [saveToAssets, state.isSavingToAssets, state.promptText, state.selectedStyle, state.duration],
  );
  const handleApplyTemplate = useApplyTemplate(showSuccess, dispatch);
  const { handleUploadReferenceVideo, handleRemoveReferenceVideo } = useReferenceVideoHandlers(state, referenceVideoBlobRef, dispatch, showSuccess);

  const quickExamples = useMemo(() => QUICK_EXAMPLES, []);


  return {
    promptText: state.promptText,
    setPromptText: (value: string) => dispatch({ type: "SET_PROMPT_TEXT", value }),
    duration: state.duration,
    setDuration: (value: number) => dispatch({ type: "SET_DURATION", value }),
    selectedStyle: state.selectedStyle,
    setSelectedStyle: (value: string) => dispatch({ type: "SET_SELECTED_STYLE", value }),
    selectedResolution: state.selectedResolution,
    setSelectedResolution: (value: string) => dispatch({ type: "SET_SELECTED_RESOLUTION", value }),
    selectedCharacters: state.selectedCharacters,
    toggleCharacter,
    selectedScene: state.selectedScene,
    toggleScene,
    showAdvanced: state.showAdvanced,
    setShowAdvanced: (value: boolean) => dispatch({ type: "SET_SHOW_ADVANCED", value }),
    enableSmartOptimization: state.enableSmartOptimization,
    setEnableSmartOptimization: (value: boolean) => dispatch({ type: "SET_ENABLE_SMART_OPTIMIZATION", value }),
    negativePrompt: state.negativePrompt,
    setNegativePrompt: (value: string) => dispatch({ type: "SET_NEGATIVE_PROMPT", value }),
    seed: state.seed,
    setSeed: (value: string) => dispatch({ type: "SET_SEED", value }),
    cfgScale: state.cfgScale,
    setCfgScale: (value: number) => dispatch({ type: "SET_CFG_SCALE", value }),
    referenceImage: state.referenceImage,
    setReferenceImage: (value: string | null) => dispatch({ type: "SET_REFERENCE_IMAGE", value }),
    referenceVideo: state.referenceVideo,
    referenceVideoName: state.referenceVideoName,
    handleUploadReferenceVideo,
    handleRemoveReferenceVideo,
    isGenerating,
    handleGenerate,
    generatedPrompt: state.generatedPrompt,
    templateDialogOpen: state.templateDialogOpen,
    setTemplateDialogOpen: (value: boolean) => dispatch({ type: "SET_TEMPLATE_DIALOG_OPEN", value }),
    handleApplyTemplate,
    characters,
    charactersLoading,
    scenes,
    scenesLoading,
    guardedPush,
    selectedVideoModel,
    setSelectedVideoModel,
    currentTask,
    effectiveVideoUrl,
    tasks,
    activeTaskId,
    handleDownload,
    handleSaveToAssets,
    handleRetry,
    clearCompletedTasks,
    getSelectedCharacterObjects,
    quickExamples,
  };
}
