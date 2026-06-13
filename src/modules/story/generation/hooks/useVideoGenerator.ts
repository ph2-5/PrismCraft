import { useState, useCallback } from "react";
import { generateSingleBeatPrompt } from "@/modules/prompt";
import type { Story, StoryBeat, Character, Scene, StoryStyleGuide, VideoTask, ModelSelection } from "@/domain/schemas";
import { getFirstFrameUrl, getLastFrameUrl } from "@/domain/utils";
import { container } from "@/infrastructure/di";
import { StoryGenerationService } from "@/domain/services";
import { useAIGeneratorBase } from "./useAIGeneratorBase";
import { determineVideoGenerationMode, type VideoGenerationMode } from "../services/storyboard-generation-service";
import { getVideoGenerationStrategy } from "@/shared/model-capabilities";
import { t } from "@/shared/constants";

interface UseVideoGeneratorProps {
  beatsRef: React.MutableRefObject<StoryBeat[]>;
  charactersRef: React.MutableRefObject<Character[]>;
  scenesRef: React.MutableRefObject<Scene[]>;
  styleGuideRef?: React.MutableRefObject<StoryStyleGuide | undefined>;
  currentStory: Story;
  selectedVideoModel: ModelSelection | null;
  createTask: (
    prompt: string,
    _deprecated?: undefined,
    extraOptions?: {
      duration?: number;
      beatId?: string;
      storyId?: string;
      storyTitle?: string;
      beatTitle?: string;
      firstFrameUrl?: string;
      fixedImageUrl?: string;
      fixedImageLockType?: "character" | "scene";
      lastFrameUrl?: string;
      providerId?: string;
      modelId?: string;
      format?: string;
      characterRef?: string;
      characterRefs?: string[];
      sceneRef?: string;
      referenceVideo?: string | null;
    },
  ) => Promise<(VideoTask & { promptWasTruncated?: boolean }) | null>;
  success: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;
  showWarning?: (title: string, description?: string) => void;
}

export function useVideoGenerator(props: UseVideoGeneratorProps) {
  const {
    beatsRef,
    charactersRef,
    scenesRef,
    currentStory,
    selectedVideoModel,
    createTask,
    success,
    showError,
    showWarning,
  } = props;

  const [generatingVideo, setGeneratingVideo] = useState<string | null>(null);

  const {
    findBeat,
    resolvePrevBeat,
    checkModelConfig,
    withGenerationState,
  } = useAIGeneratorBase({ ...props, setGenerating: setGeneratingVideo });

  const generateVideoNew = useCallback(
    async (beatId: string, prevBeatOverride?: StoryBeat | null) => {
      const beat = findBeat(beatId);
      const generatedFirstFrameUrl = getFirstFrameUrl(beat?.framePair);
      const uploadedFirstFrameUrl = beat?.uploadedFramePair?.firstFrame;
      const firstFrameUrl = generatedFirstFrameUrl || uploadedFirstFrameUrl;
      if (!beat || !firstFrameUrl) {
        showError(t("story.cannotGenerateVideo"));
        return;
      }
      if (
        !checkModelConfig(
          selectedVideoModel,
          t("story.videoGenFailed"),
          t("story.selectVideoModel"),
        )
      ) {
        return;
      }
      return withGenerationState(beatId, async (signal) => {
        const prevBeat = resolvePrevBeat(beatId, prevBeatOverride);
        const elements = await container.elementStorage.getAllElements();
        const { characterRefs, sceneRef, prevVideoUrl } = StoryGenerationService.resolveGenerationContext({
          beat,
          prevBeat,
          characters: charactersRef.current,
          scenes: scenesRef.current,
          elements,
        });

        const videoMode = determineVideoGenerationMode(beat, prevBeat);
        const strategy = selectedVideoModel?.modelId
          ? getVideoGenerationStrategy(selectedVideoModel.modelId)
          : null;
        const effectiveVideoMode: VideoGenerationMode =
          videoMode === "reference_video_continuation" && !prevVideoUrl
            ? "first_frame_anchor"
            : videoMode;
        const referenceVideo = effectiveVideoMode === "reference_video_continuation" && prevVideoUrl && (strategy?.supportsReferenceVideo !== false)
          ? prevVideoUrl
          : null;

        const basePrompt = generateSingleBeatPrompt({
          beat,
          index: beatsRef.current.findIndex((b) => b.id === beatId),
          characters: charactersRef.current,
          scenes: scenesRef.current,
          shotInstruction: beat.shotInstruction,
          elements,
          characterOutfits: beat.characterOutfits,
        });

        const promptLanguage = strategy?.promptLanguage || "auto";
        const enhancedPrompt = StoryGenerationService.buildVideoPrompt(
          beat,
          basePrompt,
          promptLanguage,
          props.styleGuideRef?.current,
          beat.shotInstruction,
        );

        const effectiveCharacterRefs = strategy && !strategy.useCharacterRef
          ? undefined
          : (characterRefs.length > 0 ? characterRefs : undefined);
        const effectiveSceneRef = strategy && !strategy.useSceneRef
          ? undefined
          : sceneRef;

        const result = await createTask(enhancedPrompt, undefined, {
          duration: beat.duration,
          beatId,
          storyId: currentStory.id,
          storyTitle: currentStory.title || t("story.untitledStory"),
          beatTitle: beat.title || `${t("story.shotLabel")} ${beat.sequence}`,
          firstFrameUrl,
          fixedImageUrl: firstFrameUrl,
          fixedImageLockType: effectiveCharacterRefs ? "character" : "scene",
          lastFrameUrl: getLastFrameUrl(beat.framePair) || beat.uploadedFramePair?.lastFrame,
          providerId: selectedVideoModel?.providerId,
          modelId: selectedVideoModel?.modelId,
          format: selectedVideoModel?.format,
          characterRefs: effectiveCharacterRefs,
          sceneRef: effectiveSceneRef,
          referenceVideo,
        });

        if (signal.aborted) return;

        if (!result) {
          showError(t("story.videoGenFailed"));
          return;
        }

        if (result.promptWasTruncated && showWarning) {
          showWarning(t("story.promptTruncatedTitle"), t("story.promptTruncatedDesc"));
        }

        success(t("video.taskSubmitted"), t("success.videoTaskProcessing"));
      }, t("story.videoGenFailed"));
    },
    [
      beatsRef,
      charactersRef,
      scenesRef,
      currentStory,
      selectedVideoModel,
      createTask,
      success,
      showError,
      showWarning,
      findBeat,
      resolvePrevBeat,
      checkModelConfig,
      withGenerationState,
      props.styleGuideRef,
    ],
  );

  return { generateVideoNew, generatingVideo };
}
