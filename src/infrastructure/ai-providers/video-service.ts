import type { ApiResponse, VideoGenerationResult } from "@/domain/schemas";
import { AppError } from "@/domain/types";
import { errorLogger, extractErrorMessage } from "@/shared/error-logger";
import { apiCallWithRetry, ApiClientError } from "./core";
import { resolveCapability, safeTruncatePrompt } from "./config";
import { imageToBase64 } from "./utils";
import type {
  VideoGenerationRequestBody,
  FramePairGenerationRequestBody,
  KeyframeGenerationRequestBody,
  VideoStatusRequestBody,
} from "./types";

function isLocalUrl(url: string): boolean {
  return url.startsWith("blob:") || url.startsWith("data:") || url.startsWith("file://") || url.startsWith("/");
}

async function normalizeImageToBase64(url?: string): Promise<string | undefined> {
  if (!url) return undefined;
  try {
    if (typeof window !== "undefined") {
      return await imageToBase64(url);
    }
    return url;
  } catch (error) {
    errorLogger.warn(
      new AppError("IMAGE_BASE64_ERROR", "图片转 base64 失败，使用原始URL", error),
      "VideoService",
    );
    return url;
  }
}

export async function generateVideo(
  prompt: string,
  options?: {
    firstFrameUrl?: string;
    lastFrameUrl?: string;
    characterRefs?: string[];
    sceneRef?: string;
    duration?: number;
    referenceVideo?: { enabled: boolean; videoUrl: string; mimicryLevel?: string };
    providerId?: string;
    modelId?: string;
    format?: string;
  },
): Promise<ApiResponse<VideoGenerationResult>> {
  const finalFirstFrameUrl = await normalizeImageToBase64(options?.firstFrameUrl);
  const finalLastFrameUrl = await normalizeImageToBase64(options?.lastFrameUrl);

  const { truncated: safePrompt, wasTruncated } = safeTruncatePrompt(prompt);

  const requestBody: VideoGenerationRequestBody = {
    prompt: safePrompt,
    firstFrameUrl: finalFirstFrameUrl,
    lastFrameUrl: finalLastFrameUrl,
    characterRefs: options?.characterRefs,
    sceneRef: options?.sceneRef,
    duration: options?.duration ?? 5,
    promptWasTruncated: wasTruncated,
  };

  if (options?.referenceVideo?.enabled && options.referenceVideo.videoUrl) {
    const refUrl = options.referenceVideo.videoUrl;
    if (isLocalUrl(refUrl)) {
      errorLogger.warn(
        new AppError("LOCAL_URL_SKIPPED", `[VideoService] referenceVideo URL is local, skipping (API providers cannot access local URLs): ${refUrl.substring(0, 50)}`),
        "VideoService",
      );
    } else {
      requestBody.referenceVideo = {
        enabled: true,
        videoUrl: refUrl,
        mimicryLevel: options.referenceVideo.mimicryLevel ?? "medium",
      };
    }
  }

  if (options?.providerId && options?.modelId) {
    requestBody.providerId = options.providerId;
    requestBody.modelId = options.modelId;
    requestBody.format = options.format;
  } else {
    const { provider, model } = await resolveCapability("video");
    requestBody.providerId = provider.id;
    requestBody.modelId = model.id;
  }

  try {
    const result = await apiCallWithRetry<ApiResponse<VideoGenerationResult>>(
      "generate-video",
      {
        method: "POST",
        body: JSON.stringify(requestBody),
        timeout: 600000,
      },
    );
    if (result.success && result.data && wasTruncated) {
      result.data.promptWasTruncated = true;
      result.data.originalPromptLength = prompt.length;
    }
    return result;
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new Error(extractErrorMessage(error));
  }
}

export async function generateKeyframe(params: {
  characterRefs?: string[];
  sceneRef?: string;
  prevKeyframe?: string;
  shotRequirement?: {
    shotType?: string;
    cameraAngle?: string;
    cameraMovement?: string;
    action?: string;
  };
  content?: string;
  providerId?: string;
  modelId?: string;
  format?: string;
}): Promise<
  ApiResponse<{
    imageUrl: string;
    prompt: string;
    generatedAt: number;
    referencedPrevKeyframe: boolean;
    referenceCount: number;
  }>
