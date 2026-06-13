import type { Result } from "@/domain/types";
import { fromAsyncThrowable, ValidationError } from "@/domain/types";
import type { StoryBeat, StoryBeatKeyframe, Character, Scene, StoryElement, StoryStyleGuide } from "@/domain/schemas";
import { generateBeatImagePrompt } from "@/domain/utils";
import { generateFramePrompts } from "./frame-prompt-service";
import { type ProviderDeps, buildStyleEnhancedPrompt } from "./video-generation-mode";
import { getVideoGenerationStrategy } from "@/shared/model-capabilities";
import { t } from "@/shared/constants";

function buildReferenceEnhancedPrompt(
  basePrompt: string,
  hasCharacterRef: boolean,
  hasSceneRef: boolean,
  useEnglish: boolean = false,
): string {
  const instructions: string[] = [];

  if (hasCharacterRef) {
    instructions.push(
      useEnglish
        ? "CRITICAL: The character in this image MUST strictly match the appearance (face, hair, clothing, body type) shown in the provided character reference image. This is the highest priority requirement."
        : "关键要求：本图中的角色必须严格匹配提供的角色参考图中的外观（面部、发型、服装、体型），这是最高优先级要求。",
    );
  }

  if (hasSceneRef) {
    instructions.push(
      useEnglish
        ? "The scene environment, lighting, and color tone MUST match the provided scene reference image."
        : "场景环境、光照和色调必须匹配提供的场景参考图。",
    );
  }

  if (instructions.length === 0) return basePrompt;
  return `${instructions.join("\n")}\n\n${basePrompt}`;
}

export async function generateBeatKeyframe(
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
      throw new ValidationError(t("error.keyframeEmptyContent"));
    }

    content = buildStyleEnhancedPrompt(content, options.styleGuide);
    const keyframeUseEnglish = options.modelId
      ? getVideoGenerationStrategy(options.modelId).promptLanguage === "en"
      : false;
    content = buildReferenceEnhancedPrompt(
      content,
      !!(options.characterRefs?.length || options.characterRef),
      !!options.sceneRef,
      keyframeUseEnglish,
    );

    const result = await providers.videoProvider.generateKeyframe({
      characterRef: options.characterRefs?.[0] || options.characterRef,
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
      throw new Error(result.error || t("error.keyframeGenFailed"));
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
    characterRefs?: string[];
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
    consistencyHint?: string;
  },
  providers: ProviderDeps,
): Promise<Result<import("@/domain/schemas").StoryBeatFramePair>> {
  return fromAsyncThrowable(async () => {
    if (!beat.keyframe?.imageUrl) {
      throw new ValidationError(t("error.framePairRequiresKeyframe"));
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
        throw new ValidationError(t("error.framePairEmptyContent"));
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

    if (options.consistencyHint && firstFramePrompt) {
      firstFramePrompt = `${firstFramePrompt}\n[Consistency feedback: ${options.consistencyHint}]`;
    }
    if (options.consistencyHint && lastFramePrompt) {
      lastFramePrompt = `${lastFramePrompt}\n[Consistency feedback: ${options.consistencyHint}]`;
    }

    const hasCharRef = !!(options.characterRefs?.length || options.characterRef);
    const hasSceneRef = !!options.sceneRef;
    const frameUseEnglish = options.modelId
      ? getVideoGenerationStrategy(options.modelId).promptLanguage === "en"
      : false;

    if (firstFramePrompt) {
      firstFramePrompt = buildReferenceEnhancedPrompt(firstFramePrompt, hasCharRef, hasSceneRef, frameUseEnglish);
    }
    if (lastFramePrompt) {
      lastFramePrompt = buildReferenceEnhancedPrompt(lastFramePrompt, hasCharRef, hasSceneRef, frameUseEnglish);
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
    fullKeyframePrompt = buildReferenceEnhancedPrompt(fullKeyframePrompt, hasCharRef, hasSceneRef, frameUseEnglish);

    const frameLabel = frameUseEnglish
      ? { first: "First frame prompt: ", last: "Last frame prompt: " }
      : { first: "首帧提示：", last: "尾帧提示：" };

    if (options.prevLastFrameUrl || (!firstFramePrompt && !lastFramePrompt)) {
      const llmHint = firstFramePrompt && lastFramePrompt
        ? `${frameLabel.first}${firstFramePrompt}\n${frameLabel.last}${lastFramePrompt}\n`
        : "";

      const result = await providers.videoProvider.generateFramePair({
        keyframeUrl: beat.keyframe.imageUrl,
        keyframePrompt: llmHint + fullKeyframePrompt,
        characterRef: options.characterRefs?.[0] || options.characterRef,
        sceneRef: options.sceneRef,
        prevLastFrameUrl: options.prevLastFrameUrl,
        actionDescription: beat.content || beat.description,
        duration: beat.duration,
        providerId: options.providerId,
        modelId: options.modelId,
      });

      if (!result.success || !result.data) {
        throw new Error(result.error || t("error.framePairGenFailed"));
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
      const combinedKeyframePrompt = `${frameLabel.first}${firstFramePrompt}\n${frameLabel.last}${lastFramePrompt}\n${fullKeyframePrompt}`;

      const result = await providers.videoProvider.generateFramePair({
        keyframeUrl: beat.keyframe.imageUrl,
        keyframePrompt: combinedKeyframePrompt,
        characterRef: options.characterRefs?.[0] || options.characterRef,
        sceneRef: options.sceneRef,
        actionDescription: beat.content || beat.description,
        duration: beat.duration,
        providerId: options.providerId,
        modelId: options.modelId,
      });

      if (!result.success || !result.data) {
        throw new Error(result.error || t("error.framePairGenFailed"));
      }

      return {
        firstFrame: {
          imageUrl: result.data.firstFrame.imageUrl,
          prompt: firstFramePrompt,
          derivedFrom: beat.keyframe?.imageUrl || "",
        },
        lastFrame: {
          imageUrl: result.data.lastFrame.imageUrl,
          prompt: lastFramePrompt,
          derivedFrom: result.data.firstFrame.imageUrl,
        },
        firstFrameUrl: result.data.firstFrame.imageUrl,
        lastFrameUrl: result.data.lastFrame.imageUrl,
        firstFramePrompt,
        lastFramePrompt,
        generatedAt: new Date(result.data.generatedAt).toISOString(),
        source: "ai",
      };
    }

    const result = await providers.videoProvider.generateFramePair({
      keyframeUrl: beat.keyframe.imageUrl,
      keyframePrompt: fullKeyframePrompt,
      characterRef: options.characterRefs?.[0] || options.characterRef,
      sceneRef: options.sceneRef,
      actionDescription: beat.content || beat.description,
      duration: beat.duration,
      providerId: options.providerId,
      modelId: options.modelId,
    });

    if (!result.success || !result.data) {
      throw new Error(result.error || t("error.framePairGenFailed"));
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
