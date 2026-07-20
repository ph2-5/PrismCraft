import { useState, useCallback } from "react";
import { generateSingleBeatPrompt } from "@/modules/prompt";
import type { Story, StoryBeat, Character, Scene, StoryStyleGuide, StoryElement, VideoTask, ModelSelection } from "@/domain/schemas";
import { getFirstFrameUrl, getLastFrameUrl } from "@/domain/utils";
import { container } from "@/infrastructure/di";
import { StoryGenerationService } from "@/domain/services";
import { useAIGeneratorBase } from "./use-ai-generator-base";
import { determineVideoGenerationMode, type VideoGenerationMode } from "../services/storyboard-generation-service";
import { getEffectiveVideoParams, type EffectiveVideoParams } from "@/shared/model-capabilities";
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

function resolveEffectiveVideoParams(
  selectedVideoModel: ModelSelection | null,
  firstFrameUrl: string,
  beat: StoryBeat,
  characterRefs: string[],
  sceneRef?: string,
): EffectiveVideoParams | null {
  if (!selectedVideoModel?.modelId) return null;
  return getEffectiveVideoParams({
    modelId: selectedVideoModel.modelId,
    prompt: "",
    firstFrameUrl,
    lastFrameUrl: getLastFrameUrl(beat.framePair) || beat.uploadedFramePair?.lastFrame,
    characterRefs: characterRefs.length > 0 ? characterRefs : undefined,
    sceneRef,
  });
}

function resolveReferenceVideo(
  videoMode: VideoGenerationMode,
  prevVideoUrl: string | undefined,
  supportsReferenceVideo: boolean | undefined,
): string | null {
  const effectiveVideoMode: VideoGenerationMode =
    videoMode === "reference_video_continuation" && !prevVideoUrl
      ? "first_frame_anchor"
      : videoMode;
  if (effectiveVideoMode !== "reference_video_continuation") return null;
  if (!prevVideoUrl) return null;
  if (supportsReferenceVideo === false) return null;
  return prevVideoUrl;
}

interface BasePromptContext {
  beat: StoryBeat;
  beatId: string;
  beatsRef: React.MutableRefObject<StoryBeat[]>;
  charactersRef: React.MutableRefObject<Character[]>;
  scenesRef: React.MutableRefObject<Scene[]>;
  elements: StoryElement[];
}

function buildBasePromptForBeat({
  beat,
  beatId,
  beatsRef,
  charactersRef,
  scenesRef,
  elements,
}: BasePromptContext): string {
  const userEditedPrompt = beat.videoGen?.prompt?.trim();
  if (userEditedPrompt) return userEditedPrompt;
  return generateSingleBeatPrompt({
    beat,
    index: beatsRef.current.findIndex((b) => b.id === beatId),
    characters: charactersRef.current,
    scenes: scenesRef.current,
    shotInstruction: beat.shotInstruction,
    elements,
    characterOutfits: beat.characterOutfits,
  });
}

interface VideoTaskOptionsContext {
  beat: StoryBeat;
  beatId: string;
  currentStory: Story;
  firstFrameUrl: string;
  effectiveCharacterRefs?: string[];
  effectiveSceneRef?: string;
  effectiveLastFrameUrl?: string;
  selectedVideoModel: ModelSelection | null;
  referenceVideo: string | null;
}

function resolveFixedImageLockType(
  effectiveCharacterRefs?: string[],
  effectiveSceneRef?: string,
): "character" | "scene" | undefined {
  if (effectiveCharacterRefs) return "character";
  if (effectiveSceneRef) return "scene";
  return undefined;
}

function buildVideoTaskOptions(ctx: VideoTaskOptionsContext) {
  return {
    duration: ctx.beat.duration,
    beatId: ctx.beatId,
    storyId: ctx.currentStory.id,
    storyTitle: ctx.currentStory.title || t("story.untitledStory"),
    beatTitle: ctx.beat.title || `${t("story.shotLabel")} ${ctx.beat.sequence}`,
    firstFrameUrl: ctx.firstFrameUrl,
    fixedImageUrl: ctx.firstFrameUrl,
    fixedImageLockType: resolveFixedImageLockType(ctx.effectiveCharacterRefs, ctx.effectiveSceneRef),
    lastFrameUrl: ctx.effectiveLastFrameUrl,
    providerId: ctx.selectedVideoModel?.providerId,
    modelId: ctx.selectedVideoModel?.modelId,
    format: ctx.selectedVideoModel?.format,
    characterRefs: ctx.effectiveCharacterRefs,
    sceneRef: ctx.effectiveSceneRef,
    referenceVideo: ctx.referenceVideo,
  };
}

interface VideoTaskResultContext {
  result: (VideoTask & { promptWasTruncated?: boolean }) | null;
  signal: AbortSignal;
  success: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;
  showWarning?: (title: string, description?: string) => void;
}

function handleVideoTaskResult({
  result,
  signal,
  success,
  showError,
  showWarning,
}: VideoTaskResultContext): void {
  if (signal.aborted) return;
  if (!result) {
    showError(t("story.videoGenFailed"));
    return;
  }
  if (result.promptWasTruncated && showWarning) {
    showWarning(t("story.promptTruncatedTitle"), t("story.promptTruncatedDesc"));
  }
  success(t("video.taskSubmitted"), t("success.videoTaskProcessing"));
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
        // Task 3.2 Step 2：使用 getEffectiveVideoParams 统一能力过滤，不再手动查询 strategy
        const effectiveParams = resolveEffectiveVideoParams(selectedVideoModel, firstFrameUrl, beat, characterRefs, sceneRef);
        const referenceVideo = resolveReferenceVideo(
          videoMode,
          prevVideoUrl,
          effectiveParams?.supportsReferenceVideo,
        );

        // 优先使用用户在编辑框中手动修改的 prompt（beat.videoGen.prompt），
        // 否则由 generateSingleBeatPrompt 自动构建
        const basePrompt = buildBasePromptForBeat({
          beat,
          beatId,
          beatsRef,
          charactersRef,
          scenesRef,
          elements,
        });

        const promptLanguage = effectiveParams?.promptLanguage || "auto";
        const enhancedPrompt = StoryGenerationService.buildVideoPrompt(
          beat,
          basePrompt,
          promptLanguage,
          props.styleGuideRef?.current,
          beat.shotInstruction,
        );

        // 能力过滤已由 getEffectiveVideoParams 完成，直接使用过滤后的值
        const result = await createTask(enhancedPrompt, undefined, buildVideoTaskOptions({
          beat,
          beatId,
          currentStory,
          firstFrameUrl,
          effectiveCharacterRefs: effectiveParams?.characterRefs,
          effectiveSceneRef: effectiveParams?.sceneRef,
          effectiveLastFrameUrl: effectiveParams?.lastFrameUrl,
          selectedVideoModel,
          referenceVideo,
        }));

        handleVideoTaskResult({ result, signal, success, showError, showWarning });
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
