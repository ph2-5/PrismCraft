import { BaseAIProviderPlugin } from "../base-provider";
import type {
  ModelCapabilities,
  VideoBuildContext,
  ImageBuildContext,
  VideoRequestResult,
  ImageRequestResult,
  ApiKeyDetection,
} from "../types";
import { getLogger } from "../../logging/logger";

const logger = getLogger("openai-compatible-plugin");

const MODEL_CAPS_MAP: Record<string, ModelCapabilities> = {
  "dall-e-3": {
    maxReferences: 1,
    maxResolution: 1024,
    maxSizeMB: 5,
    supportsLastFrame: false,
    referenceMode: "merged",
    defaultImageSize: "1024x1024",
    supportedImageSizes: [
      { width: 1024, height: 1024, label: "1024×1024", aspectRatio: "1:1" },
      { width: 1024, height: 1792, label: "1024×1792", aspectRatio: "2:3" },
      { width: 1792, height: 1024, label: "1792×1024", aspectRatio: "3:2" },
    ],
  },
  "sd-3.5": {
    maxReferences: 4,
    maxResolution: 2048,
    maxSizeMB: 10,
    supportsLastFrame: false,
    referenceMode: "separate",
    defaultImageSize: "1024x1024",
    supportedImageSizes: [
      { width: 1024, height: 1024, label: "1024×1024", aspectRatio: "1:1" },
      { width: 1280, height: 720, label: "1280×720", aspectRatio: "16:9" },
    ],
  },
  sdxl: {
    maxReferences: 4,
    maxResolution: 2048,
    maxSizeMB: 10,
    supportsLastFrame: false,
    referenceMode: "separate",
    defaultImageSize: "1024x1024",
    supportedImageSizes: [
      { width: 1024, height: 1024, label: "1024×1024", aspectRatio: "1:1" },
      { width: 1280, height: 720, label: "1280×720", aspectRatio: "16:9" },
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

export class OpenAICompatiblePlugin extends BaseAIProviderPlugin {
  readonly id = "openai-compatible";
  readonly displayName = "OpenAI 兼容";

  match(_apiUrl: string, _model?: string): boolean {
    return true;
  }

  readonly videoCapabilities = {
    supportsLastFrame: true,
    supportsReferenceVideo: true,
    supportsMimicryLevel: false,
    defaultModel: "video-01",
    maxDuration: 12,
    supportedCodecs: ["h264", "h265"],
    urlTtl: 86400,
  };

  readonly imageCapabilities = {
    supportsReferenceImage: true,
    defaultModel: "dall-e-3",
  };

  getModelCapabilities(modelId: string): ModelCapabilities {
    return MODEL_CAPS_MAP[modelId] || DEFAULT_MODEL_CAPS;
  }

  buildVideoRequest(ctx: VideoBuildContext): VideoRequestResult {
    const body: Record<string, unknown> = {
      model: ctx.model || "video-01",
      prompt: ctx.prompt,
      duration: ctx.duration,
    };

    if (ctx.firstFrameUrl) {
      body.image_url = ctx.firstFrameUrl;
    }

    if (ctx.lastFrameUrl) {
      body.last_frame_url = ctx.lastFrameUrl;
    }

    if (ctx.referenceVideoUrl) {
      body.reference_video_url = ctx.referenceVideoUrl;
    }

    const refImage = ctx.characterRef || ctx.sceneRef;
    if (refImage) {
      body.ref_image = refImage;
    }

    return {
      body,
      endpoint: "/videos/generations",
    };
  }

  buildImageRequest(ctx: ImageBuildContext): ImageRequestResult {
    const model = ctx.model || "dall-e-3";

    if (ctx.referenceImages.length > 0) {
      const caps = this.getModelCapabilities(model);
      if (caps.referenceMode === "merged" && ctx.referenceImages.length > 1) {
        logger.warn(
          `Model ${model} does not support multiple reference images, only the first will be used`,
        );
      }
    }

    return {
      body: { model, prompt: ctx.prompt, n: 1, size: ctx.size },
      endpoint: "/images/generations",
    };
  }

  getVideoStatusEndpoint(
    baseUrl: string,
    taskId: string,
    _model?: string,
  ): string {
    return `${baseUrl}/videos/${taskId}`;
  }

  getApiKeyDetection(): ApiKeyDetection {
    return {
      rules: [
        {
          pattern: "^sk-proj-",
          confidence: "high",
        },
        {
          pattern: "^sk-or-",
          confidence: "high",
        },
        {
          pattern: "^sk-[A-Za-z0-9]{48}$",
          confidence: "high",
        },
        {
          pattern: "^sk-[A-Za-z0-9]{32}$",
          confidence: "high",
        },
        {
          pattern: "moonshot",
          confidence: "high",
        },
        {
          pattern: "^sk-[A-Za-z0-9]{10}$",
          confidence: "low",
        },
        {
          pattern: "^sk-[A-Za-z0-9]{24,}$",
          confidence: "medium",
          check: (key: string) => {
            const suffix = key.slice(3);
            return suffix.length >= 24 && suffix.length !== 48 && suffix.length !== 32;
          },
        },
      ],
      suggestedName: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
    };
  }
}
