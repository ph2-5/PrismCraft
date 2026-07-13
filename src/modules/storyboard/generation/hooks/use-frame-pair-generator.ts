import { useState, useCallback } from "react";
import { generateBeatFramePair } from "@/modules/storyboard";
import { checkVisualConsistency } from "@/modules/shot/consistency-check";
import type { StoryBeat, Character, Scene, StoryStyleGuide, ModelSelection, StoryElement } from "@/domain/schemas";
import { StoryGenerationService } from "@/domain/services";
import { getFirstFrameUrl } from "@/domain/utils";
import { container } from "@/infrastructure/di";
import { handleError } from "@/shared/error-handler";
import { errorLogger } from "@/shared/error-logger";
import { useAIGeneratorBase } from "./use-ai-generator-base";
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

interface BeatNeighbors {
  beatIndex: number;
  prevBeatDescription?: string;
  nextBeatDescription?: string;
}

function resolveBeatNeighbors(beats: StoryBeat[], beatId: string): BeatNeighbors {
  const beatIndex = beats.findIndex((b) => b.id === beatId);
  const nextBeat = beatIndex >= 0 && beatIndex < beats.length - 1
    ? beats[beatIndex + 1]
    : null;
  return {
    beatIndex,
    prevBeatDescription: undefined,
    nextBeatDescription: nextBeat?.content || nextBeat?.description,
  };
}

function buildGenerationContext(args: {
  beat: StoryBeat;
  prevBeat: StoryBeat | null | undefined;
  characters: Character[];
  scenes: Scene[];
  elements: StoryElement[];
  selectedImageModel: ModelSelection | null;
  styleGuide: StoryStyleGuide | undefined;
  customFirstFramePrompt?: string;
  customLastFramePrompt?: string;
  consistencyHint?: string;
  neighbors: BeatNeighbors;
  prevBeatDescription?: string;
}) {
  const { beat, prevBeat, characters, scenes, elements, selectedImageModel, styleGuide } = args;
  const { characterRefs, sceneRef, prevLastFrameUrl } = StoryGenerationService.resolveGenerationContext({
    beat,
    prevBeat: prevBeat ?? null,
    characters,
    scenes,
    elements,
  });

  return {
    characterRefs,
    sceneRef,
    prevLastFrameUrl,
    providerId: selectedImageModel?.providerId,
    modelId: selectedImageModel?.modelId,
    characters,
    scenes,
    elements,
    customFirstFramePrompt: args.customFirstFramePrompt,
    customLastFramePrompt: args.customLastFramePrompt,
    styleGuide,
    autoGeneratePrompts: true,
    beatIndex: args.neighbors.beatIndex,
    prevBeatDescription: args.prevBeatDescription,
    nextBeatDescription: args.neighbors.nextBeatDescription,
    consistencyHint: args.consistencyHint,
  };
}

async function performConsistencyCheck(
  beat: StoryBeat,
  elements: StoryElement[],
  imageUrl: string | undefined,
): Promise<{ passed: boolean; recommendation?: string; value?: StoryBeat["consistencyCheck"] }> {
  if (!imageUrl) return { passed: true };
  const result = await checkVisualConsistency({ beat, elements, generatedImageUrl: imageUrl });
  if (!result.ok) {
    return { passed: true };
  }
  return {
    passed: result.value.passed,
    recommendation: result.value.recommendation,
    value: result.value,
  };
}

async function attemptRegeneration(
  beat: StoryBeat,
  ctx: ReturnType<typeof buildGenerationContext>,
  signal: AbortSignal,
): Promise<{ framePair?: StoryBeat["framePair"]; consistencyCheck?: StoryBeat["consistencyCheck"] }> {
  const retryOptions = {
    ...ctx,
    customFirstFramePrompt: undefined,
    customLastFramePrompt: undefined,
    consistencyHint: `Previous attempt scored low. Focus on improving character/element visual consistency.`,
  };
  const retryResult = await generateBeatFramePair(beat, retryOptions, {
    videoProvider: container.videoProvider,
    imageProvider: container.imageProvider,
    textProvider: container.textProvider,
  });

  if (signal.aborted || !retryResult.ok) return {};

  const retryFramePair = retryResult.value;
  const retryElements = await container.elementStorage.getAllElements();
  const retryCheck = await performConsistencyCheck(
    beat,
    retryElements,
    getFirstFrameUrl(retryFramePair),
  );
  return {
    framePair: retryFramePair,
    consistencyCheck: retryCheck.value,
  };
}

async function runConsistencyCheckWithRetry(
  beat: StoryBeat,
  updatedBeat: StoryBeat,
  ctx: ReturnType<typeof buildGenerationContext>,
  signal: AbortSignal,
  customFirstFramePrompt: string | undefined,
  beatId: string,
): Promise<void> {
  try {
    const elements = await container.elementStorage.getAllElements();
    const check = await performConsistencyCheck(
      updatedBeat,
      elements,
      getFirstFrameUrl(updatedBeat.framePair),
    );

    if (check.value) {
      updatedBeat.consistencyCheck = check.value;
    }

    if (check.passed || check.recommendation !== "regenerate" || customFirstFramePrompt) {
      if (!check.passed) {
        errorLogger.warn(
          handleError(new Error(t("error.consistencyCheckNotPassed", { beatId }))),
          "Consistency",
        );
      }
      return;
    }

    errorLogger.warn(
      handleError(new Error(t("error.consistencyCheckNotPassed", { beatId }))),
      "Consistency",
    );

    const retry = await attemptRegeneration(beat, ctx, signal);
    if (retry.framePair) {
      Object.assign(updatedBeat, { framePair: retry.framePair });
    }
    if (retry.consistencyCheck) {
      updatedBeat.consistencyCheck = retry.consistencyCheck;
    }
  } catch (checkErr) {
    errorLogger.warn(handleError(checkErr), "Consistency");
  }
}

export function useFramePairGenerator(props: UseFramePairGeneratorProps) {
  const { selectedImageModel, success, showError, styleGuideRef, beatsRef, charactersRef, scenesRef } = props;

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
        const neighbors = resolveBeatNeighbors(beatsRef.current, beatId);
        const ctx = buildGenerationContext({
          beat,
          prevBeat,
          characters: charactersRef.current,
          scenes: scenesRef.current,
          elements,
          selectedImageModel,
          styleGuide: styleGuideRef?.current,
          customFirstFramePrompt,
          customLastFramePrompt,
          neighbors,
          prevBeatDescription: prevBeat?.content || prevBeat?.description,
        });

        const framePair = await generateBeatFramePair(beat, ctx, {
          videoProvider: container.videoProvider,
          imageProvider: container.imageProvider,
          textProvider: container.textProvider,
        });

        if (signal.aborted) return;

        const updatedBeat = { ...beat, framePair } as StoryBeat;

        await runConsistencyCheckWithRetry(
          beat,
          updatedBeat,
          ctx,
          signal,
          customFirstFramePrompt,
          beatId,
        );

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
      beatsRef,
      charactersRef,
      scenesRef,
      styleGuideRef,
      withGenerationState,
      updateBeat,
    ],
  );

  return { generateFramePair, generatingFramePair };
}
