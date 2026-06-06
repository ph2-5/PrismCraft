import type {
  AIProviderPlugin,
  ModelCapabilities,
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
  defaultModel: "doubao-seedance-1-0-pro-250528",
  maxDuration: 12,
  supportedCodecs: ["h264", "h265"],
  urlTtl: 86400,
};

const IMAGE_CAPABILITIES: ImageCapabilities = {
  supportsReferenceImage: false,
  defaultModel: "doubao-seedream-4-0-250828",
};

const MODEL_CAPS_MAP: Record<string, ModelCapabilities> = {
  "doubao-seedance-1-0-pro-250528": {
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
  "doubao-seedream-4-0-250828": {
    supportsLastFrame: false,
    supportedImageSizes: [
      { width: 1920, height: 1920, label: "1920×1920", aspectRatio: "1:1" },
      { width: 1920, height: 1280, label: "1920×1280", aspectRatio: "3:2" },
      { width: 1280, height: 1920, label: "1280×1920", aspectRatio: "2:3" },
    ],
  } as ModelCapabilities,
  "seedream-3.0": {
    supportsLastFrame: false,
    supportedImageSizes: [
      { width: 1920, height: 1920, label: "1920×1920", aspectRatio: "1:1" },
      { width: 1920, height: 1280, label: "1920×1280", aspectRatio: "3:2" },
      { width: 1280, height: 1920, label: "1280×1920", aspectRatio: "2:3" },
    ],
  } as ModelCapabilities,
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

export class VolcenginePlugin extends BaseAIProviderPlugin implements AIProviderPlugin {
  readonly id = "volcengine";
  readonly displayName = "火山引擎 (Doubao)";
  readonly videoCapabilities = VIDEO_CAPABILITIES;
  readonly imageCapabilities = IMAGE_CAPABILITIES;

  match(apiUrl: string, _model?: string): boolean {
    return apiUrl.includes("volces.com") || apiUrl.includes("bytepluses.com");
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
    const content: Record<string, unknown>[] = [
      { type: "text", text: ctx.prompt },
    ];

    if (ctx.firstFrameUrl) {
      content.push({ type: "image_url", image_url: { url: ctx.firstFrameUrl } });
    }

    if (ctx.lastFrameUrl) {
      content.push({ type: "image_url", image_url: { url: ctx.lastFrameUrl } });
    }

    if (ctx.characterRef) {
      content.push({ type: "image_url", image_url: { url: ctx.characterRef } });
    }

    if (ctx.sceneRef) {
      content.push({ type: "image_url", image_url: { url: ctx.sceneRef } });
    }

    const body: Record<string, unknown> = {
      model: ctx.model || "doubao-seedance-1-0-pro-250528",
      content,
    };

    const isSeedance15 =
      ctx.model?.includes("seedance-1-5") || ctx.model?.includes("seedance-1.5");

    if (!isSeedance15) {
      body.duration = ctx.duration;
    }

    if (ctx.referenceVideoUrl) {
      body.reference_video = ctx.referenceVideoUrl;
      if (ctx.referenceVideoMimicryLevel && this.videoCapabilities.supportsMimicryLevel) {
        body.mimicry_level = ctx.referenceVideoMimicryLevel;
      }
    }

    return {
      body,
      endpoint: "/contents/generations/tasks",
    };
  }

  buildImageRequest(ctx: ImageBuildContext): ImageRequestResult {
    return {
      body: {
        model: ctx.model || "doubao-seedream-4-0-250828",
        prompt: ctx.prompt,
        n: 1,
        size: "1920x1920",
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
    return `${baseUrl}/contents/generations/tasks/${taskId}`;
  }

  getCloudInfo(baseUrl: string): CloudProviderInfo {
    if (baseUrl.includes("bytepluses.com")) {
      return {
        name: "BytePlus (Seedance)",
        websiteUrl: "https://console.byteplus.com",
        taskUrlPattern: () =>
          "https://console.byteplus.com/ark/region:ap-southeast-1/task",
        queryEndpoint: (base, taskId) =>
          `${base}/contents/generations/tasks/${taskId}`,
        apiDocUrl: "https://docs.byteplus.com/en/docs/seedance/",
        howToCheck:
          "1. 登录 BytePlus 控制台 2. 进入「Ark」平台 3. 在「Task Center」查看视频生成任务",
      };
    }
    return {
      name: "火山引擎 (Doubao)",
      websiteUrl: "https://console.volcengine.com",
      taskUrlPattern: () =>
        "https://console.volcengine.com/ark/region:cn-beijing/task",
      queryEndpoint: (base, taskId) =>
        `${base}/contents/generations/tasks/${taskId}`,
      apiDocUrl: "https://www.volcengine.com/docs/82379/1115452",
      howToCheck:
        "1. 登录火山引擎控制台 2. 进入「方舟」平台 3. 在「任务中心」查看视频生成任务",
    };
  }

  getApiKeyDetection(): ApiKeyDetection {
    return {
      rules: [
        {
          pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
          confidence: "high",
        },
      ],
      suggestedName: "火山引擎",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    };
  }
}
