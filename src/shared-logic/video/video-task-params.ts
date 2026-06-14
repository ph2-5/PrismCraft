import {
  generateSingleBeatPrompt,
  generateQuickModeVideoPrompt,
  type CharacterInput,
  type SceneInput,
  type ElementInput,
  type BeatInput,
  type QuickModeParams,
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
  shotType?: string;
  camera?: { angle?: string; movement?: string };
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
      beat: beat as BeatInput | undefined,
      characters,
      scenes,
      elements,
      shotInstruction,
    });

  let enhancedPrompt = prompt;
  if (firstFrameUrl || lastFrameUrl) {
    const frameConstraints: string[] = [];
    if (firstFrameUrl)
      frameConstraints.push(
        "首帧画面：视频必须从首帧画面开始，保持角色姿态、表情、场景完全一致",
      );
    if (lastFrameUrl)
      frameConstraints.push(
        "尾帧画面：视频必须以尾帧画面结束，保持角色姿态、表情、场景完全一致",
      );
    enhancedPrompt = `${prompt}\n\n【首尾帧画面约束】\n${frameConstraints.join("\n")}`;
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
    } as QuickModeParams);

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
  const shotRequirement = {
    shotType: beat.shotType,
    cameraAngle: beat.camera?.angle,
    cameraMovement: beat.camera?.movement,
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
