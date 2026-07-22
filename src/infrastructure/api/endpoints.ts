import { apiClient } from "./client";
import type { Result } from "@/domain/types";
import type { ImageGenerationResult, VideoGenerationResult } from "@/domain/schemas";

export const imageApi = {
  async generate(prompt: string, style: string = "scene", providerId?: string, modelId?: string): Promise<Result<ImageGenerationResult>> {
    return apiClient.post<ImageGenerationResult>("generate-image", {
      prompt,
      style,
      providerId,
      modelId,
    }, 120000);
  },

  async analyze(imageUrl: string, type: string = "scene", prompt?: string, providerId?: string, modelId?: string, referenceImageUrls?: string[]): Promise<Result<{ analysis: string }>> {
    return apiClient.post<{ analysis: string }>("analyze-image", {
      imageUrl,
      type,
      prompt,
      providerId,
      modelId,
      // PrismCraft 第三章: 参考图 URL 数组，供 VLM 多图比对（角色参考图 + 生成图）
      referenceImageUrls,
    });
  },
};

export const videoApi = {
  async generate(params: {
    prompt: string;
    duration?: number;
    firstFrameUrl?: string;
    providerId?: string;
    modelId?: string;
    format?: string;
  }): Promise<Result<VideoGenerationResult>> {
    return apiClient.post<VideoGenerationResult>("generate-video", params, 600000);
  },

  async queryStatus(taskId: string, providerId?: string, modelId?: string, format?: string): Promise<Result<VideoGenerationResult>> {
    return apiClient.post<VideoGenerationResult>("video-status", { taskId, providerId, modelId, format });
  },

  async generateKeyframe(params: {
    prompt: string;
    referenceImageUrl?: string;
    providerId?: string;
    modelId?: string;
  }): Promise<Result<ImageGenerationResult>> {
    return apiClient.post<ImageGenerationResult>("generate-keyframe", params, 120000);
  },

  async generateFramePair(params: {
    prompt: string;
    firstFramePrompt?: string;
    lastFramePrompt?: string;
    referenceLastFrameUrl?: string;
    providerId?: string;
    modelId?: string;
  }): Promise<Result<{ firstFrameUrl: string; lastFrameUrl: string }>> {
    return apiClient.post<{ firstFrameUrl: string; lastFrameUrl: string }>("generate-frame-pair", params, 120000);
  },
};

export const textApi = {
  async generate(prompt: string, options?: { maxTokens?: number; temperature?: number; providerId?: string; modelId?: string }): Promise<Result<{ text: string }>> {
    return apiClient.post<{ text: string }>("generate-text", {
      prompt,
      ...options,
    });
  },
};

export const configApi = {
  async getStatus(): Promise<Result<unknown>> {
    return apiClient.get("config");
  },

  async testConnection(capability: string, providerId?: string, modelId?: string): Promise<Result<{ success: boolean; message: string }>> {
    return apiClient.post<{ success: boolean; message: string }>("test-connection", {
      capability,
      providerId,
      modelId,
    });
  },
};
