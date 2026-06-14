export interface Beat {
  id: string;
  content?: string;
  description?: string;
  duration?: number;
  shotType?: string;
  camera?: { angle?: string; movement?: string };
  enhancedGeneration?: boolean;
  imageGenerationPrompt?: string;
  firstFramePrompt?: string;
  lastFramePrompt?: string;
  keyframe?: { imageUrl?: string; prompt?: string };
  framePair?: {
    firstFrame?: { imageUrl?: string };
    lastFrame?: { imageUrl?: string };
  };
}

interface KeyframeResult {
  imageUrl: string;
  prompt?: string;
  generatedAt?: string;
  referencedPrevKeyframe?: string;
}

interface FramePairResult {
  firstFrame: { imageUrl: string; prompt?: string; derivedFrom?: string };
  lastFrame: { imageUrl: string; prompt?: string; derivedFrom?: string };
  generatedAt: number;
}

interface VideoResult {
  taskId: string;
  videoUrl?: string;
  status: string;
}

interface StructuredError {
  code: string;
  message: string;
}

type ApiError = string | StructuredError;

function formatApiError(error: ApiError | undefined, fallback: string): string {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  return error.message || fallback;
}

export interface ApiGateway {
  generateKeyframe: (params: Record<string, unknown>) => Promise<{
    success: boolean;
    data?: { imageUrl: string; prompt?: string; generatedAt?: string };
    error?: ApiError;
  }>;
  generateImage: (params: Record<string, unknown>) => Promise<{
    success: boolean;
    data?: { imageUrl: string };
    error?: ApiError;
  }>;
  generateFramePair: (params: Record<string, unknown>) => Promise<{
    success: boolean;
    data?: {
      firstFrame: { imageUrl: string; prompt?: string };
      lastFrame: { imageUrl: string; prompt?: string };
      generatedAt: number;
    };
    error?: ApiError;
  }>;
  generateVideo: (params: Record<string, unknown>) => Promise<{
    success: boolean;
    data?: { taskId: string; videoUrl?: string; status?: string };
    error?: ApiError;
  }>;
  analyzeImage: (params: Record<string, unknown>) => Promise<{
    success: boolean;
    data?: { analysis?: string };
    error?: ApiError;
  }>;
  videoStatus: (params: Record<string, unknown>) => Promise<{
    success: boolean;
    data?: { status?: string; videoUrl?: string };
    error?: ApiError;
  }>;
}

type ProgressCallback = (stage: string, progress: number) => void;
type ChainProgressCallback = (
  index: number,
  total: number,
  beatId: string,
) => void;

export async function generateBeatKeyframe(
  apiGateway: ApiGateway,
  _promptService: unknown,
  beat: Beat,
  prevBeat?: Beat,
  options?: Record<string, unknown>,
): Promise<KeyframeResult> {
  const prevKeyframe = prevBeat?.keyframe?.imageUrl;

  const enhancedEnabled = beat.enhancedGeneration === true;
  const llmPrompt = enhancedEnabled ? beat.imageGenerationPrompt : undefined;

  const content = llmPrompt || beat.content || beat.description || "";

  const shotRequirement = {
    shotType: beat.shotType,
    cameraAngle: beat.camera?.angle,
    cameraMovement: beat.camera?.movement,
    action: content,
  };

  const result = await apiGateway.generateKeyframe({
    characterRef: (options as Record<string, unknown>)?.characterRef,
    sceneRef: (options as Record<string, unknown>)?.sceneRef,
    prevKeyframe,
    shotRequirement,
    content,
    providerId: (options as Record<string, unknown>)?.providerId,
    modelId: (options as Record<string, unknown>)?.modelId,
  });

  if (!result.success || !result.data) {
    throw new Error(formatApiError(result.error, "预览图生成失败"));
  }

  return {
    imageUrl: result.data.imageUrl,
    prompt: result.data.prompt,
    generatedAt: result.data.generatedAt,
    referencedPrevKeyframe: prevBeat ? prevBeat.id : undefined,
  };
}

