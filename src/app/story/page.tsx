"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Trash2 } from "lucide-react";
import { container } from "@/infrastructure/di";
import { t } from "@/shared/constants";
import { generateProfessionalVideoPrompt } from "@/modules/prompt";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { useGlobalKeyboardActions } from "@/shared/hooks/use-global-keyboard-actions";
import { ProfessionalModeEditor } from "@/modules/story";
import type { PromptEditorContext } from "@/modules/story";
import { VersionDialog } from "@/modules/story";
import { TemplateManagerDialog } from "@/modules/story";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { useAutoSave } from "@/modules/persistence";
import { preferencesStorage } from "@/shared/utils/preferences";
import { errorLogger } from "@/shared/error-logger";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import { confirm } from "@/shared/utils/confirm";
import { StoryProvider, useStory } from "./StoryProvider";
import { StoryHeader } from "./StoryHeader";
import { VideoGeneratorToolbar, VideoGeneratorPanel } from "./VideoGeneratorSection";
import { SwitchConfirmDialog } from "./SwitchConfirmDialog";

function useAutoSaveSettings() {
  const [enabled, _setEnabled] = useState(() => {
    try {
      const parsed = preferencesStorage.get<{ enabled?: boolean }>("ai-animation-autosave-settings", {});
      return typeof parsed.enabled === "boolean" ? parsed.enabled : true;
    } catch (err) {
      errorLogger.error("[Story] 读取自动保存设置失败", err instanceof Error ? err : undefined);
      return true;
    }
  });
  const [intervalMinutes, _setIntervalMinutes] = useState(() => {
    try {
      const parsed = preferencesStorage.get<{ interval?: number }>("ai-animation-autosave-settings", {});
      return typeof parsed.interval === "number" && parsed.interval > 0 ? parsed.interval : 5;
    } catch (err) {
      errorLogger.error("[Story] 读取自动保存间隔设置失败", err instanceof Error ? err : undefined);
      return 5;
    }
  });

  return { enabled, intervalMinutes };
}

const PROMPT_FIELD_MAP: Record<PromptEditorContext, "imageGenerationPrompt" | "firstFramePrompt" | "lastFramePrompt"> = {
  keyframe: "imageGenerationPrompt",
  firstFrame: "firstFramePrompt",
  lastFrame: "lastFramePrompt",
};

function StoryPageContent() {
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
    enabled: autoSaveSettings.enabled && story.hasUnsavedChanges && story.beats.length > 0,
    intervalMinutes: autoSaveSettings.intervalMinutes,
    onSave: () => story.handleSave(),
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVideo, setGeneratedVideo] = useState<string | null>(null);
  const [showSwitchConfirmDialog, setShowSwitchConfirmDialog] = useState(false);
  const [pendingSwitchStory, setPendingSwitchStory] = useState<(typeof story.stories)[number] | null>(null);

  const generateVideo = useCallback(async () => {
    if (
      !story.selectedVideoModel?.providerId ||
      !story.selectedVideoModel?.modelId
    ) {
      story.showError(t("story.cannotGenerateVideo"), t("story.selectVideoModel"));
      return;
    }
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
      updateBeat(beatId, { [PROMPT_FIELD_MAP[context]]: prompt });
    },
    [updateBeat],
  );

  return (
    <PageErrorBoundary pageName={t("page.storyboard")}>
      <div className="h-full flex flex-col">
        <div className="shrink-0 border-b border-border bg-card px-4 py-3">
          <div className="flex items-center gap-3">
            <StoryHeader story={story} onSwitchStory={switchStory} />
            <VideoGeneratorToolbar story={story} isGenerating={isGenerating} onGenerateVideo={generateVideo} />
          </div>
        </div>

        <div className="flex-1 min-h-0">
          <ProfessionalModeEditor
            currentStory={story.currentStory}
            beats={story.beats}
            characters={story.characters}
            scenes={story.scenes}
            assets={story.assets}
            onUpdateBeat={story.updateBeat}
            onAddBeat={story.addBeat}
            onDeleteBeat={story.deleteBeat}
            onMoveBeat={story.moveBeat}
            onReorderBeats={story.setBeats}
            onPlanStoryWithAI={story.planStoryWithAI}
            onOpenTemplateDialog={() => story.setTemplateDialogOpen(true)}
            onOpenVersionDialog={() => story.setVersionDialogOpen(true)}
            isGenerating={isGenerating}
            isPlanningStory={story.isPlanningStory}
            generationEnhanced={story.generationEnhanced}
            onToggleGenerationEnhanced={async (enabled) => {
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
            }}
            onGenerateKeyframe={story.generateKeyframe}
            onGenerateFramePair={story.generateFramePair}
            onGenerateVideoNew={story.generateVideoNew}
            onRegenerateKeyframe={story.regenerateKeyframe}
            generatingKeyframe={story.generatingBeats}
            onUploadKeyframe={story.handleUploadKeyframe}
            onUploadFirstFrame={story.handleUploadFirstFrame}
            onUploadLastFrame={story.handleUploadLastFrame}
            onUploadVideo={story.handleUploadVideo}
            onBatchGenerateKeyframes={story.batchGenerateKeyframes}
            onBatchGenerateFramePairs={story.batchGenerateFramePairs}
            onBatchGenerateVideos={story.batchGenerateVideos}
            onPromptChange={handlePromptChange}
            imageProviderId={story.selectedImageModel?.providerId}
            imageModelId={story.selectedImageModel?.modelId}
            assetsLoading={story.assetsLoading}
          />
        </div>

        <VideoGeneratorPanel story={story} generatedVideo={generatedVideo} />

        <TemplateManagerDialog
          isOpen={story.templateDialogOpen}
          onClose={() => story.setTemplateDialogOpen(false)}
          currentBeats={story.beats}
          onApplyTemplate={story.applyStoryboardTemplate}
          savedTemplates={story.savedTemplates}
          onSaveTemplate={story.handleSaveTemplate}
          onDeleteTemplate={story.handleDeleteTemplate}
        />

        <VersionDialog
          open={story.versionDialogOpen}
          onOpenChange={story.setVersionDialogOpen}
          currentStory={story.currentStory}
          beats={story.beats}
          onRestoreVersion={story.handleRestoreVersion}
        />

        <Dialog
          open={story.deleteDialogOpen}
          onOpenChange={story.setDeleteDialogOpen}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="w-5 h-5" />
                {t("story.confirmDeleteProject")}
              </DialogTitle>
              <DialogDescription>
                {t("story.confirmDeleteProjectDesc")}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => story.setDeleteDialogOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button variant="destructive" onClick={story.performDeleteStory}>
                {t("story.confirmDeleteButton")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <SwitchConfirmDialog
          open={showSwitchConfirmDialog}
          onOpenChange={(open) => {
            setShowSwitchConfirmDialog(open);
            if (!open) {
              setPendingSwitchStory(null);
            }
          }}
          pendingSwitchStory={pendingSwitchStory}
          onSaveAndSwitch={handleSaveAndSwitch}
          onSwitchWithoutSave={() => pendingSwitchStory && void performSwitchStory(pendingSwitchStory)}
        />
      </div>
    </PageErrorBoundary>
  );
}

export default function StoryPage() {
  return (
    <StoryProvider>
      <StoryPageContent />
    </StoryProvider>
  );
}
