"use client";

import { useState, useCallback } from "react";
import { generateBeatFramePair } from "@/modules/story";
import { checkVisualConsistency } from "@/modules/shot/consistency-check";
import type { StoryBeat, Character, Scene, StoryStyleGuide, ModelSelection } from "@/domain/schemas";
import { StoryGenerationService } from "@/domain/services";
import { container } from "@/infrastructure/di";
import { handleError } from "@/shared/error-handler";
import { errorLogger } from "@/shared/error-logger";
import { useAIGeneratorBase } from "./useAIGeneratorBase";

interface UseFramePairGeneratorProps {
  beatsRef: React.MutableRefObject<StoryBeat[]>;
  charactersRef: React.MutableRefObject<Character[]>;
  scenesRef: React.MutableRefObject<Scene[]>;
  styleGuideRef?: React.MutableRefObject<StoryStyleGuide | undefined>;
  selectedImageModel: ModelSelection | null;
  setBeats: React.Dispatch<React.SetStateAction<StoryBeat[]>>;
  success: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;
}

export function useFramePairGenerator(props: UseFramePairGeneratorProps) {
  const { selectedImageModel, success, showError, styleGuideRef } = props;

  const [generatingFramePair, setGeneratingFramePair] = useState<string | null>(null);

  const {
    findBeat,
    resolvePrevBeat,
    checkModelConfig,
    withGenerationState,
    updateBeat,
  } = useAIGeneratorBase({ ...props, setGenerating: setGeneratingFramePair });

  const generateFramePair = useCallback(
    async (
      beatId: string,
      prevBeatOverride?: StoryBeat | null,
      customFirstFramePrompt?: string,
      customLastFramePrompt?: string,
    ): Promise<StoryBeat | void> => {
      if (
        !checkModelConfig(
          selectedImageModel,
          "无法生成首尾帧",
          "请先在顶部工具栏选择图像生成模型",
        )
      ) {
        return;
      }
      const beat = findBeat(beatId);
      if (!beat?.keyframe?.imageUrl) {
        showError("无法生成首尾帧", "请先生成预览图");
        return;
      }
      return withGenerationState(beatId, async (signal) => {
        const prevBeat = resolvePrevBeat(beatId, prevBeatOverride);
        const { characterRef, sceneRef, prevLastFrameUrl } = StoryGenerationService.resolveGenerationContext({
          beat,
          prevBeat,
          characters: props.charactersRef.current,
          scenes: props.scenesRef.current,
          elements: [],
        });

        const framePair = await generateBeatFramePair(beat, {
          characterRef,
          sceneRef,
          prevLastFrameUrl,
          providerId: selectedImageModel?.providerId,
          modelId: selectedImageModel?.modelId,
          characters: props.charactersRef.current,
          scenes: props.scenesRef.current,
          customFirstFramePrompt,
          customLastFramePrompt,
          styleGuide: styleGuideRef?.current,
          autoGeneratePrompts: true,
          beatIndex: props.beatsRef.current.findIndex((b) => b.id === beatId),
          prevBeatDescription: prevBeat?.content || prevBeat?.description,
          nextBeatDescription: (() => {
            const beatIdx = props.beatsRef.current.findIndex((b) => b.id === beatId);
            const nextBeat = beatIdx >= 0 && beatIdx < props.beatsRef.current.length - 1
              ? props.beatsRef.current[beatIdx + 1]
              : null;
            return nextBeat?.content || nextBeat?.description;
          })(),
        }, {
          videoProvider: container.videoProvider,
          imageProvider: container.imageProvider,
          textProvider: container.textProvider,
        });

        if (signal.aborted) return;

        const updatedBeat = { ...beat, framePair } as StoryBeat;

        try {
          const elements = await container.elementStorage.getAllElements();

          const consistencyResult = await checkVisualConsistency({
            beat: updatedBeat,
            elements,
            generatedImageUrl:
              updatedBeat.framePair?.firstFrameUrl || undefined,
          });

          if (consistencyResult.ok) {
            updatedBeat.consistencyCheck = consistencyResult.value;
          }

          if (consistencyResult.ok && !consistencyResult.value.passed) {
            errorLogger.warn(
              handleError(new Error(`分镜 ${beatId} 一致性检查未通过`)),
              "Consistency",
            );
          }
        } catch (checkErr) {
          errorLogger.warn(handleError(checkErr), "Consistency");
        }

        if (signal.aborted) return;

        updateBeat(beatId, updatedBeat);
        success("首尾帧生成成功", "分镜首尾帧已生成");
        return updatedBeat;
      }, "首尾帧生成失败");
    },
    [
      selectedImageModel,
      success,
      showError,
      checkModelConfig,
      findBeat,
      resolvePrevBeat,
      props.beatsRef,
      props.charactersRef,
      props.scenesRef,
      styleGuideRef,
      withGenerationState,
      updateBeat,
    ],
  );

  return { generateFramePair, generatingFramePair };
}
