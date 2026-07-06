import { useCallback, useEffect, useRef, useState } from "react";
import { container } from "@/infrastructure/di";
import { t } from "@/shared/constants";
import { generateProfessionalVideoPrompt } from "@/modules/prompt";
import { useVideoTaskManager } from "@/modules/video";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { useAutoSave } from "@/modules/persistence";
import { usePreference } from "@/shared/utils/preferences";
import { errorLogger } from "@/shared/error-logger";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import { confirm } from "@/shared/utils/confirm";
import { useGlobalKeyboardActions } from "@/shared/hooks/use-global-keyboard-actions";
import type { PromptEditorContext } from "@/modules/story";
import type { useStory } from "../StoryProvider";

type StoryShape = ReturnType<typeof useStory>;

interface AutoSaveSettingsData {
  enabled?: boolean;
  interval?: number;
}

export function useAutoSaveSettings() {
  const [settings] = usePreference<AutoSaveSettingsData>("ai-animation-autosave-settings", {});
  const enabled = typeof settings.enabled === "boolean" ? settings.enabled : true;
  const intervalMinutes = typeof settings.interval === "number" && settings.interval > 0 ? settings.interval : 5;
  return { enabled, intervalMinutes };
}

export const PROMPT_FIELD_MAP: Record<
  Exclude<PromptEditorContext, "video">,
  "imageGenerationPrompt" | "firstFramePrompt" | "lastFramePrompt"
> = {
  keyframe: "imageGenerationPrompt",
  firstFrame: "firstFramePrompt",
  lastFrame: "lastFramePrompt",
};

export function useStoryKeyboardSave(story: StoryShape) {
  const handleSaveRef = useRef(story.handleSave);
  useEffect(() => {
    handleSaveRef.current = story.handleSave;
  }, [story.handleSave]);
  useGlobalKeyboardActions({
    onSave: () => handleSaveRef.current(),
  });
}

export function useStoryAutoSave(story: StoryShape) {
  const { enabled, intervalMinutes } = useAutoSaveSettings();
  useAutoSave({
    enabled: enabled && story.hasUnsavedChanges,
    intervalMinutes,
    onSave: () => story.handleSave(),
  });
}

interface VideoGenState {
  isGenerating: boolean;
  generatedVideo: string | null;
  generateVideo: () => Promise<void>;
}

function buildVideoOptions(story: StoryShape): {
  duration: number;
  providerId?: string;
  modelId?: string;
} {
  const opts: { duration: number; providerId?: string; modelId?: string } = {
    duration: Math.min(story.currentStory.targetDuration || 5, 12),
  };
  if (story.selectedVideoModel) {
    opts.providerId = story.selectedVideoModel.providerId;
    opts.modelId = story.selectedVideoModel.modelId;
  }
  return opts;
}

function handleVideoGenerateResult(
  result: Awaited<ReturnType<typeof container.videoProvider.generateVideo>>,
  addTask: ReturnType<typeof useVideoTaskManager>["addTask"],
  success: (title: string, desc?: string) => void,
  setGeneratedVideo: (url: string | null) => void,
): void {
  if (result.success && result.data?.taskId) {
    addTask({
      taskId: result.data.taskId,
      status: "pending",
      message: t("story.videoTaskSubmitted"),
      providerId: result.data.providerId,
      providerModelId: result.data.providerModelId,
      providerFormat: result.data.providerFormat,
    });
    success(t("video.taskSubmittedTitle"), t("video.taskSubmittedProcessing"));
    return;
  }
  if (result.success && result.data?.videoUrl) {
    setGeneratedVideo(result.data.videoUrl);
    success(t("video.videoGenerated"), t("success.generated"));
    return;
  }
  throw new Error(result.error || t("story.videoGenerationFailed"));
}

export function useStoryVideoGeneration(
  story: StoryShape,
): VideoGenState {
  const { success, error: showError } = useToastHelpers();
  const { addTask } = useVideoTaskManager();
  const [isGenerating, setIsGenerating] = useState(false);
  const isGeneratingRef = useRef(false);
  const [generatedVideo, setGeneratedVideo] = useState<string | null>(null);

  const generateVideo = useCallback(async () => {
    if (isGeneratingRef.current) return;
    if (!story.selectedVideoModel?.providerId || !story.selectedVideoModel?.modelId) {
      showError(t("story.cannotGenerateVideo"), t("story.selectVideoModel"));
      return;
    }
    isGeneratingRef.current = true;
    setIsGenerating(true);
    try {
      const prompt = generateProfessionalVideoPrompt({
        story: {
          title: story.currentStory.title || t("story.unnamed"),
          description: story.currentStory.description || t("story.noDescription"),
          genre: story.currentStory.genre || "drama",
          tone: story.currentStory.tone || "neutral",
          targetDuration: story.currentStory.targetDuration || 60,
        },
        beats: story.beats,
        characters: story.charactersRef.current,
        scenes: story.scenesRef.current,
      });
      const videoOptions = buildVideoOptions(story);
      const apiGenerateVideo = container.videoProvider.generateVideo;
      const result = await apiGenerateVideo(prompt, videoOptions);
      handleVideoGenerateResult(result, addTask, success, setGeneratedVideo);
    } catch (err) {
      errorLogger.error("[Story] 视频生成失败", err instanceof Error ? err : undefined);
      showError(t("video.generateFailed"), mapUserFacingError(err));
    } finally {
      setIsGenerating(false);
      isGeneratingRef.current = false;
    }
  }, [story, success, showError, addTask]);

  return { isGenerating, generatedVideo, generateVideo };
}