export async function generateBeatFramePair(
  apiGateway: ApiGateway,
  _promptService: unknown,
  beat: Beat,
  options?: Record<string, unknown>,
): Promise<FramePairResult> {
  if (!beat.keyframe?.imageUrl) {
    throw new Error("生成首尾帧前必须先生成预览图");
  }

  const enhancedEnabled = beat.enhancedGeneration === true;
  const firstFramePrompt = enhancedEnabled ? beat.firstFramePrompt : undefined;
  const lastFramePrompt = enhancedEnabled ? beat.lastFramePrompt : undefined;

  if (firstFramePrompt && lastFramePrompt) {
    const imageOpts: Record<string, unknown> = { category: "scene" };
    if ((options as Record<string, unknown>)?.providerId)
      imageOpts.providerId = (options as Record<string, unknown>)?.providerId;
    if ((options as Record<string, unknown>)?.modelId)
      imageOpts.modelId = (options as Record<string, unknown>)?.modelId;

    const results = await Promise.allSettled([
      apiGateway.generateImage({ prompt: firstFramePrompt, ...imageOpts }),
      apiGateway.generateImage({ prompt: lastFramePrompt, ...imageOpts }),
    ]);

    const firstResult =
      results[0].status === "fulfilled" ? results[0].value : null;
    const lastResult =
      results[1].status === "fulfilled" ? results[1].value : null;

    const errors: string[] = [];
    if (!firstResult?.success || !firstResult.data?.imageUrl) {
      errors.push(formatApiError(firstResult?.error, "首帧生成失败"));
    }
    if (!lastResult?.success || !lastResult.data?.imageUrl) {
      errors.push(formatApiError(lastResult?.error, "尾帧生成失败"));
    }
    if (errors.length > 0) {
      throw new Error(errors.join("; "));
    }

    return {
      firstFrame: {
        imageUrl: firstResult?.data?.imageUrl ?? "",
        prompt: firstFramePrompt,
        derivedFrom: beat.keyframe.imageUrl,
      },
      lastFrame: {
        imageUrl: lastResult?.data?.imageUrl ?? "",
        prompt: lastFramePrompt,
        derivedFrom: beat.keyframe.imageUrl,
      },
      generatedAt: Date.now(),
    };
  }

  const result = await apiGateway.generateFramePair({
    keyframeUrl: beat.keyframe.imageUrl,
    keyframePrompt: beat.keyframe.prompt,
    characterRef: (options as Record<string, unknown>)?.characterRef,
    sceneRef: (options as Record<string, unknown>)?.sceneRef,
    actionDescription: beat.content || beat.description,
    duration: beat.duration,
    providerId: (options as Record<string, unknown>)?.providerId,
    modelId: (options as Record<string, unknown>)?.modelId,
  });

  if (!result.success || !result.data) {
    throw new Error(formatApiError(result.error, "首尾帧生成失败"));
  }

  return {
    firstFrame: {
      imageUrl: result.data.firstFrame.imageUrl,
      prompt: result.data.firstFrame.prompt,
      derivedFrom: beat.keyframe.imageUrl,
    },
    lastFrame: {
      imageUrl: result.data.lastFrame.imageUrl,
      prompt: result.data.lastFrame.prompt,
      derivedFrom: beat.keyframe.imageUrl,
    },
    generatedAt: result.data.generatedAt,
  };
}

export async function generateBeatVideo(
  apiGateway: ApiGateway,
  beat: Beat,
  options?: Record<string, unknown>,
): Promise<VideoResult> {
  if (!beat.framePair?.firstFrame?.imageUrl) {
    throw new Error("生成视频前必须先生成首尾帧");
  }

  const result = await apiGateway.generateVideo({
    prompt:
      (options as Record<string, unknown>)?.prompt ||
      beat.content ||
      beat.description ||
      "动画视频",
    firstFrameUrl: beat.framePair.firstFrame.imageUrl,
    lastFrameUrl: beat.framePair.lastFrame?.imageUrl,
    characterRef: (options as Record<string, unknown>)?.characterRef,
    sceneRef: (options as Record<string, unknown>)?.sceneRef,
    duration: beat.duration,
    providerId: (options as Record<string, unknown>)?.providerId,
    modelId: (options as Record<string, unknown>)?.modelId,
  });

  if (!result.success || !result.data) {
    throw new Error(formatApiError(result.error, "视频生成失败"));
  }

  return {
    taskId: result.data.taskId,
    videoUrl: result.data.videoUrl,
    status: result.data.status || "pending",
  };
}

export async function generateBeatFullWorkflow(
  apiGateway: ApiGateway,
  promptService: unknown,
  beat: Beat,
  prevBeat: Beat | undefined,
  options: Record<string, unknown>,
  onProgress?: ProgressCallback,
): Promise<{
  keyframe: KeyframeResult;
  framePair: FramePairResult;
  videoTaskId: string;
}> {
  const keyframe = await generateBeatKeyframe(
    apiGateway,
    promptService,
    beat,
    prevBeat,
    options,
  );
  onProgress?.("生成预览图", 0.3);

  const updatedBeat = { ...beat, keyframe };
  const framePair = await generateBeatFramePair(
    apiGateway,
    promptService,
    updatedBeat,
    options,
  );
  onProgress?.("生成首尾帧", 0.6);

  const beatWithFrames = { ...beat, keyframe, framePair };
  const videoResult = await generateBeatVideo(apiGateway, beatWithFrames, options);
  onProgress?.("生成视频", 0.9);

  return {
    keyframe,
    framePair,
    videoTaskId: videoResult.taskId,
  };
}

export async function generateKeyframeChain(
  apiGateway: ApiGateway,
  promptService: unknown,
  beats: Beat[],
  options: {
    getCharacterRef?: (beat: Beat) => string | undefined;
    getSceneRef?: (beat: Beat) => string | undefined;
    providerId?: string;
    modelId?: string;
  },
  onProgress?: ChainProgressCallback,
): Promise<Record<string, KeyframeResult>> {
  const results: Record<string, KeyframeResult> = {};
  let prevBeat: Beat | undefined;

  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i]!;
    onProgress?.(i, beats.length, beat.id);

    try {
      const keyframe = await generateBeatKeyframe(
        apiGateway,
        promptService,
        beat,
        prevBeat,
        {
          characterRef: options.getCharacterRef?.(beat),
          sceneRef: options.getSceneRef?.(beat),
          providerId: options.providerId,
          modelId: options.modelId,
        },
      );
      results[beat.id] = keyframe;
      prevBeat = { ...beat, keyframe };
    } catch {
      /* no-op — errors are silently skipped in chain generation */
    }
  }

  return results;
}
