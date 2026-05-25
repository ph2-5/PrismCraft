import type {
  ApiResponse,
  VideoGenerationResult,
  ImageGenerationResult,
} from "@/domain/schemas/api";

export interface IVideoProvider {
  generateVideo(
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
  ): Promise<ApiResponse<VideoGenerationResult>>;

  queryVideoStatus(
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
  >;

  generateKeyframe(params: {
    characterRef?: string;
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
      source?: string;
      prompt?: string;
    }>
  >;

  generateFramePair(params: {
    keyframeUrl: string;
    keyframePrompt?: string;
    characterRef?: string;
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
  >;

  generateVideoWithFrames(params: {
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
  }): Promise<ApiResponse<VideoGenerationResult>>;
}

export interface IImageProvider {
  generateImage(
    prompt: string,
    type?: string,
    options?: {
      size?: string;
      providerId?: string;
      modelId?: string;
      purpose?: string;
    },
  ): Promise<ApiResponse<ImageGenerationResult>>;

  analyzeImage(
    imageUrl: string,
    type?: "character" | "scene",
    prompt?: string,
    options?: {
      providerId?: string;
      modelId?: string;
    },
  ): Promise<
    ApiResponse<{
      analysis: string;
      analyzed?: Record<string, unknown>;
    }>
  >;
}

export interface ITextProvider {
  generateText(
    prompt: string,
    options?: {
      maxTokens?: number;
      temperature?: number;
      providerId?: string;
      modelId?: string;
    },
  ): Promise<ApiResponse<{ text: string }>>;
}

export interface IFileUploader {
  uploadFile(file: File): Promise<
    | { success: true; data: { url: string; [key: string]: unknown }; source?: string; error?: string; message?: string }
    | { success: false; error: string; message?: string; data?: { url: string; [key: string]: unknown } }
  >;
}
