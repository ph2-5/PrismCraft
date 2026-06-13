import type { Result } from "@/domain/types";
import { fromAsyncThrowable, ValidationError } from "@/domain/types";
import type { StoryBeat } from "@/domain/schemas";
import { getFirstFrameUrl, getLastFrameUrl } from "@/domain/utils";
import { type ProviderDeps, type VideoGenerationMode, determineVideoGenerationMode } from "./video-generation-mode";
import { getVideoGenerationStrategy } from "@/shared/model-capabilities";
import { t } from "@/shared/constants";

export async function generateBeatVideo(
  beat: StoryBeat,
  options: {
    characterRefs?: string[];
    characterRef?: string;
    sceneRef?: string;
    prompt?: string;
    prevVideoUrl?: string;
    providerId?: string;
    modelId?: string;
    videoMode?: VideoGenerationMode;
    prevBeat?: StoryBeat | null;
  },
  providers: ProviderDeps,
): Promise<Result<{ taskId: string; videoUrl?: string; status: string; videoMode: VideoGenerationMode }>> {
  return fromAsyncThrowable(async () => {
    const generatedFirstFrameUrl = getFirstFrameUrl(beat.framePair);
    const uploadedFirstFrameUrl = beat.uploadedFramePair?.firstFrame;
    const firstFrameUrl = generatedFirstFrameUrl || uploadedFirstFrameUrl;
    const generatedLastFrameUrl = getLastFrameUrl(beat.framePair);
    const uploadedLastFrameUrl = beat.uploadedFramePair?.lastFrame;
    const lastFrameUrl = generatedLastFrameUrl || uploadedLastFrameUrl;

    if (!firstFrameUrl) {
      throw new ValidationError(t("error.videoRequiresFramePair"));
    }

    if (!/^https?:\/\//.test(firstFrameUrl) && !/^vcache:\/\//.test(firstFrameUrl) && !/^\//.test(firstFrameUrl)) {
      throw new ValidationError(t("error.videoInvalidFirstFrame"));
    }

    const resolvedVideoMode: VideoGenerationMode =
      options.videoMode && options.videoMode !== "auto"
        ? options.videoMode
        : determineVideoGenerationMode(beat, options.prevBeat ?? null);

    let referenceVideo: string | null = null;
    if (resolvedVideoMode === "reference_video_continuation" && options.prevVideoUrl) {
      const refVideoStrategy = options.modelId ? getVideoGenerationStrategy(options.modelId) : null;
      if (refVideoStrategy?.supportsReferenceVideo !== false) {
        referenceVideo = options.prevVideoUrl;
      }
    }

    const promptText = options.prompt || beat.content || beat.description || "";
    if (!promptText.trim()) {
      throw new ValidationError(t("error.videoEmptyPrompt"));
    }

    const strategy = options.modelId ? getVideoGenerationStrategy(options.modelId) : null;

    const effectiveCharacterRefs = strategy && !strategy.useCharacterRef
      ? undefined
      : (options.characterRefs?.length ? options.characterRefs : undefined);
    const effectiveCharacterRef = strategy && !strategy.useCharacterRef
      ? undefined
      : options.characterRef;
    const effectiveSceneRef = strategy && !strategy.useSceneRef
      ? undefined
      : options.sceneRef;

    const result = await providers.videoProvider.generateVideoWithFrames({
      prompt: promptText,
      firstFrameUrl,
      lastFrameUrl,
      characterRefs: effectiveCharacterRefs,
      characterRef: effectiveCharacterRef,
      sceneRef: effectiveSceneRef,
      duration: beat.duration,
      providerId: options.providerId,
      modelId: options.modelId,
      referenceVideo: referenceVideo,
    });

    if (!result.success || !result.data) {
      throw new Error(result.error || t("error.videoGenFailed"));
    }

    return {
      taskId: result.data.taskId ?? "",
      videoUrl: result.data.videoUrl,
      status: result.data.status || "pending",
      videoMode: resolvedVideoMode,
    };
  });
}
