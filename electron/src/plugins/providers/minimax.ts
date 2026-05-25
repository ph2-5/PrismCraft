import { BaseAIProviderPlugin } from "../base-provider";
import type {
  AIProviderPlugin,
  ModelCapabilities,
  VideoBuildContext,
  ImageBuildContext,
  VisionBuildContext,
  VideoRequestResult,
  ImageRequestResult,
  VisionRequestResult,
  ImageTransportMode,
  ImagePurpose,
  CloudProviderInfo,
} from "../types";

export class MiniMaxPlugin extends BaseAIProviderPlugin implements AIProviderPlugin {
  readonly id = "minimax";
  readonly displayName = "MiniMax (Hailuo)";

  match(apiUrl: string, model?: string): boolean {
    return apiUrl.includes("minimaxi.com") || (model?.includes("hailuo") ?? false);
  }

  readonly videoCapabilities = {
    supportsLastFrame: false,
    supportsReferenceVideo: false,
    supportsMimicryLevel: false,
    defaultModel: "hailuo-2.3",
    maxDuration: 10,
    supportedCodecs: ["h264", "h265"],
    urlTtl: 86400,
  };

  readonly imageCapabilities = {
    supportsReferenceImage: false,
    defaultModel: "hailuo-2.3",
  };

  getModelCapabilities(_modelId: string): ModelCapabilities {
    return {
      maxReferences: 4,
      maxResolution: 2048,
      maxSizeMB: 10,
      supportsLastFrame: false,
      referenceMode: "separate",
      defaultImageSize: "1920x1920",
      supportedImageSizes: [
        { width: 1920, height: 1920, label: "1920×1920", aspectRatio: "1:1" },
      ],
    };
  }

  buildVideoRequest(ctx: VideoBuildContext): VideoRequestResult {
    let prompt = ctx.prompt;
    if (ctx.characterRef) {
      prompt += `[参考角色图: ${ctx.characterRef}]`;
    }
    if (ctx.sceneRef) {
      prompt += `[参考场景图: ${ctx.sceneRef}]`;
    }

    const body: Record<string, unknown> = {
      model: ctx.model || this.videoCapabilities.defaultModel,
      prompt,
    };

    if (ctx.firstFrameUrl) {
      body.image_url = ctx.firstFrameUrl;
    }

    return {
      body,
      endpoint: "/video_generation/task",
    };
  }

  buildImageRequest(ctx: ImageBuildContext): ImageRequestResult {
    return {
      body: {
        model: ctx.model || this.imageCapabilities.defaultModel,
        prompt: ctx.prompt,
        n: 1,
        size: ctx.size,
      },
      endpoint: "/images/generations",
    };
  }

  buildVisionRequest(ctx: VisionBuildContext): VisionRequestResult {
    return {
      body: {
        model: ctx.model || "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: ctx.prompt },
              { type: "image_url", image_url: { url: ctx.imageUrl } },
            ],
          },
        ],
      },
      endpoint: "/chat/completions",
    };
  }

  getImageTransportMode(_purpose: ImagePurpose): ImageTransportMode {
    return "url";
  }

  extractTaskId(data: Record<string, unknown>): string | undefined {
    return (
      (data.task_id as string | undefined) ||
      (data.id as string | undefined)
    );
  }

  getVideoStatusEndpoint(
    baseUrl: string,
    taskId: string,
    _model?: string,
  ): string {
    return `${baseUrl}/video_generation/task/${taskId}`;
  }

  getCloudInfo(_baseUrl: string): CloudProviderInfo {
    return {
      name: "MiniMax",
      websiteUrl: "https://platform.minimaxi.com",
      taskUrlPattern: (taskId: string) =>
        `https://platform.minimaxi.com/video/task/${taskId}`,
      queryEndpoint: (baseUrl: string, taskId: string) =>
        `${baseUrl}/video_generation/task/${taskId}`,
      apiDocUrl: "https://platform.minimaxi.com/document/video-generation",
      howToCheck:
        "登录MiniMax开放平台 (platform.minimaxi.com)，在「视频生成」页面查看任务状态和结果",
    };
  }
}
