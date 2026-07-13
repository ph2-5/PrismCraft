import { useState, useCallback } from "react";
import { generateBeatKeyframe } from "@/modules/storyboard";
import type { StoryBeat, Character, Scene, StoryStyleGuide, ModelSelection } from "@/domain/schemas";
import { StoryGenerationService } from "@/domain/services";
import { container } from "@/infrastructure/di";
import { useAIGeneratorBase } from "./use-ai-generator-base";
import { confirm } from "@/shared/utils/confirm";
import { t } from "@/shared/constants";

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
          t("story.cannotGenerateKeyframe"),
          t("story.selectImageModel"),
        )
      ) {
        return;
      }
      const beat = findBeat(beatId);
      if (!beat) return;
      const hasCharacterBinding = (beat.characterIds?.length ?? 0) > 0;
      const hasSceneBinding = !!beat.sceneId;
      if (!hasCharacterBinding && !hasSceneBinding) {
        const confirmed = showConfirm
          ? await showConfirm(
              t("story.noBindingTitle"),
              t("story.noBindingDesc"),
            )
          : await confirm(
              t("story.noBindingDesc"),
              t("story.noBindingTitle"),
            );
        if (!confirmed) return;
      }
      return withGenerationState(beatId, async (signal) => {
        const prevBeat = resolvePrevBeat(beatId, prevBeatOverride);
        // 可选链防御：测试环境可能未 mock elementStorage，真实环境一定存在
        const elements = await container.elementStorage?.getAllElements?.() ?? [];
        const { characterRefs, sceneRef } = StoryGenerationService.resolveGenerationContext({
          beat,
          prevBeat,
          characters: charactersRef.current,
          scenes: scenesRef.current,
          elements,
        });

        const keyframeResult = await generateBeatKeyframe(beat, prevBeat, {
          characterRefs,
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
        success(t("success.generated"), t("success.keyframeGeneratedDesc"));
        return updatedBeat;
      }, t("story.keyframeGenFailed"));
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
