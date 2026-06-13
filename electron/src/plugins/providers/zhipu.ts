import { BaseAIProviderPlugin } from "../base-provider";
import type {
  ModelCapabilities,
  ProviderCapabilities,
  VideoBuildContext,
  ImageBuildContext,
  VisionBuildContext,
  VideoRequestResult,
  ImageRequestResult,
  VisionRequestResult,
  ImageRefMode,
  ImageTransportMode,
  ImagePurpose,
  CloudProviderInfo,
  ApiKeyDetection,
} from "../types";

export class ZhipuPlugin extends BaseAIProviderPlugin {
  readonly id = "zhipu";
  readonly displayName = "智谱AI (GLM)";

  match(apiUrl: string, _model?: string): boolean {
    return apiUrl.includes("bigmodel.cn");
  }

  get capabilities(): ProviderCapabilities {
    return {
      video: true,
      image: true,
      text: false,
      vision: true,
    };
  }

  readonly videoCapabilities = {
    supportsLastFrame: false,
    supportsReferenceVideo: true,
    supportsMimicryLevel: false,
    supportsCharacterRef: false,
    supportsSceneRef: false,
    characterRefMode: "none" as ImageRefMode,
    sceneRefMode: "none" as ImageRefMode,
    imageUploadMode: "base64" as const,
    defaultModel: "cogvideox-4",
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
    const body: Record<string, unknown> = {
      model: ctx.model || this.videoCapabilities.defaultModel,
      prompt: ctx.prompt,
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

  getApiKeyDetection(): ApiKeyDetection {
    return {
      rules: [
        {
          pattern: "^00[0-9a-fA-F]{32}\\.[A-Za-z0-9]{16}$",
          confidence: "high",
        },
        {
          pattern: "^[0-9a-fA-F]{32}\\.[A-Za-z0-9]{20}$",
          confidence: "high",
        },
      ],
      suggestedName: "智谱AI",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    };
  }
}