interface StorySwitchState {
  showSwitchConfirmDialog: boolean;
  pendingSwitchStory: StoryShape["stories"][number] | null;
  switchStory: (s: StoryShape["stories"][number]) => void;
  handleSaveAndSwitch: () => Promise<void>;
  handleSwitchConfirmOpenChange: (open: boolean) => void;
  handleSwitchWithoutSave: () => void;
}

export function useStorySwitching(
  story: StoryShape,
  success: (title: string, desc?: string) => void,
  showError: (title: string, desc?: string) => void,
): StorySwitchState {
  const { warning: showWarning } = useToastHelpers();
  const [showSwitchConfirmDialog, setShowSwitchConfirmDialog] = useState(false);
  const [pendingSwitchStory, setPendingSwitchStory] = useState<StoryShape["stories"][number] | null>(null);

  const performSwitchStory = async (s: StoryShape["stories"][number]) => {
    await story.switchToStory(s.id);
    setShowSwitchConfirmDialog(false);
    setPendingSwitchStory(null);
  };

  const switchStory = (s: StoryShape["stories"][number]) => {
    if (story.isVideoUrlPersisting) {
      showWarning(t("story.pleaseWait"), t("story.videoUrlSaving"));
      return;
    }
    if (story.hasUnsavedChanges && story.beats.length > 0) {
      setPendingSwitchStory(s);
      setShowSwitchConfirmDialog(true);
      return;
    }
    void performSwitchStory(s);
  };

  const handleSaveAndSwitch = async () => {
    if (!pendingSwitchStory) return;
    try {
      await story.handleSave();
      await performSwitchStory(pendingSwitchStory);
      success(t("success.savedAndSwitched"), t("success.currentChangesSaved"));
    } catch (error) {
      errorLogger.error("[Story] 保存并切换失败", error instanceof Error ? error : undefined);
      showError(t("error.saveFailed"), mapUserFacingError(error));
    }
  };

  const handleSwitchConfirmOpenChange = (open: boolean) => {
    setShowSwitchConfirmDialog(open);
    if (!open) setPendingSwitchStory(null);
  };

  const handleSwitchWithoutSave = () => {
    if (pendingSwitchStory) void performSwitchStory(pendingSwitchStory);
  };

  return {
    showSwitchConfirmDialog,
    pendingSwitchStory,
    switchStory,
    handleSaveAndSwitch,
    handleSwitchConfirmOpenChange,
    handleSwitchWithoutSave,
  };
}

interface DeleteConfirmState {
  deleteConfirmInput: string;
  setDeleteConfirmInput: (value: string) => void;
  handleDeleteDialogOpenChange: (open: boolean) => void;
  handleDeleteCancel: () => void;
}

export function useDeleteConfirm(story: StoryShape): DeleteConfirmState {
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const handleDeleteDialogOpenChange = (open: boolean) => {
    story.setDeleteDialogOpen(open);
    if (!open) setDeleteConfirmInput("");
  };
  const handleDeleteCancel = () => {
    story.setDeleteDialogOpen(false);
    setDeleteConfirmInput("");
  };
  return { deleteConfirmInput, setDeleteConfirmInput, handleDeleteDialogOpenChange, handleDeleteCancel };
}

interface PromptChangeHandlers {
  handlePromptChange: (beatId: string, context: PromptEditorContext, prompt: string) => void;
  handleToggleGenerationEnhanced: (enabled: boolean) => Promise<void>;
}

export function usePromptChangeHandlers(story: StoryShape): PromptChangeHandlers {
  const { updateBeat } = story;
  const handlePromptChange = useCallback(
    (beatId: string, context: PromptEditorContext, prompt: string) => {
      if (context === "video") {
        const beat = story.beats.find((b) => b.id === beatId);
        updateBeat(beatId, {
          videoGen: { ...(beat?.videoGen ?? {}), prompt },
        });
        return;
      }
      updateBeat(beatId, { [PROMPT_FIELD_MAP[context]]: prompt });
    },
    [updateBeat, story.beats],
  );

  const handleToggleGenerationEnhanced = async (enabled: boolean) => {
    story.setGenerationEnhanced(enabled);
    if (story.beats.length > 0) {
      const confirmed = await confirm(
        t("story.applyToAllConfirmMsg", { count: story.beats.length }),
        t("story.applyToAllBeats"),
      );
      if (confirmed) {
        story.setBeats((prev) =>
          prev.map((b) => ({ ...b, enhancedGeneration: enabled })),
        );
      }
    }
  };

  return { handlePromptChange, handleToggleGenerationEnhanced };
}
