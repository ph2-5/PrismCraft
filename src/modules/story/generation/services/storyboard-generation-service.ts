import type { Result } from "@/domain/types";
import { fromAsyncThrowable, ValidationError, GenerationError } from "@/domain/types";
import type { StoryBeat, StoryBeatKeyframe, StoryBeatFramePair, Character, Scene, StoryElement, StoryStyleGuide } from "@/domain/schemas";
import type { IVideoProvider, IImageProvider, ITextProvider } from "@/domain/ports";
import { generateBeatImagePrompt } from "@/domain/utils";
import { errorLogger, extractErrorMessage } from "@/shared/error-logger";
import { generateFramePrompts } from "./frame-prompt-service";

export type VideoGenerationMode = "first_frame_anchor" | "reference_video_continuation" | "auto";

export function determineVideoGenerationMode(
  beat: StoryBeat,
  prevBeat: StoryBeat | null,
): VideoGenerationMode {
  if (!prevBeat) return "first_frame_anchor";

  const relationType = beat.camera?.relationType;
  if (relationType === "continuous") return "reference_video_continuation";
  if (relationType === "contrast" || relationType === "parallel" || relationType === "fade") return "first_frame_anchor";

  const prevShotType = prevBeat.shotType;
  const currShotType = beat.shotType;
  if (prevShotType && currShotType && prevShotType !== currShotType) return "first_frame_anchor";

  const prevScene = prevBeat.sceneId || prevBeat.scene;
  const currScene = beat.sceneId || beat.scene;
  if (prevScene && currScene && prevScene !== currScene) return "first_frame_anchor";

  return "reference_video_continuation";
}

function buildStyleEnhancedPrompt(
  basePrompt: string,
  styleGuide?: StoryStyleGuide,
): string {
  if (!styleGuide) return basePrompt;
  const styleParts: string[] = [];
  if (styleGuide.artStyle) styleParts.push(styleGuide.artStyle);
  if (styleGuide.moodAtmosphere) styleParts.push(styleGuide.moodAtmosphere);
  if (styleGuide.colorPalette?.length) styleParts.push(`color palette: ${styleGuide.colorPalette.join(", ")}`);
  if (styleParts.length === 0) return basePrompt;
  return `${basePrompt}, ${styleParts.join(", ")}`;
}

interface ProviderDeps {
  videoProvider: IVideoProvider;
  imageProvider: IImageProvider;
  textProvider: ITextProvider;
}

export async function generateBeatKeyframe(
  beat: StoryBeat,
  prevBeat: StoryBeat | null,
  options: {
    characterRef?: string;
    sceneRef?: string;
    providerId?: string;
    modelId?: string;
    characters?: Character[];
    scenes?: Scene[];
    elements?: StoryElement[];
    customPrompt?: string;
    styleGuide?: StoryStyleGuide;
  },
  providers: ProviderDeps,
): Promise<Result<StoryBeatKeyframe>> {
  return fromAsyncThrowable(async () => {
    const prevKeyframe = prevBeat?.keyframe?.imageUrl;

    let content: string;
    if (options.customPrompt) {
      content = options.customPrompt;
    } else if (beat.imageGenerationPrompt) {
      content = beat.imageGenerationPrompt;
    } else if (options.characters && options.scenes) {
      content = generateBeatImagePrompt({
        beat,
        characters: options.characters,
        scenes: options.scenes,
        isEnhanced: true,
        featureAnchoring: beat.featureAnchoring,
        shotInstruction: beat.shotInstruction,
      });
    } else {
      content = beat.content || beat.description || "";
    }

    if (!content.trim()) {
      throw new ValidationError("无法生成预览图：分镜内容描述为空，请填写分镜内容或自定义提示词");
    }

    content = buildStyleEnhancedPrompt(content, options.styleGuide);

    const result = await providers.videoProvider.generateKeyframe({
      characterRef: options.characterRef,
      sceneRef: options.sceneRef,
      prevKeyframe,
      shotRequirement: {
        shotType: beat.shotType,
        cameraAngle: beat.camera?.angle,
        cameraMovement: beat.camera?.movement,
        action: beat.content,
      },
      content,
      providerId: options.providerId,
      modelId: options.modelId,
    });

    if (!result.success || !result.data) {
      throw new Error(result.error || "预览图生成失败");
    }

    return {
      imageUrl: result.data.imageUrl,
      prompt: result.data.prompt,
      generatedAt: new Date().toISOString(),
      source: "ai",
    };
  });
}

