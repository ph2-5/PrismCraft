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

type FramePairOptions = {
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
};

type PreparedPrompts = {
  firstFramePrompt: string | undefined;
  lastFramePrompt: string | undefined;
  fullKeyframePrompt: string;
  useEnglish: boolean;
  hasPrevLastFrame: boolean;
};

async function autoGenerateMissingPrompts(
  beat: StoryBeat,
  options: FramePairOptions,
  providers: ProviderDeps,
  needFirst: boolean,
  needLast: boolean,
): Promise<{ first: string | undefined; last: string | undefined }> {
  if (
    options.autoGeneratePrompts === false ||
    (!needFirst && !needLast) ||
    !options.characters ||
    !options.scenes
  ) {
    return { first: undefined, last: undefined };
  }

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

  if (!promptResult.ok) {
    return { first: undefined, last: undefined };
  }

  return {
    first: needFirst ? promptResult.value.firstFramePrompt : undefined,
    last: needLast ? promptResult.value.lastFramePrompt : undefined,
  };
}

function applyPromptEnhancements(
  prompt: string | undefined,
  styleGuide: StoryStyleGuide | undefined,
  consistencyHint: string | undefined,
  llmGenerated: boolean,
  hasCharRef: boolean,
  hasSceneRef: boolean,
  useEnglish: boolean,
): string | undefined {
  if (!prompt) return prompt;

  let result = prompt;
  if (styleGuide && !llmGenerated) {
    result = buildStyleEnhancedPrompt(result, styleGuide);
  }
  if (consistencyHint) {
    result = `${result}\n[Consistency feedback: ${consistencyHint}]`;
  }
  return buildReferenceEnhancedPrompt(result, hasCharRef, hasSceneRef, useEnglish);
}

function resolveFallbackPrompts(
  beat: StoryBeat,
  firstFramePrompt: string | undefined,
  lastFramePrompt: string | undefined,
  hasPrevLastFrame: boolean,
): { first: string | undefined; last: string | undefined } {
  if (firstFramePrompt?.trim() || lastFramePrompt?.trim() || hasPrevLastFrame) {
    return { first: firstFramePrompt, last: lastFramePrompt };
  }

  const fallbackPrompt = beat.content || beat.description || beat.keyframe?.prompt;
  if (!fallbackPrompt?.trim()) {
    throw new ValidationError(t("error.framePairEmptyContent"));
  }
  return {
    first: firstFramePrompt || fallbackPrompt,
    last: lastFramePrompt || fallbackPrompt,
  };
}

function buildFullKeyframePrompt(
  beat: StoryBeat,
  options: FramePairOptions,
  hasCharRef: boolean,
  hasSceneRef: boolean,
  useEnglish: boolean,
): string {
  let fullKeyframePrompt = beat.keyframe?.prompt || "";
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
  return buildReferenceEnhancedPrompt(fullKeyframePrompt, hasCharRef, hasSceneRef, useEnglish);
}

async function prepareFramePrompts(
  beat: StoryBeat,
  options: FramePairOptions,
  providers: ProviderDeps,
): Promise<PreparedPrompts> {
  if (!beat.keyframe?.imageUrl) {
    throw new ValidationError(t("error.framePairRequiresKeyframe"));
  }

  const hasPrevLastFrame = !!options.prevLastFrameUrl;
  let firstFramePrompt = options.customFirstFramePrompt || beat.firstFramePrompt;
  let lastFramePrompt = options.customLastFramePrompt || beat.lastFramePrompt;

  const needAutoFirst = !firstFramePrompt && !options.customFirstFramePrompt;
  const needAutoLast = !lastFramePrompt && !options.customLastFramePrompt;

  const autoGenerated = await autoGenerateMissingPrompts(beat, options, providers, needAutoFirst, needAutoLast);
  if (autoGenerated.first) firstFramePrompt = autoGenerated.first;
  if (autoGenerated.last) lastFramePrompt = autoGenerated.last;

  const fallback = resolveFallbackPrompts(beat, firstFramePrompt, lastFramePrompt, hasPrevLastFrame);
  firstFramePrompt = fallback.first;
  lastFramePrompt = fallback.last;

  const llmGeneratedFirst = needAutoFirst && !!firstFramePrompt;
  const llmGeneratedLast = needAutoLast && !!lastFramePrompt;

  const hasCharRef = !!(options.characterRefs?.length || options.characterRef);
  const hasSceneRef = !!options.sceneRef;
  const useEnglish = options.modelId
    ? getVideoGenerationStrategy(options.modelId).promptLanguage === "en"
    : false;

  firstFramePrompt = applyPromptEnhancements(
    firstFramePrompt, options.styleGuide, options.consistencyHint,
    llmGeneratedFirst, hasCharRef, hasSceneRef, useEnglish,
  );
  lastFramePrompt = applyPromptEnhancements(
    lastFramePrompt, options.styleGuide, options.consistencyHint,
    llmGeneratedLast, hasCharRef, hasSceneRef, useEnglish,
  );

  const fullKeyframePrompt = buildFullKeyframePrompt(beat, options, hasCharRef, hasSceneRef, useEnglish);

  return {
    firstFramePrompt,
    lastFramePrompt,
    fullKeyframePrompt,
    useEnglish,
    hasPrevLastFrame,
  };
}

