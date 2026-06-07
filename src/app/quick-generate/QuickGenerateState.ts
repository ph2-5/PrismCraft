import { useReducer, useEffect, useCallback, useMemo, useRef } from "react";
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

export interface QuickGenerateState {
  promptText: string;
  duration: number;
  selectedStyle: string;
  selectedResolution: string;
  selectedCharacters: string[];
  selectedScene: string | null;
  showAdvanced: boolean;
  enableSmartOptimization: boolean;
  negativePrompt: string;
  seed: string;
  cfgScale: number;
  referenceImage: string | null;
  referenceVideo: string | null;
  referenceVideoFile: File | null;
  referenceVideoName: string | null;
  generatedPrompt: string | null;
  templateDialogOpen: boolean;
  cachedVideoUrl: string | null;
  cachedVideoUrlTaskId: string | null;
  isSavingToAssets: boolean;
}

export type QuickGenerateAction =
  | { type: "SET_PROMPT_TEXT"; value: string }
  | { type: "SET_DURATION"; value: number }
  | { type: "SET_SELECTED_STYLE"; value: string }
  | { type: "SET_SELECTED_RESOLUTION"; value: string }
  | { type: "TOGGLE_CHARACTER"; charId: string }
  | { type: "TOGGLE_SCENE"; sceneId: string }
  | { type: "SET_SHOW_ADVANCED"; value: boolean }
  | { type: "SET_ENABLE_SMART_OPTIMIZATION"; value: boolean }
  | { type: "SET_NEGATIVE_PROMPT"; value: string }
  | { type: "SET_SEED"; value: string }
  | { type: "SET_CFG_SCALE"; value: number }
  | { type: "SET_REFERENCE_IMAGE"; value: string | null }
  | { type: "UPLOAD_REFERENCE_VIDEO"; blobUrl: string; file: File; name: string }
  | { type: "REMOVE_REFERENCE_VIDEO" }
  | { type: "SET_GENERATED_PROMPT"; value: string | null }
  | { type: "SET_TEMPLATE_DIALOG_OPEN"; value: boolean }
  | { type: "SET_CACHED_VIDEO_URL"; url: string | null; taskId: string | null }
  | { type: "SET_IS_SAVING_TO_ASSETS"; value: boolean }
  | { type: "APPLY_TEMPLATE"; prompt: string; duration: number; style: string };

const initialState: QuickGenerateState = {
  promptText: "",
  duration: 5,
  selectedStyle: t("quickGenerate.defaultStyle"),
  selectedResolution: "1920x1080",
  selectedCharacters: [],
  selectedScene: null,
  showAdvanced: false,
  enableSmartOptimization: true,
  negativePrompt: "",
  seed: "",
  cfgScale: 7,
  referenceImage: null,
  referenceVideo: null,
  referenceVideoFile: null,
  referenceVideoName: null,
  generatedPrompt: null,
  templateDialogOpen: false,
  cachedVideoUrl: null,
  cachedVideoUrlTaskId: null,
  isSavingToAssets: false,
};