> {
  const requestBody: KeyframeGenerationRequestBody = {
    characterRef: params.characterRefs?.[0],
    characterRefs: params.characterRefs,
    sceneRef: params.sceneRef,
    prevKeyframe: params.prevKeyframe,
    shotRequirement: params.shotRequirement,
    content: params.content,
  };

  if (params.providerId && params.modelId) {
    requestBody.providerId = params.providerId;
    requestBody.modelId = params.modelId;
    requestBody.format = params.format;
  } else {
    const { provider, model } = await resolveCapability("image");
    requestBody.providerId = provider.id;
    requestBody.modelId = model.id;
  }

  return apiCallWithRetry<
    ApiResponse<{
      imageUrl: string;
      prompt: string;
      generatedAt: number;
      referencedPrevKeyframe: boolean;
      referenceCount: number;
    }>
  >("generate-keyframe", {
    method: "POST",
    body: JSON.stringify(requestBody),
    timeout: 120000,
  });
}

export async function generateFramePair(params: {
  keyframeUrl: string;
  keyframePrompt?: string;
  characterRefs?: string[];
  sceneRef?: string;
  prevLastFrameUrl?: string;
  actionDescription?: string;
  duration?: number;
  providerId?: string;
  modelId?: string;
  format?: string;
}): Promise<
  ApiResponse<{
    firstFrame: {
      imageUrl: string;
      prompt: string;
      derivedFrom: string;
    };
    lastFrame: {
      imageUrl: string;
      prompt: string;
      derivedFrom: string;
    };
    generatedAt: number;
  }>
> {
  const requestBody: FramePairGenerationRequestBody = {
    keyframeUrl: params.keyframeUrl,
    keyframePrompt: params.keyframePrompt,
    characterRef: params.characterRefs?.[0],
    characterRefs: params.characterRefs,
    sceneRef: params.sceneRef,
    prevLastFrameUrl: params.prevLastFrameUrl,
    actionDescription: params.actionDescription,
    duration: params.duration,
  };

  if (params.providerId && params.modelId) {
    requestBody.providerId = params.providerId;
    requestBody.modelId = params.modelId;
    requestBody.format = params.format;
  } else {
    const { provider, model } = await resolveCapability("image");
    requestBody.providerId = provider.id;
    requestBody.modelId = model.id;
  }

  return apiCallWithRetry<
    ApiResponse<{
      firstFrame: {
        imageUrl: string;
        prompt: string;
        derivedFrom: string;
      };
      lastFrame: {
        imageUrl: string;
        prompt: string;
        derivedFrom: string;
      };
      generatedAt: number;
    }>
  >("generate-frame-pair", {
    method: "POST",
    body: JSON.stringify(requestBody),
    timeout: 240000,
  });
}

export async function queryVideoStatus(
  taskId: string,
  options?: {
    providerId?: string;
    modelId?: string;
    format?: string;
  },
): Promise<
  ApiResponse<{
    status: "pending" | "generating" | "completed" | "failed";
    videoUrl?: string;
    progress?: number;
    message?: string;
  }>
> {
  const requestBody: VideoStatusRequestBody = { taskId };

  if (options?.providerId) {
    const { provider, model } = await resolveCapability(
      "video",
      undefined,
      options.providerId,
      options.modelId,
    );
    requestBody.providerId = provider.id;
    requestBody.modelId = model.id;
  } else {
    const { provider, model } = await resolveCapability("video");
    requestBody.providerId = provider.id;
    requestBody.modelId = model.id;
  }

  return apiCallWithRetry<
    ApiResponse<{
      status: "pending" | "generating" | "completed" | "failed";
      videoUrl?: string;
      progress?: number;
      message?: string;
    }>
  >("video-status", {
    method: "POST",
    body: JSON.stringify(requestBody),
  });
}