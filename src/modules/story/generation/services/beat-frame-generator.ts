import type { Result } from "@/domain/types";
import { fromAsyncThrowable, ValidationError } from "@/domain/types";
import type { StoryBeat, StoryBeatKeyframe, Character, Scene, StoryElement, StoryStyleGuide } from "@/domain/schemas";
import { generateBeatImagePrompt } from "@/domain/utils";
import { generateFramePrompts } from "./frame-prompt-service";
import { type ProviderDeps, buildStyleEnhancedPrompt } from "./video-generation-mode";

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
): Promise<Result<import("@/domain/schemas").StoryBeatFramePair>> {
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
