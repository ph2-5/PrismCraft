import type {
  AIProviderPlugin,
  ModelCapabilities,
  ProviderCapabilities,
  VideoCapabilities,
  ImageCapabilities,
  VideoBuildContext,
  ImageBuildContext,
  VisionBuildContext,
  VideoRequestResult,
  ImageRequestResult,
  VisionRequestResult,
  ImageTransportMode,
  ImagePurpose,
  CloudProviderInfo,
  ApiKeyDetection,
} from "../types";
import { BaseAIProviderPlugin } from "../base-provider";

const VIDEO_CAPABILITIES: VideoCapabilities = {
  supportsLastFrame: true,
  supportsReferenceVideo: true,
  supportsMimicryLevel: true,
  defaultModel: "seedance-1.5-pro",
  maxDuration: 12,
  supportedCodecs: ["h264", "h265"],
  urlTtl: 86400,
};

const IMAGE_CAPABILITIES: ImageCapabilities = {
  supportsReferenceImage: false,
  defaultModel: "seedance-1.5-pro",
};

const MODEL_CAPS_MAP: Record<string, ModelCapabilities> = {
  "seedance-2.0": {
    maxReferences: 4,
    maxResolution: 2048,
    maxSizeMB: 10,
    supportsLastFrame: true,
    referenceMode: "separate",
    defaultImageSize: "1920x1920",
    supportedImageSizes: [
      { width: 1920, height: 1920, label: "1920×1920", aspectRatio: "1:1" },
      { width: 1920, height: 1280, label: "1920×1280", aspectRatio: "3:2" },
      { width: 1280, height: 1920, label: "1280×1920", aspectRatio: "2:3" },
    ],
  },
  "seedance-1.5": {
    maxReferences: 4,
    maxResolution: 2048,
    maxSizeMB: 10,
    supportsLastFrame: true,
    referenceMode: "separate",
    defaultImageSize: "1920x1920",
    supportedImageSizes: [
      { width: 1920, height: 1920, label: "1920×1920", aspectRatio: "1:1" },
      { width: 1920, height: 1280, label: "1920×1280", aspectRatio: "3:2" },
      { width: 1280, height: 1920, label: "1280×1920", aspectRatio: "2:3" },
    ],
  },
};

const DEFAULT_MODEL_CAPS: ModelCapabilities = {
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

export class SeedancePlugin extends BaseAIProviderPlugin implements AIProviderPlugin {
  readonly id = "seedance";
  readonly displayName = "Seedance (Atlas Cloud)";
  get capabilities(): ProviderCapabilities {
    return {
      video: true,
      image: true,
      text: false,
      vision: false,
    };
  }
  readonly videoCapabilities = VIDEO_CAPABILITIES;
  readonly imageCapabilities = IMAGE_CAPABILITIES;

  match(apiUrl: string, model?: string): boolean {
    if (apiUrl.includes("volces.com") || apiUrl.includes("bytepluses.com")) {
      return false;
    }
    return apiUrl.includes("atlascloud.ai") || (model !== undefined && model.includes("seedance"));
  }

  getModelCapabilities(modelId: string): ModelCapabilities {
    for (const [key, caps] of Object.entries(MODEL_CAPS_MAP)) {
      if (modelId.includes(key) || key.includes(modelId)) {
        return caps;
      }
    }
    return DEFAULT_MODEL_CAPS;
  }

  buildVideoRequest(ctx: VideoBuildContext): VideoRequestResult {
    const body: Record<string, unknown> = {
      model: ctx.model || "seedance-1.5-pro",
      prompt: ctx.prompt,
    };

    const isSeedance15 =
      ctx.model?.includes("seedance-1-5") || ctx.model?.includes("seedance-1.5");

    if (!isSeedance15) {
      body.duration = ctx.duration;
    }

    if (ctx.firstFrameUrl) {
      body.image_url = ctx.firstFrameUrl;
    }

    if (ctx.referenceVideoUrl) {
      body.reference_video_url = ctx.referenceVideoUrl;
      if (ctx.referenceVideoMimicryLevel && this.videoCapabilities.supportsMimicryLevel) {
        body.mimicry_level = ctx.referenceVideoMimicryLevel;
      }
    }

    const refImage = ctx.characterRef || ctx.sceneRef;
    if (refImage) {
      body.ref_image = refImage;
    }

    return {
      body,
      endpoint: "/seedance/video",
    };
  }

  buildImageRequest(ctx: ImageBuildContext): ImageRequestResult {
    return {
      body: {
        model: ctx.model || "seedance-1.5-pro",
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
    return "base64";
  }

  getVideoStatusEndpoint(
    baseUrl: string,
    taskId: string,
    _model?: string,
  ): string {
    return `${baseUrl}/seedance/video/${taskId}`;
  }

  getCloudInfo(_baseUrl: string): CloudProviderInfo {
    return {
      name: "Atlas Cloud (Seedance)",
      websiteUrl: "https://atlascloud.ai",
      taskUrlPattern: (taskId: string) =>
        `https://atlascloud.ai/dashboard/tasks/${taskId}`,
      queryEndpoint: (baseUrl: string, taskId: string) =>
        `${baseUrl}/seedance/video/${taskId}`,
      apiDocUrl: "https://atlascloud.ai/docs",
      howToCheck:
        "1. 登录 Atlas Cloud 控制台 2. 在「Dashboard」中查看视频生成任务状态和结果",
    };
  }

  getApiKeyDetection(): ApiKeyDetection {
    return {
      rules: [
        {
          pattern: "(?:seedance|atlas)",
          confidence: "high",
        },
      ],
      suggestedName: "Seedance",
      baseUrl: "https://api.atlascloud.ai/v1",
    };
  }
}