export function quickGenerateReducer(state: QuickGenerateState, action: QuickGenerateAction): QuickGenerateState {
  switch (action.type) {
    case "SET_PROMPT_TEXT":
      return { ...state, promptText: action.value };
    case "SET_DURATION":
      return { ...state, duration: action.value };
    case "SET_SELECTED_STYLE":
      return { ...state, selectedStyle: action.value };
    case "SET_SELECTED_RESOLUTION":
      return { ...state, selectedResolution: action.value };
    case "TOGGLE_CHARACTER":
      return {
        ...state,
        selectedCharacters: state.selectedCharacters.includes(action.charId)
          ? state.selectedCharacters.filter((id) => id !== action.charId)
          : [...state.selectedCharacters, action.charId],
      };
    case "TOGGLE_SCENE":
      return {
        ...state,
        selectedScene: state.selectedScene === action.sceneId ? null : action.sceneId,
      };
    case "SET_SHOW_ADVANCED":
      return { ...state, showAdvanced: action.value };
    case "SET_ENABLE_SMART_OPTIMIZATION":
      return { ...state, enableSmartOptimization: action.value };
    case "SET_NEGATIVE_PROMPT":
      return { ...state, negativePrompt: action.value };
    case "SET_SEED":
      return { ...state, seed: action.value };
    case "SET_CFG_SCALE":
      return { ...state, cfgScale: action.value };
    case "SET_REFERENCE_IMAGE":
      return { ...state, referenceImage: action.value };
    case "UPLOAD_REFERENCE_VIDEO":
      return {
        ...state,
        referenceVideo: action.blobUrl,
        referenceVideoFile: action.file,
        referenceVideoName: action.name,
      };
    case "REMOVE_REFERENCE_VIDEO":
      return {
        ...state,
        referenceVideo: null,
        referenceVideoFile: null,
        referenceVideoName: null,
      };
    case "SET_GENERATED_PROMPT":
      return { ...state, generatedPrompt: action.value };
    case "SET_TEMPLATE_DIALOG_OPEN":
      return { ...state, templateDialogOpen: action.value };
    case "SET_CACHED_VIDEO_URL":
      return {
        ...state,
        cachedVideoUrl: action.url,
        cachedVideoUrlTaskId: action.taskId,
      };
    case "SET_IS_SAVING_TO_ASSETS":
      return { ...state, isSavingToAssets: action.value };
    case "APPLY_TEMPLATE":
      return {
        ...state,
        promptText: action.prompt,
        duration: action.duration,
        selectedStyle: action.style,
        templateDialogOpen: false,
      };
    default:
      return state;
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

  useEffect(() => {
    return () => {
      for (const url of blobUrlsToRevokeRef.current) {
        URL.revokeObjectURL(url);
      }
      blobUrlsToRevokeRef.current.clear();
    };
  }, []);

  useEffect(() => {
    return () => {
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
            dispatch({ type: "SET_CACHED_VIDEO_URL", url, taskId });
          }
        },
      ).catch((e) => {
        errorLogger.warn("[QuickGenerate] 获取视频缓存URL失败:", e);
      });
      return () => {
        cancelled = true;
      };
    }
  }, [currentTask?.videoUrl, currentTask?.taskId, currentTask?.status]);

  const effectiveVideoUrl = useMemo(() => {
    if (currentTask?.status !== "completed") return null;
    if (state.cachedVideoUrl && state.cachedVideoUrlTaskId === currentTask?.taskId) {
      return state.cachedVideoUrl;
    }
    return currentTask?.videoUrl || null;
  }, [currentTask?.status, currentTask?.videoUrl, currentTask?.taskId, state.cachedVideoUrl, state.cachedVideoUrlTaskId]);

  const toggleCharacter = (charId: string) => {
    dispatch({ type: "TOGGLE_CHARACTER", charId });
  };

  const toggleScene = (sceneId: string) => {
    dispatch({ type: "TOGGLE_SCENE", sceneId });
  };

  const getSelectedCharacterObjects = useCallback(() => {
    return characters.filter((c) => state.selectedCharacters.includes(c.id));
  }, [characters, state.selectedCharacters]);

  const getSelectedSceneObject = useCallback(() => {
    return scenes.find((s) => s.id === state.selectedScene) || null;
  }, [scenes, state.selectedScene]);

  const handleGenerate = useCallback(async (promptOverride?: string) => {
    const effectivePrompt = promptOverride ?? state.promptText;
    if (!effectivePrompt.trim()) {
      showError(t("video.enterDescription"));
      return;
    }
    if (!selectedVideoModel?.providerId || !selectedVideoModel?.modelId) {
      showError(t("video.selectModel"), t("video.selectModelHint"));
      return;
    }

    try {
      const selectedCharObjs = getSelectedCharacterObjects();
      const selectedSceneObj = getSelectedSceneObject();

      const prompt = generateQuickModeVideoPrompt({
        prompt: effectivePrompt,
        duration: state.duration,
        resolution: state.selectedResolution,
        style: state.selectedStyle,
        characters: selectedCharObjs,
        scene: selectedSceneObj || undefined,
        referenceImage: state.referenceImage || undefined,
        enableSmartOptimization: state.enableSmartOptimization,
        negativePrompt: state.negativePrompt || undefined,
      });

      dispatch({ type: "SET_GENERATED_PROMPT", value: prompt });

      const imageUrl =
        state.referenceImage ||
        selectedSceneObj?.generatedImage ||
        (selectedCharObjs.length > 0
          ? selectedCharObjs[0]!.generatedImage
          : undefined);

      let referenceVideoBase64: string | null = null;
      if (state.referenceVideoFile) {
        const MAX_VIDEO_SIZE = 50 * 1024 * 1024;
        if (state.referenceVideoFile.size > MAX_VIDEO_SIZE) {
          showError(t("error.fileTooLarge"), t("video.refVideoSizeLimit"));
          return;
        }
        referenceVideoBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(state.referenceVideoFile!);
        });
      }

      const task = await createTask(prompt, undefined, {
        fixedImageUrl: imageUrl,
        fixedImageLockType: selectedSceneObj ? "scene" : "character",
        referenceVideo: referenceVideoBase64,
        providerId: selectedVideoModel.providerId,
        modelId: selectedVideoModel.modelId,
        format: selectedVideoModel.format,
      });

      if (task?.promptWasTruncated) {
        showWarning(t("task.promptTooLong"), t("task.promptTruncated"));
      }

      showSuccess(t("video.startGeneration"));
    } catch (error) {
      errorLogger.error("生成失败:", error);
      showError(t("video.generateFailed"), mapUserFacingError(error));
    }
  }, [state.promptText, state.duration, state.selectedResolution, state.selectedStyle, state.selectedCharacters, state.referenceImage, state.enableSmartOptimization, state.negativePrompt, state.referenceVideoFile, selectedVideoModel, getSelectedCharacterObjects, getSelectedSceneObject, createTask, showError, showWarning, showSuccess]);

  const handleDownload = async (
    videoUrl: string | undefined,
    filename: string,
  ) => {
    if (!videoUrl) return;
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
      setTimeout(() => URL.revokeObjectURL(url), 5000);
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
  };

  const handleSaveToAssets = async (task: VideoTask) => {
    if (!task.videoUrl || state.isSavingToAssets) return;

    dispatch({ type: "SET_IS_SAVING_TO_ASSETS", value: true });
    try {
      await createMediaAssetMutation.mutateAsync({
        name: t("quickGenerate.assetName", { prompt: state.promptText.slice(0, 20) }),
        description: state.promptText,
        type: "video",
        url: task.videoUrl,
        tags: [state.selectedStyle, t("quickGenerate.secondsTag", { count: state.duration })],
        duration: state.duration,
      });
      showSuccess(t("video.savedToLibrary"));
    } catch (_error) {
      showError(t("error.saveFailed"), mapUserFacingError(_error));
    } finally {
      dispatch({ type: "SET_IS_SAVING_TO_ASSETS", value: false });
    }
  };

  const handleApplyTemplate = useCallback(
    (template: VideoTemplate) => {
      const {
        prompt,
        duration: templateDuration,
        style,
      } = applyVideoTemplate(template);
      dispatch({ type: "APPLY_TEMPLATE", prompt, duration: templateDuration, style });
      showSuccess(t("quickGenerate.templateApplied"), t("quickGenerate.templateAppliedDesc", { name: template.name }));
    },
    [showSuccess],
  );

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
    [showSuccess, state.referenceVideo],
  );

  const handleRemoveReferenceVideo = useCallback(() => {
    if (state.referenceVideo && state.referenceVideo.startsWith("blob:")) {
      URL.revokeObjectURL(state.referenceVideo);
    }
    referenceVideoBlobRef.current = null;
    dispatch({ type: "REMOVE_REFERENCE_VIDEO" });
  }, [state.referenceVideo]);

  const handleRetry = useCallback(
    (task: VideoTask) => {
      if (task.prompt) {
        dispatch({ type: "SET_PROMPT_TEXT", value: task.prompt });
      }
      handleGenerate(task.prompt);
    },
    [handleGenerate],
  );

  const quickExamples = useMemo(() => [
    t("quickGenerate.example1"),
    t("quickGenerate.example2"),
    t("quickGenerate.example3"),
  ], []);

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
