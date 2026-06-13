import type { Result } from "@/domain/types";
import { fromAsyncThrowable, GenerationError } from "@/domain/types";
import type { StoryBeat, StoryBeatKeyframe, StoryBeatFramePair, Character, Scene, StoryElement, StoryStyleGuide } from "@/domain/schemas";
import { getLastFrameUrl } from "@/domain/utils";
import { errorLogger, extractErrorMessage } from "@/shared/error-logger";
import { t } from "@/shared/constants";
import { type ProviderDeps, type VideoGenerationMode, determineVideoGenerationMode } from "./video-generation-mode";
import { generateBeatKeyframe, generateBeatFramePair } from "./beat-frame-generator";
import { generateBeatVideo } from "./beat-video-generator";

export async function generateBeatFullWorkflow(
  beat: StoryBeat,
  prevBeat: StoryBeat | null,
  options: {
    characterRefs?: string[];
    characterRef?: string;
    sceneRef?: string;
    providerId?: string;
    modelId?: string;
    characters?: Character[];
    scenes?: Scene[];
    elements?: StoryElement[];
    styleGuide?: StoryStyleGuide;
    beatIndex?: number;
    prevBeatDescription?: string;
    nextBeatDescription?: string;
  },
  providers: ProviderDeps,
  onProgress?: (step: string, progress: number) => void,
): Promise<Result<{
  keyframe: StoryBeatKeyframe;
  framePair: StoryBeatFramePair;
  videoTaskId: string;
  videoMode: VideoGenerationMode;
}>> {
  return fromAsyncThrowable(async () => {
    onProgress?.(t("progress.generatingKeyframe"), 0.05);
    const keyframeResult = await generateBeatKeyframe(beat, prevBeat, {
      ...options,
      styleGuide: options.styleGuide,
    }, providers);
    if (!keyframeResult.ok) throw keyframeResult.error;
    const keyframe = keyframeResult.value;
    onProgress?.(t("progress.generatingKeyframe"), 0.2);

    onProgress?.(t("progress.generatingFramePrompts"), 0.25);
    onProgress?.(t("progress.generatingFramePair"), 0.35);
    const framePairResult = await generateBeatFramePair(
      { ...beat, keyframe },
      {
        ...options,
        styleGuide: options.styleGuide,
        autoGeneratePrompts: true,
        beatIndex: options.beatIndex,
        prevBeatDescription: options.prevBeatDescription,
        nextBeatDescription: options.nextBeatDescription,
      },
      providers,
    );
    if (!framePairResult.ok) throw framePairResult.error;
    const framePair = framePairResult.value;
    onProgress?.(t("progress.generatingFramePair"), 0.6);

    onProgress?.(t("progress.determiningVideoMode"), 0.65);
    const videoMode = determineVideoGenerationMode(beat, prevBeat);

    onProgress?.(t("progress.generatingVideo"), 0.7);
    const prevVideoUrl = prevBeat?.videoGen?.videoUrl || prevBeat?.uploadedVideo;
    const effectiveVideoMode = (videoMode === "reference_video_continuation" && !prevVideoUrl)
      ? "first_frame_anchor" as VideoGenerationMode
      : videoMode;

    const resolvedCharacterRefs = options.characterRefs;
    const resolvedSceneRef = options.sceneRef;

    const videoResult = await generateBeatVideo(
      { ...beat, keyframe, framePair },
      {
        ...options,
        characterRefs: resolvedCharacterRefs,
        sceneRef: resolvedSceneRef,
        videoMode: effectiveVideoMode,
        prevVideoUrl,
        prevBeat,
      },
      providers,
    );
    if (!videoResult.ok) throw videoResult.error;
    onProgress?.(t("progress.generatingVideo"), 0.9);

    return {
      keyframe,
      framePair,
      videoTaskId: videoResult.value.taskId,
      videoMode: videoResult.value.videoMode,
    };
  });
}

