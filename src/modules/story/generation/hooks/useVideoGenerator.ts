"use client";

import { useState, useCallback } from "react";
import { generateSingleBeatPrompt } from "@/modules/prompt";
import type { Story, StoryBeat, Character, Scene, StoryStyleGuide, VideoTask, ModelSelection } from "@/domain/schemas";
import { container } from "@/infrastructure/di";
import { StoryGenerationService } from "@/domain/services";
import { useAIGeneratorBase } from "./useAIGeneratorBase";
import { determineVideoGenerationMode, type VideoGenerationMode } from "../services/storyboard-generation-service";
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
      if (!beat?.framePair?.firstFrame?.imageUrl) {
        showError(t("story.cannotGenerateVideo"));
        return;
      }
      const framePair = beat.framePair!;
      const firstFrame = framePair.firstFrame!;
      if (
        !checkModelConfig(
          selectedVideoModel,
          "无法生成视频",
          "请先在顶部工具栏选择视频生成模型",
        )
      ) {
        return;
      }
      return withGenerationState(beatId, async (signal) => {
        const prevBeat = resolvePrevBeat(beatId, prevBeatOverride);
        const elements = await container.elementStorage.getAllElements();
        const { characterRef, sceneRef, prevVideoUrl } = StoryGenerationService.resolveGenerationContext({
          beat,
          prevBeat,
          characters: charactersRef.current,
          scenes: scenesRef.current,
          elements,
        });

        const videoMode = determineVideoGenerationMode(beat, prevBeat);
        const effectiveVideoMode: VideoGenerationMode =
          videoMode === "reference_video_continuation" && !prevVideoUrl
            ? "first_frame_anchor"
            : videoMode;
        const referenceVideo = effectiveVideoMode === "reference_video_continuation" ? prevVideoUrl : null;

        const basePrompt = generateSingleBeatPrompt({
          beat,
          index: beatsRef.current.findIndex((b) => b.id === beatId),
          characters: charactersRef.current,
          scenes: scenesRef.current,
          shotInstruction: beat.shotInstruction,
          elements,
          characterOutfits: beat.characterOutfits,
        });

        const enhancedPrompt = StoryGenerationService.buildVideoPrompt(beat, basePrompt);

        const result = await createTask(enhancedPrompt, undefined, {
          duration: beat.duration,
          beatId,
          storyId: currentStory.id,
          storyTitle: currentStory.title || "未命名分镜",
          beatTitle: beat.title || `镜头 ${beat.sequence}`,
          firstFrameUrl: firstFrame.imageUrl,
          fixedImageUrl: firstFrame.imageUrl,
          fixedImageLockType: "scene",
          lastFrameUrl: framePair.lastFrame?.imageUrl,
          providerId: selectedVideoModel?.providerId,
          modelId: selectedVideoModel?.modelId,
          format: selectedVideoModel?.format,
          characterRef,
          sceneRef,
          referenceVideo,
        });

        if (signal.aborted) return;

        if (result?.promptWasTruncated && showWarning) {
          showWarning("提示词过长", "提示词已被自动截断，可能影响生成效果");
        }

        success("视频生成任务已提交", "正在处理中...");
      }, "视频生成失败");
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
    ],
  );

  return { generateVideoNew, generatingVideo };
}