export async function generateBeatFramePair(
  beat: StoryBeat,
  options: {
    characterRef?: string;
    sceneRef?: string;
    prevLastFrameUrl?: string;
    providerId?: string;
    modelId?: string;
    characters?: Character[];
    scenes?: Scene[];
    elements?: StoryElement[];
    customFirstFramePrompt?: string;
    customLastFramePrompt?: string;
    styleGuide?: StoryStyleGuide;
    autoGeneratePrompts?: boolean;
    beatIndex?: number;
    prevBeatDescription?: string;
    nextBeatDescription?: string;
  },
  providers: ProviderDeps,
): Promise<Result<StoryBeatFramePair>> {
  return fromAsyncThrowable(async () => {
    if (!beat.keyframe?.imageUrl) {
      throw new ValidationError("生成首尾帧前必须先生成预览图");
    }

    let firstFramePrompt = options.customFirstFramePrompt || beat.firstFramePrompt;
    let lastFramePrompt = options.customLastFramePrompt || beat.lastFramePrompt;

    const needAutoGenerateFirst = !firstFramePrompt && !options.customFirstFramePrompt;
    const needAutoGenerateLast = !lastFramePrompt && !options.customLastFramePrompt;

    if (
      options.autoGeneratePrompts !== false &&
      (needAutoGenerateFirst || needAutoGenerateLast) &&
      options.characters &&
      options.scenes
    ) {
      const promptResult = await generateFramePrompts({
        beat,
        index: options.beatIndex ?? beat.sequence ?? 0,
        characters: options.characters,
        scenes: options.scenes,
        elements: options.elements,
        styleGuide: options.styleGuide,
        prevBeatDescription: options.prevBeatDescription,
        nextBeatDescription: options.nextBeatDescription,
        textProvider: providers.textProvider,
      });

      if (promptResult.ok) {
        if (needAutoGenerateFirst && promptResult.value.firstFramePrompt) firstFramePrompt = promptResult.value.firstFramePrompt;
        if (needAutoGenerateLast && promptResult.value.lastFramePrompt) lastFramePrompt = promptResult.value.lastFramePrompt;
      }
    }

    if (!firstFramePrompt?.trim() && !lastFramePrompt?.trim() && !options.prevLastFrameUrl) {
      const fallbackPrompt = beat.content || beat.description || beat.keyframe?.prompt;
      if (!fallbackPrompt?.trim()) {
        throw new ValidationError("无法生成首尾帧：分镜内容和提示词均为空");
      }
      firstFramePrompt = firstFramePrompt || fallbackPrompt;
      lastFramePrompt = lastFramePrompt || fallbackPrompt;
    }

    const llmGeneratedFirst = needAutoGenerateFirst && firstFramePrompt;
    const llmGeneratedLast = needAutoGenerateLast && lastFramePrompt;

    if (options.styleGuide && firstFramePrompt && !llmGeneratedFirst) {
      firstFramePrompt = buildStyleEnhancedPrompt(firstFramePrompt, options.styleGuide);
    }
    if (options.styleGuide && lastFramePrompt && !llmGeneratedLast) {
      lastFramePrompt = buildStyleEnhancedPrompt(lastFramePrompt, options.styleGuide);
    }

    let fullKeyframePrompt = beat.keyframe.prompt || "";
    if (!fullKeyframePrompt && options.characters && options.scenes) {
      fullKeyframePrompt = generateBeatImagePrompt({
        beat,
        characters: options.characters,
        scenes: options.scenes,
        isEnhanced: true,
        featureAnchoring: beat.featureAnchoring,
        shotInstruction: beat.shotInstruction,
      });
    }

    if (options.prevLastFrameUrl || (!firstFramePrompt && !lastFramePrompt)) {
      const llmHint = firstFramePrompt && lastFramePrompt
        ? `首帧提示：${firstFramePrompt}\n尾帧提示：${lastFramePrompt}\n`
        : "";

      const result = await providers.videoProvider.generateFramePair({
        keyframeUrl: beat.keyframe.imageUrl,
        keyframePrompt: llmHint + fullKeyframePrompt,
        characterRef: options.characterRef,
        sceneRef: options.sceneRef,
        prevLastFrameUrl: options.prevLastFrameUrl,
        actionDescription: beat.content || beat.description,
        duration: beat.duration,
        providerId: options.providerId,
        modelId: options.modelId,
      });

      if (!result.success || !result.data) {
        throw new Error(result.error || "首尾帧生成失败");
      }

      return {
        firstFrame: {
          imageUrl: result.data.firstFrame.imageUrl,
          prompt: result.data.firstFrame.prompt,
          derivedFrom: beat.keyframe?.imageUrl || "",
        },
        lastFrame: {
          imageUrl: result.data.lastFrame.imageUrl,
          prompt: result.data.lastFrame.prompt,
          derivedFrom: result.data.firstFrame.imageUrl,
        },
        firstFrameUrl: result.data.firstFrame.imageUrl,
        lastFrameUrl: result.data.lastFrame.imageUrl,
        firstFramePrompt: firstFramePrompt || result.data.firstFrame.prompt,
        lastFramePrompt: lastFramePrompt || result.data.lastFrame.prompt,
        generatedAt: new Date(result.data.generatedAt).toISOString(),
        source: "ai",
      };
    }

    if (firstFramePrompt && lastFramePrompt) {
      const imageConfig: Record<string, unknown> = {};
      if (options.providerId) (imageConfig as Record<string, unknown>).providerId = options.providerId;
      if (options.modelId) (imageConfig as Record<string, unknown>).modelId = options.modelId;

      const results = await Promise.allSettled([
        providers.imageProvider.generateImage(firstFramePrompt, "scene", imageConfig),
        providers.imageProvider.generateImage(lastFramePrompt, "scene", imageConfig),
      ]);

      const firstResult = results[0].status === "fulfilled" ? results[0].value : null;
      const lastResult = results[1].status === "fulfilled" ? results[1].value : null;

      const errors: string[] = [];
      if (!firstResult?.success || !firstResult.data?.imageUrl) {
        errors.push(firstResult?.error || "首帧生成失败");
      }
      if (!lastResult?.success || !lastResult.data?.imageUrl) {
        errors.push(lastResult?.error || "尾帧生成失败");
      }
      if (errors.length > 0) {
        throw new Error(errors.join("; "));
      }

      return {
        firstFrame: {
          imageUrl: firstResult?.data?.imageUrl || "",
          prompt: firstFramePrompt,
          derivedFrom: beat.keyframe?.imageUrl || "",
        },
        lastFrame: {
          imageUrl: lastResult?.data?.imageUrl || "",
          prompt: lastFramePrompt,
          derivedFrom: firstResult?.data?.imageUrl || "",
        },
        firstFrameUrl: firstResult?.data?.imageUrl || "",
        lastFrameUrl: lastResult?.data?.imageUrl || "",
        firstFramePrompt,
        lastFramePrompt,
        generatedAt: new Date().toISOString(),
        source: "ai",
      };
    }

    const result = await providers.videoProvider.generateFramePair({
      keyframeUrl: beat.keyframe.imageUrl,
      keyframePrompt: fullKeyframePrompt,
      characterRef: options.characterRef,
      sceneRef: options.sceneRef,
      actionDescription: beat.content || beat.description,
      duration: beat.duration,
      providerId: options.providerId,
      modelId: options.modelId,
    });

    if (!result.success || !result.data) {
      throw new Error(result.error || "首尾帧生成失败");
    }

    return {
      firstFrame: {
        imageUrl: result.data.firstFrame.imageUrl,
        prompt: result.data.firstFrame.prompt,
        derivedFrom: beat.keyframe?.imageUrl || "",
      },
      lastFrame: {
        imageUrl: result.data.lastFrame.imageUrl,
        prompt: result.data.lastFrame.prompt,
        derivedFrom: result.data.firstFrame.imageUrl,
      },
      firstFrameUrl: result.data.firstFrame.imageUrl,
      lastFrameUrl: result.data.lastFrame.imageUrl,
      firstFramePrompt: result.data.firstFrame.prompt,
      lastFramePrompt: result.data.lastFrame.prompt,
      generatedAt: new Date(result.data.generatedAt).toISOString(),
      source: "ai",
    };
  });
}

