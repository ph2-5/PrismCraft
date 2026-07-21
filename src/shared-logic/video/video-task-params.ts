import {
  generateSingleBeatPrompt,
  generateQuickModeVideoPrompt,
  type CharacterInput,
  type SceneInput,
  type ElementInput,
} from "../prompt/prompt-service";

interface Beat {
  id: string;
  storyId?: string;
  content?: string;
  description?: string;
  duration?: number;
  imageGenerationPrompt?: string;
  firstFramePrompt?: string;
  lastFramePrompt?: string;
  // PR 7：shotType/camera.angle/camera.movement 已删除，只保留 shotInstruction
  shotInstruction?: {
    shotSize?: string;
    cameraAngle?: string;
    cameraMovement?: string;
  };
  framePair?: { firstFrame?: { imageUrl?: string }; lastFrame?: { imageUrl?: string } };
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  keyframe?: { imageUrl?: string; prompt?: string };
}

interface VideoGenerationParams {
  prompt: string;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  duration: number;
  providerId?: string;
  modelId?: string;
  beatId?: string;
  storyId?: string;
}

function enhancePromptWithFrameConstraints(
  prompt: string,
  firstFrameUrl?: string,
  lastFrameUrl?: string,
): string {
  if (!firstFrameUrl && !lastFrameUrl) return prompt;
  const frameConstraints: string[] = [];
  if (firstFrameUrl)
    frameConstraints.push(
      "首帧画面：视频必须从首帧画面开始，保持角色姿态、表情、场景完全一致",
    );
  if (lastFrameUrl)
    frameConstraints.push(
      "尾帧画面：视频必须以尾帧画面结束，保持角色姿态、表情、场景完全一致",
    );
  return `${prompt}\n\n【首尾帧画面约束】\n${frameConstraints.join("\n")}`;
}

export function buildVideoGenerationParams(params: {
  beat?: Beat;
  characters?: CharacterInput[];
  scenes?: SceneInput[];
  elements?: ElementInput[];
  shotInstruction?: string;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  duration?: number;
  providerId?: string;
  modelId?: string;
  videoPrompt?: string;
}): VideoGenerationParams {
  const {
    beat,
    characters = [],
    scenes = [],
    elements = [],
    shotInstruction,
    firstFrameUrl,
    lastFrameUrl,
    duration,
    providerId,
    modelId,
    videoPrompt: prebuiltPrompt,
  } = params;

  const prompt =
    prebuiltPrompt ||
    generateSingleBeatPrompt({
      beat,
      characters,
      scenes,
      elements,
      shotInstruction,
    });

  const enhancedPrompt = enhancePromptWithFrameConstraints(prompt, firstFrameUrl, lastFrameUrl);

  // Empty-prompt guard: previously this function returned a params object
  // even when prompt was an empty string (e.g., when beat/characters/scenes
  // were all undefined due to upstream schema issues). The api-gateway only
  // rejects truly empty strings, so a prompt with only "[Quality Requirements]"
  // could slip through. Explicitly reject here so callers see the real cause.
  if (!enhancedPrompt.trim()) {
    throw new Error("EMPTY_GENERATED_PROMPT");
  }

  return {
    prompt: enhancedPrompt,
    firstFrameUrl:
      firstFrameUrl || beat?.framePair?.firstFrame?.imageUrl || beat?.firstFrameUrl,
    lastFrameUrl:
      lastFrameUrl || beat?.framePair?.lastFrame?.imageUrl || beat?.lastFrameUrl,
    duration: duration || beat?.duration || 5,
    providerId,
    modelId,
    beatId: beat?.id,
    storyId: beat?.storyId,
  };
}

export function buildQuickVideoParams(params: {
  prompt?: string;
  duration?: number;
  resolution?: string;
  style?: string;
  characters?: CharacterInput[];
  scene?: SceneInput;
  referenceImage?: string;
  providerId?: string;
  modelId?: string;
  videoPrompt?: string;
}): Omit<VideoGenerationParams, "firstFrameUrl" | "lastFrameUrl" | "beatId" | "storyId"> & {
  referenceImageUrl?: string;
} {
  const {
    prompt,
    duration,
    resolution,
    style,
    characters = [],
    scene,
    referenceImage,
    providerId,
    modelId,
    videoPrompt: prebuiltPrompt,
  } = params;

  const videoPrompt =
    prebuiltPrompt ||
    generateQuickModeVideoPrompt({
      prompt: prompt || "",
      duration,
      resolution,
      style,
      characters,
      scene,
      referenceImage,
    });

  return {
    prompt: videoPrompt,
    duration: duration ?? 5,
    providerId,
    modelId,
    referenceImageUrl: referenceImage,
  };
}

export function buildKeyframeGenerationParams(params: {
  beat: Beat;
  prevBeat?: Beat;
  characterRef?: string;
  sceneRef?: string;
  providerId?: string;
  modelId?: string;
}): {
  prompt: string;
  characterRef?: string;
  sceneRef?: string;
  prevKeyframe?: string;
  shotRequirement: Record<string, unknown>;
  providerId?: string;
  modelId?: string;
  beatId: string;
} {
  const { beat, prevBeat, characterRef, sceneRef, providerId, modelId } = params;

  const content =
    beat.imageGenerationPrompt || beat.content || beat.description || "";
  // PR 7：shotRequirement 字段名统一为 shotSize（与 ShotInstructionTemplate 一致）
  const shotRequirement = {
    shotSize: beat.shotInstruction?.shotSize,
    cameraAngle: beat.shotInstruction?.cameraAngle,
    cameraMovement: beat.shotInstruction?.cameraMovement,
    action: content,
  };

  return {
    prompt: content,
    characterRef,
    sceneRef,
    prevKeyframe: prevBeat?.keyframe?.imageUrl,
    shotRequirement,
    providerId,
    modelId,
    beatId: beat.id,
  };
}

export function buildFramePairGenerationParams(params: {
  beat: Beat;
  characterRef?: string;
  sceneRef?: string;
  providerId?: string;
  modelId?: string;
}): {
  firstFrame: {
    prompt?: string;
    keyframePrompt: string;
    actionDescription: string;
    characterRef?: string;
    sceneRef?: string;
  };
  lastFrame: {
    prompt?: string;
    keyframePrompt: string;
    actionDescription: string;
    characterRef?: string;
    sceneRef?: string;
    duration?: number;
  };
  providerId?: string;
  modelId?: string;
  beatId: string;
} {
  const { beat, characterRef, sceneRef, providerId, modelId } = params;

  const keyframePrompt =
    beat.keyframe?.prompt || beat.imageGenerationPrompt || "";
  const actionDescription = beat.content || beat.description || "";

  return {
    firstFrame: {
      prompt: beat.firstFramePrompt || undefined,
      keyframePrompt,
      actionDescription,
      characterRef,
      sceneRef,
    },
    lastFrame: {
      prompt: beat.lastFramePrompt || undefined,
      keyframePrompt,
      actionDescription,
      characterRef,
      sceneRef,
      duration: beat.duration,
    },
    providerId,
    modelId,
    beatId: beat.id,
  };
}
