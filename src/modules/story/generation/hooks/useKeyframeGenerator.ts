"use client";

import { useState, useCallback } from "react";
import { generateBeatKeyframe } from "@/modules/story";
import type { StoryBeat, Character, Scene, StoryStyleGuide, ModelSelection } from "@/domain/schemas";
import { StoryGenerationService } from "@/domain/services";
import { container } from "@/infrastructure/di";
import { useAIGeneratorBase } from "./useAIGeneratorBase";
import { confirm } from "@/shared/utils/confirm";

interface UseKeyframeGeneratorProps {
  beatsRef: React.MutableRefObject<StoryBeat[]>;
  charactersRef: React.MutableRefObject<Character[]>;
  scenesRef: React.MutableRefObject<Scene[]>;
  styleGuideRef?: React.MutableRefObject<StoryStyleGuide | undefined>;
  selectedImageModel: ModelSelection | null;
  setBeats: React.Dispatch<React.SetStateAction<StoryBeat[]>>;
  success: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;
  showConfirm?: (title: string, description: string) => Promise<boolean>;
}

export function useKeyframeGenerator(props: UseKeyframeGeneratorProps) {
  const { selectedImageModel, charactersRef, scenesRef, styleGuideRef, success, showConfirm } = props;

  const [generatingKeyframe, setGeneratingKeyframe] = useState<string | null>(
    null,
  );

  const {
    findBeat,
    resolvePrevBeat,
    checkModelConfig,
    withGenerationState,
    updateBeat,
  } = useAIGeneratorBase({ ...props, setGenerating: setGeneratingKeyframe });

  const generateKeyframe = useCallback(
    async (
      beatId: string,
      prevBeatOverride?: StoryBeat | null,
      customPrompt?: string,
    ): Promise<StoryBeat | void> => {
      if (
        !checkModelConfig(
          selectedImageModel,
          "无法生成预览图",
          "请先在顶部工具栏选择图像生成模型",
        )
      ) {
        return;
      }
      const beat = findBeat(beatId);
      if (!beat) return;
      const hasCharacterBinding = (beat.characterIds?.length ?? 0) > 0;
      const hasSceneBinding = !!(beat.sceneId || beat.scene);
      if (!hasCharacterBinding && !hasSceneBinding) {
        const confirmed = showConfirm
          ? await showConfirm(
              "未绑定角色或场景",
              '当前分镜未绑定角色或场景，生成的预览图可能缺少关键视觉元素。建议先在"元素绑定"面板中绑定角色和场景。\n\n是否仍要继续生成？',
            )
          : await confirm(
              '当前分镜未绑定角色或场景，生成的预览图可能缺少关键视觉元素。建议先在"元素绑定"面板中绑定角色和场景。\n\n是否仍要继续生成？',
              "未绑定角色或场景",
            );
        if (!confirmed) return;
      }
      return withGenerationState(beatId, async (signal) => {
        const prevBeat = resolvePrevBeat(beatId, prevBeatOverride);
        const { characterRef, sceneRef } = StoryGenerationService.resolveGenerationContext({
          beat,
          prevBeat,
          characters: charactersRef.current,
          scenes: scenesRef.current,
          elements: [],
        });

        const keyframeResult = await generateBeatKeyframe(beat, prevBeat, {
          characterRef,
          sceneRef,
          providerId: selectedImageModel?.providerId,
          modelId: selectedImageModel?.modelId,
          characters: charactersRef.current,
          scenes: scenesRef.current,
          customPrompt,
          styleGuide: styleGuideRef?.current,
        }, {
          videoProvider: container.videoProvider,
          imageProvider: container.imageProvider,
          textProvider: container.textProvider,
        });

        if (signal.aborted) return;

        if (!keyframeResult.ok) {
          throw keyframeResult.error instanceof Error
            ? keyframeResult.error
            : new Error(String(keyframeResult.error));
        }

        const updatedBeat = { ...beat, keyframe: keyframeResult.value } as StoryBeat;
        updateBeat(beatId, updatedBeat);
        success("预览图生成成功", "分镜预览图已生成");
        return updatedBeat;
      }, "预览图生成失败");
    },
    [
      selectedImageModel,
      success,
      showConfirm,
      checkModelConfig,
      findBeat,
      resolvePrevBeat,
      charactersRef,
      scenesRef,
      styleGuideRef,
      withGenerationState,
      updateBeat,
    ],
  );

  const regenerateKeyframe = useCallback(
    async (beatId: string) => {
      await generateKeyframe(beatId);
    },
    [generateKeyframe],
  );

  return {
    generateKeyframe,
    regenerateKeyframe,
    generatingKeyframe,
    setGeneratingKeyframe,
  };
}