export async function generateBeatVideo(
  beat: StoryBeat,
  options: {
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
    if (!beat.framePair?.firstFrameUrl) {
      throw new ValidationError("生成视频前必须先生成首尾帧");
    }

    if (!/^https?:\/\//.test(beat.framePair.firstFrameUrl) && !/^vcache:\/\//.test(beat.framePair.firstFrameUrl) && !/^\//.test(beat.framePair.firstFrameUrl)) {
      throw new ValidationError("首帧图片 URL 无效，请重新生成首尾帧");
    }

    const resolvedVideoMode: VideoGenerationMode =
      options.videoMode && options.videoMode !== "auto"
        ? options.videoMode
        : determineVideoGenerationMode(beat, options.prevBeat ?? null);

    let referenceVideo: string | null = null;
    if (resolvedVideoMode === "reference_video_continuation" && options.prevVideoUrl) {
      referenceVideo = options.prevVideoUrl;
    }

    const promptText = options.prompt || beat.content || beat.description || "";
    if (!promptText.trim()) {
      throw new ValidationError("无法生成视频：提示词为空，请填写分镜内容");
    }

    const videoParams: Record<string, unknown> = {
      prompt: promptText,
      firstFrameUrl: beat.framePair.firstFrameUrl,
      lastFrameUrl: beat.framePair.lastFrameUrl,
      characterRef: options.characterRef,
      sceneRef: options.sceneRef,
      duration: beat.duration,
      providerId: options.providerId,
      modelId: options.modelId,
    };
    if (referenceVideo) {
      videoParams.referenceVideo = referenceVideo;
    }

    const result = await providers.videoProvider.generateVideoWithFrames(
      videoParams as Parameters<IVideoProvider["generateVideoWithFrames"]>[0],
    );

    if (!result.success || !result.data) {
      throw new Error(result.error || "视频生成失败");
    }

    return {
      taskId: result.data.taskId ?? "",
      videoUrl: result.data.videoUrl,
      status: result.data.status || "pending",
      videoMode: resolvedVideoMode,
    };
  });
}

