import type { ApiResponse, VideoGenerationResult } from "@/domain/schemas";
import {
  generateVideo as generateVideoInternal,
  generateKeyframe,
  generateFramePair,
  queryVideoStatus,
} from "./video-service";

export async function generateVideo(
  prompt: string,
  options?: {
    firstFrameUrl?: string;
    lastFrameUrl?: string;
    characterRef?: string;
    sceneRef?: string;
    duration?: number;
    referenceVideo?: string | null;
    providerId?: string;
    modelId?: string;
    format?: string;
  },
): Promise<ApiResponse<VideoGenerationResult>> {
  return generateVideoInternal(prompt, {
    firstFrameUrl: options?.firstFrameUrl,
    lastFrameUrl: options?.lastFrameUrl,
    characterRef: options?.characterRef,
    sceneRef: options?.sceneRef,
    duration: options?.duration,
    referenceVideo: options?.referenceVideo
      ? { enabled: true, videoUrl: options.referenceVideo, mimicryLevel: "medium" }
      : undefined,
    providerId: options?.providerId,
    modelId: options?.modelId,
    format: options?.format,
  });
}

export async function generateVideoWithFrames(params: {
  prompt: string;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  characterRef?: string;
  sceneRef?: string;
  duration?: number;
  providerId?: string;
  modelId?: string;
  format?: string;
  referenceVideo?: string | null;
}): Promise<ApiResponse<VideoGenerationResult>> {
  return generateVideoInternal(params.prompt, {
    firstFrameUrl: params.firstFrameUrl,
    lastFrameUrl: params.lastFrameUrl,
    characterRef: params.characterRef,
    sceneRef: params.sceneRef,
    duration: params.duration,
    referenceVideo: params.referenceVideo
      ? { enabled: true, videoUrl: params.referenceVideo, mimicryLevel: "medium" }
      : undefined,
    providerId: params.providerId,
    modelId: params.modelId,
    format: params.format,
  });
}

export { generateKeyframe, generateFramePair, queryVideoStatus };