export async function generateKeyframeChain(
  beats: StoryBeat[],
  options: {
    getCharacterRef?: (beat: StoryBeat) => string | undefined;
    getSceneRef?: (beat: StoryBeat) => string | undefined;
    providerId?: string;
    modelId?: string;
    styleGuide?: StoryStyleGuide;
  },
  providers: ProviderDeps,
  onProgress?: (index: number, total: number, beatId: string) => void,
): Promise<Result<Map<string, StoryBeatKeyframe>>> {
  return fromAsyncThrowable(async () => {
    const results = new Map<string, StoryBeatKeyframe>();
    let prevBeat: StoryBeat | null = null;

    for (let i = 0; i < beats.length; i++) {
      const beat = beats[i]!;
      onProgress?.(i, beats.length, beat.id);

      try {
        const keyframeResult = await generateBeatKeyframe(beat, prevBeat, {
          characterRef: options.getCharacterRef?.(beat),
          sceneRef: options.getSceneRef?.(beat),
          providerId: options.providerId,
          modelId: options.modelId,
          styleGuide: options.styleGuide,
        }, providers);
        if (keyframeResult.ok) {
          results.set(beat.id, keyframeResult.value);
          prevBeat = { ...beat, keyframe: keyframeResult.value };
        }
      } catch (error) {
        errorLogger.error(
          new GenerationError(
            `Keyframe generation failed (beat ${beat.id}): ${extractErrorMessage(error)}`,
            "keyframe",
            error,
          ),
          "KeyframeChain",
        );
      }
    }

    return results;
  });
}

export async function generateFramePairChain(
  beats: StoryBeat[],
  options: {
    characters: Character[];
    scenes: Scene[];
    elements?: StoryElement[];
    providerId?: string;
    modelId?: string;
    styleGuide?: StoryStyleGuide;
  },
  providers: ProviderDeps,
  onProgress?: (index: number, total: number, beatId: string) => void,
): Promise<Result<Map<string, StoryBeatFramePair>>> {
  return fromAsyncThrowable(async () => {
    const results = new Map<string, StoryBeatFramePair>();
    let prevLastFrameUrl: string | undefined;

    const beatsWithKeyframe = beats.filter((b) => b.keyframe?.imageUrl || b.uploadedKeyframe);
    if (beatsWithKeyframe.length === 0 && beats.length > 0) {
      errorLogger.warn(
        { code: "FRAME_PAIR_CHAIN_NO_KEYFRAMES", message: `All ${beats.length} beats have no keyframes, skipping frame pair generation` },
        "FramePairChain",
      );
    }

    for (let i = 0; i < beats.length; i++) {
      const beat = beats[i]!;
      onProgress?.(i, beats.length, beat.id);

      if (!beat.keyframe?.imageUrl && !beat.uploadedKeyframe) {
        continue;
      }

      try {
        const prevBeatDescription = i > 0 ? beats[i - 1]!.content || beats[i - 1]!.description : undefined;
        const nextBeatDescription = i < beats.length - 1 ? beats[i + 1]!.content || beats[i + 1]!.description : undefined;

        const framePairResult = await generateBeatFramePair(beat, {
          characters: options.characters,
          scenes: options.scenes,
          elements: options.elements,
          providerId: options.providerId,
          modelId: options.modelId,
          prevLastFrameUrl,
          styleGuide: options.styleGuide,
          autoGeneratePrompts: true,
          beatIndex: i,
          prevBeatDescription,
          nextBeatDescription,
        }, providers);

        if (framePairResult.ok) {
          results.set(beat.id, framePairResult.value);
          prevLastFrameUrl = getLastFrameUrl(framePairResult.value);
        }
      } catch (error) {
        errorLogger.error(
          new GenerationError(
            `Frame pair generation failed (beat ${beat.id}): ${extractErrorMessage(error)}`,
            "framePair",
            error,
          ),
          "FramePairChain",
        );
        prevLastFrameUrl = undefined;
      }
    }

    return results;
  });
}