export async function generateBeatFullWorkflow(
  beat: StoryBeat,
  prevBeat: StoryBeat | null,
  options: {
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
    onProgress?.("生成预览图", 0.05);
    const keyframeResult = await generateBeatKeyframe(beat, prevBeat, {
      ...options,
      styleGuide: options.styleGuide,
    }, providers);
    if (!keyframeResult.ok) throw keyframeResult.error;
    const keyframe = keyframeResult.value;
    onProgress?.("生成预览图", 0.2);

    onProgress?.("生成帧提示词", 0.25);
    onProgress?.("生成首尾帧", 0.35);
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
    onProgress?.("生成首尾帧", 0.6);

    onProgress?.("判断视频生成模式", 0.65);
    const videoMode = determineVideoGenerationMode(beat, prevBeat);

    onProgress?.("生成视频", 0.7);
    const prevVideoUrl = prevBeat?.videoGen?.videoUrl || prevBeat?.uploadedVideo;
    const effectiveVideoMode = (videoMode === "reference_video_continuation" && !prevVideoUrl)
      ? "first_frame_anchor" as VideoGenerationMode
      : videoMode;
    const videoResult = await generateBeatVideo(
      { ...beat, keyframe, framePair },
      {
        ...options,
        videoMode: effectiveVideoMode,
        prevVideoUrl,
        prevBeat,
      },
      providers,
    );
    if (!videoResult.ok) throw videoResult.error;
    onProgress?.("生成视频", 0.9);

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
            `生成预览图失败 (beat ${beat.id}): ${extractErrorMessage(error)}`,
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
        { code: "FRAME_PAIR_CHAIN_NO_KEYFRAMES", message: `所有 ${beats.length} 个分镜都没有预览图，跳过首尾帧生成` },
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
          prevLastFrameUrl = framePairResult.value.lastFrame?.imageUrl || framePairResult.value.lastFrameUrl;
        }
      } catch (error) {
        errorLogger.error(
          new GenerationError(
            `生成首尾帧失败 (beat ${beat.id}): ${extractErrorMessage(error)}`,
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
