import { useState, useCallback, useEffect, useRef } from "react";
import { container } from "@/infrastructure/di";
import { t } from "@/shared/constants";
import { generateProfessionalVideoPrompt } from "@/modules/prompt";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { useGlobalKeyboardActions } from "@/shared/hooks/use-global-keyboard-actions";
import type { PromptEditorContext } from "@/modules/story";
import { useAutoSave } from "@/modules/persistence";
import { usePreference } from "@/shared/utils/preferences";
import { errorLogger } from "@/shared/error-logger";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import { confirm } from "@/shared/utils/confirm";
import { useStory } from "../StoryProvider";

export type StoryTab =
  | "storyboard"
  | "ai-generate"
  | "preview-export"
  | "comments"
  | "audio";

interface AutoSaveSettingsData {
  enabled?: boolean;
  interval?: number;
}

function useAutoSaveSettings() {
  const [settings] = usePreference<AutoSaveSettingsData>("ai-animation-autosave-settings", {});
  const enabled = typeof settings.enabled === "boolean" ? settings.enabled : true;
  const intervalMinutes = typeof settings.interval === "number" && settings.interval > 0 ? settings.interval : 5;
  return { enabled, intervalMinutes };
}

const PROMPT_FIELD_MAP: Record<Exclude<PromptEditorContext, "video">, "imageGenerationPrompt" | "firstFramePrompt" | "lastFramePrompt"> = {
  keyframe: "imageGenerationPrompt",
  firstFrame: "firstFramePrompt",
  lastFrame: "lastFramePrompt",
};

export function useStoryPage() {
  const story = useStory();
  const { success, error: showError, warning: showWarning } = useToastHelpers();
  const autoSaveSettings = useAutoSaveSettings();

  const handleSaveRef = useRef(story.handleSave);
  useEffect(() => {
    handleSaveRef.current = story.handleSave;
  }, [story.handleSave]);

  useGlobalKeyboardActions({
    onSave: () => handleSaveRef.current(),
  });

  useAutoSave({
    enabled: autoSaveSettings.enabled && story.hasUnsavedChanges,
    intervalMinutes: autoSaveSettings.intervalMinutes,
    onSave: () => story.handleSave(),
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const isGeneratingRef = useRef(false);
  const [generatedVideo, setGeneratedVideo] = useState<string | null>(null);
  const [showSwitchConfirmDialog, setShowSwitchConfirmDialog] = useState(false);
  const [pendingSwitchStory, setPendingSwitchStory] = useState<(typeof story.stories)[number] | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");

  // ── UI 状态:当前激活的 Tab ──
  const [activeTab, setActiveTab] = useState<StoryTab>("storyboard");

  const generateVideo = useCallback(async () => {
    if (isGeneratingRef.current) return;
    if (
      !story.selectedVideoModel?.providerId ||
      !story.selectedVideoModel?.modelId
    ) {
      story.showError(t("story.cannotGenerateVideo"), t("story.selectVideoModel"));
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

      const videoOptions: {
        duration: number;
        providerId?: string;
        modelId?: string;
      } = {
        duration: Math.min(story.currentStory.targetDuration || 5, 12),
      };
      if (story.selectedVideoModel) {
        videoOptions.providerId = story.selectedVideoModel.providerId;
        videoOptions.modelId = story.selectedVideoModel.modelId;
      }
      const apiGenerateVideo = container.videoProvider.generateVideo;
      const result = await apiGenerateVideo(prompt, videoOptions);
      if (result.success && result.data?.taskId) {
        story.addTask({
          taskId: result.data.taskId,
          status: "pending",
          message: t("story.videoTaskSubmitted"),
          providerId: result.data.providerId,
          providerModelId: result.data.providerModelId,
          providerFormat: result.data.providerFormat,
        });
        success(t("video.taskSubmittedTitle"), t("video.taskSubmittedProcessing"));
      } else if (result.success && result.data?.videoUrl) {
        setGeneratedVideo(result.data.videoUrl);
        success(t("video.videoGenerated"), t("success.generated"));
      } else {
        throw new Error(result.error || t("story.videoGenerationFailed"));
      }
    } catch (err) {
      errorLogger.error("[Story] 视频生成失败", err instanceof Error ? err : undefined);
      showError(t("video.generateFailed"), mapUserFacingError(err));
    } finally {
      setIsGenerating(false);
      isGeneratingRef.current = false;
    }
  }, [story, success, showError]);

  const switchStory = (s: (typeof story.stories)[number]) => {
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

  const performSwitchStory = async (s: (typeof story.stories)[number]) => {
    await story.switchToStory(s.id);
    setShowSwitchConfirmDialog(false);
    setPendingSwitchStory(null);
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
          prev.map((b) => ({
            ...b,
            enhancedGeneration: enabled,
          })),
        );
      }
    }
  };

  const handleDeleteDialogOpenChange = (open: boolean) => {
    story.setDeleteDialogOpen(open);
    if (!open) setDeleteConfirmInput("");
  };

  const handleDeleteCancel = () => {
    story.setDeleteDialogOpen(false);
    setDeleteConfirmInput("");
  };

  const handleSwitchConfirmOpenChange = (open: boolean) => {
    setShowSwitchConfirmDialog(open);
    if (!open) {
      setPendingSwitchStory(null);
    }
  };

  const handleSwitchWithoutSave = () => {
    if (pendingSwitchStory) {
      void performSwitchStory(pendingSwitchStory);
    }
  };

  return {
    // Story data
    story,
    // Video generation
    isGenerating,
    generatedVideo,
    generateVideo,
    // Switch story
    showSwitchConfirmDialog,
    pendingSwitchStory,
    switchStory,
    handleSaveAndSwitch,
    handleSwitchConfirmOpenChange,
    handleSwitchWithoutSave,
    // Delete confirmation
    deleteConfirmInput,
    setDeleteConfirmInput,
    handleDeleteDialogOpenChange,
    handleDeleteCancel,
    // Prompt change
    handlePromptChange,
    // Generation enhanced toggle
    handleToggleGenerationEnhanced,
    // UI 状态
    activeTab,
    setActiveTab,
  };
}
