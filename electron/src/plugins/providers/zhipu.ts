import { BaseAIProviderPlugin } from "../base-provider";
import type {
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

export class ZhipuPlugin extends BaseAIProviderPlugin {
  readonly id = "zhipu";
  readonly displayName = "智谱AI (GLM)";

  match(apiUrl: string, _model?: string): boolean {
    return apiUrl.includes("bigmodel.cn");
  }

  readonly videoCapabilities = {
    supportsLastFrame: false,
    supportsReferenceVideo: true,
    supportsMimicryLevel: false,
    defaultModel: "cogvideox-3",
    maxDuration: 10,
    supportedCodecs: ["h264"],
    urlTtl: 86400,
  };

  readonly imageCapabilities = {
    supportsReferenceImage: false,
    defaultModel: "cogview-3",
  };

  getModelCapabilities(modelId: string): ModelCapabilities {
    const base: ModelCapabilities = {
      maxReferences: 4,
      maxResolution: 2048,
      maxSizeMB: 10,
      supportsLastFrame: true,
      referenceMode: "separate",
      defaultImageSize: "1920x1920",
      supportedImageSizes: [
        { width: 1920, height: 1920, label: "1920×1920", aspectRatio: "1:1" },
      ],
    };

    const normalized = modelId.toLowerCase().replace(/[-_.]/g, "");
    if (
      normalized.includes("cogvideox3") ||
      normalized.includes("cogvideox4")
    ) {
      return base;
    }

    return base;
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
      duration: ctx.duration,
    };

    if (ctx.firstFrameUrl) {
      body.image_url = ctx.firstFrameUrl;
    }

    if (ctx.referenceVideoUrl) {
      body.reference_video = ctx.referenceVideoUrl;
    }

    return {
      body,
      endpoint: "/videos/generations",
    };
  }

  buildImageRequest(ctx: ImageBuildContext): ImageRequestResult {
    return {
      body: {
        model: "cogview-3",
        prompt: ctx.prompt,
        size: ctx.size,
      },
      endpoint: "/images/generations",
    };
  }

  buildVisionRequest(ctx: VisionBuildContext): VisionRequestResult {
    return {
      body: {
        model: ctx.model || "glm-4v",
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
    return "base64";
  }

  getVideoStatusEndpoint(
    baseUrl: string,
    taskId: string,
    _model?: string,
  ): string {
    return `${baseUrl}/videos/generations/${taskId}`;
  }

  getCloudInfo(_baseUrl: string): CloudProviderInfo {
    return {
      name: "智谱AI",
      websiteUrl: "https://open.bigmodel.cn",
      taskUrlPattern: (taskId: string) =>
        `https://open.bigmodel.cn/video/generation/${taskId}`,
      queryEndpoint: (baseUrl: string, taskId: string) =>
        `${baseUrl}/videos/generations/${taskId}`,
      apiDocUrl: "https://open.bigmodel.cn/dev/api/video-generation",
      howToCheck:
        "登录智谱AI开放平台 (open.bigmodel.cn)，在「视频生成」页面查看任务状态和结果",
    };
  }
}
