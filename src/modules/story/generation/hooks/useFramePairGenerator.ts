import { useState, useCallback } from "react";
import { generateBeatFramePair } from "@/modules/story";
import { checkVisualConsistency } from "@/modules/shot/consistency-check";
import type { StoryBeat, Character, Scene, StoryStyleGuide, ModelSelection } from "@/domain/schemas";
import { StoryGenerationService } from "@/domain/services";
import { getFirstFrameUrl } from "@/domain/utils";
import { container } from "@/infrastructure/di";
import { handleError } from "@/shared/error-handler";
import { errorLogger } from "@/shared/error-logger";
import { useAIGeneratorBase } from "./useAIGeneratorBase";
import { t } from "@/shared/constants";

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
          t("story.cannotGenerateVideo"),
          t("story.selectImageModel"),
        )
      ) {
        return;
      }
      const beat = findBeat(beatId);
      if (!beat?.keyframe?.imageUrl) {
        showError(t("story.cannotGenerateVideo"));
        return;
      }
      return withGenerationState(beatId, async (signal) => {
        const prevBeat = resolvePrevBeat(beatId, prevBeatOverride);
        const elements = await container.elementStorage.getAllElements();
        const { characterRefs, sceneRef, prevLastFrameUrl } = StoryGenerationService.resolveGenerationContext({
          beat,
          prevBeat,
          characters: props.charactersRef.current,
          scenes: props.scenesRef.current,
          elements,
        });

        const framePair = await generateBeatFramePair(beat, {
          characterRefs,
          sceneRef,
          prevLastFrameUrl,
          providerId: selectedImageModel?.providerId,
          modelId: selectedImageModel?.modelId,
          characters: props.charactersRef.current,
          scenes: props.scenesRef.current,
          elements,
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
            generatedImageUrl: getFirstFrameUrl(updatedBeat.framePair),
          });

          if (consistencyResult.ok) {
            updatedBeat.consistencyCheck = consistencyResult.value;
          }

          if (consistencyResult.ok && !consistencyResult.value.passed) {
            if (consistencyResult.value.recommendation === "regenerate" && !customFirstFramePrompt) {
              errorLogger.warn(
                handleError(new Error(t("error.consistencyCheckNotPassed", { beatId }))),
                "Consistency",
              );

              const retryResult = await generateBeatFramePair(beat, {
                characterRefs,
                sceneRef,
                prevLastFrameUrl,
                providerId: selectedImageModel?.providerId,
                modelId: selectedImageModel?.modelId,
                characters: props.charactersRef.current,
                scenes: props.scenesRef.current,
                elements,
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
                consistencyHint: `Previous attempt scored ${consistencyResult.value.overallScore.toFixed(2)}. Focus on improving character/element visual consistency.`,
              }, {
                videoProvider: container.videoProvider,
                imageProvider: container.imageProvider,
                textProvider: container.textProvider,
              });

              if (!signal.aborted && retryResult.ok) {
                const retryFramePair = retryResult.value;
                Object.assign(updatedBeat, { framePair: retryFramePair });

                try {
                  const retryElements = await container.elementStorage.getAllElements();
                  const retryCheck = await checkVisualConsistency({
                    beat: updatedBeat,
                    elements: retryElements,
                    generatedImageUrl: getFirstFrameUrl(retryFramePair),
                  });
                  if (retryCheck.ok) {
                    updatedBeat.consistencyCheck = retryCheck.value;
                  }
                } catch {
                  // retry check failed, keep original check result
                }
              }
            } else {
              errorLogger.warn(
                handleError(new Error(t("error.consistencyCheckNotPassed", { beatId }))),
                "Consistency",
              );
            }
          }
        } catch (checkErr) {
          errorLogger.warn(handleError(checkErr), "Consistency");
        }

        if (signal.aborted) return;

        updateBeat(beatId, updatedBeat);
        success(t("success.generated"), t("success.framePairGeneratedDesc"));
        return updatedBeat;
      }, t("story.framePairGenFailed"));
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