function buildKeyframePromptForProvider(prepared: PreparedPrompts): string {
  const { firstFramePrompt, lastFramePrompt, fullKeyframePrompt, useEnglish, hasPrevLastFrame } = prepared;

  if (hasPrevLastFrame || (!firstFramePrompt && !lastFramePrompt)) {
    const frameLabel = useEnglish
      ? { first: "First frame prompt: ", last: "Last frame prompt: " }
      : { first: "首帧提示：", last: "尾帧提示：" };
    const llmHint = firstFramePrompt && lastFramePrompt
      ? `${frameLabel.first}${firstFramePrompt}\n${frameLabel.last}${lastFramePrompt}\n`
      : "";
    return llmHint + fullKeyframePrompt;
  }

  if (firstFramePrompt && lastFramePrompt) {
    const frameLabel = useEnglish
      ? { first: "First frame prompt: ", last: "Last frame prompt: " }
      : { first: "首帧提示：", last: "尾帧提示：" };
    return `${frameLabel.first}${firstFramePrompt}\n${frameLabel.last}${lastFramePrompt}\n${fullKeyframePrompt}`;
  }

  return fullKeyframePrompt;
}

function resolveReturnPrompts(
  prepared: PreparedPrompts,
  resultFirstPrompt: string,
  resultLastPrompt: string,
): { firstFramePrompt: string; lastFramePrompt: string } {
  const { firstFramePrompt, lastFramePrompt, hasPrevLastFrame } = prepared;

  if (hasPrevLastFrame || (!firstFramePrompt && !lastFramePrompt)) {
    return {
      firstFramePrompt: firstFramePrompt || resultFirstPrompt,
      lastFramePrompt: lastFramePrompt || resultLastPrompt,
    };
  }

  if (firstFramePrompt && lastFramePrompt) {
    return { firstFramePrompt, lastFramePrompt };
  }

  return { firstFramePrompt: resultFirstPrompt, lastFramePrompt: resultLastPrompt };
}

export async function generateBeatFramePair(
  beat: StoryBeat,
  options: FramePairOptions,
  providers: ProviderDeps,
): Promise<Result<import("@/domain/schemas").StoryBeatFramePair>> {
  return fromAsyncThrowable(async () => {
    if (!beat.keyframe?.imageUrl) {
      throw new ValidationError(t("error.framePairRequiresKeyframe"));
    }

    const prepared = await prepareFramePrompts(beat, options, providers);
    const keyframePrompt = buildKeyframePromptForProvider(prepared);

    const result = await providers.videoProvider.generateFramePair({
      keyframeUrl: beat.keyframe.imageUrl,
      keyframePrompt,
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

    const { firstFramePrompt, lastFramePrompt } = resolveReturnPrompts(
      prepared,
      result.data.firstFrame.prompt,
      result.data.lastFrame.prompt,
    );

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
      firstFramePrompt,
      lastFramePrompt,
      generatedAt: new Date(result.data.generatedAt).toISOString(),
      source: "ai",
    };
  });
}
