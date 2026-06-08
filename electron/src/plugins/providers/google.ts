import { BaseAIProviderPlugin } from "../base-provider";
import type {
  AIProviderPlugin,
  ModelCapabilities,
  ProviderCapabilities,
  VideoBuildContext,
  ImageBuildContext,
  TextBuildContext,
  VisionBuildContext,
  VideoRequestResult,
  ImageRequestResult,
  TextRequestResult,
  VisionRequestResult,
  ImageTransportMode,
  ImagePurpose,
  CloudProviderInfo,
  ApiKeyDetection,
} from "../types";
import {
  urlToPureBase64,
  resolveLocalUrlToBase64,
  stripDataUriPrefix,
} from "../utils";
import { getLogger } from "../../logging/logger";

const logger = getLogger("google");

const DEFAULT_MODEL_CAPS: ModelCapabilities = {
  maxReferences: 2,
  maxResolution: 1024,
  maxSizeMB: 5,
  supportsLastFrame: true,
  referenceMode: "merged",
  defaultImageSize: "1024x1024",
  supportedImageSizes: [
    { width: 1024, height: 1024, label: "1024×1024", aspectRatio: "1:1" },
  ],
};

export class GooglePlugin
  extends BaseAIProviderPlugin
  implements AIProviderPlugin
{
  readonly id = "google";
  readonly displayName = "Google (Veo)";

  match(apiUrl: string, model?: string): boolean {
    return (
      apiUrl.includes("generativeai.googleapis.com") ||
      apiUrl.includes("aiplatform.googleapis.com") ||
      (model?.includes("veo") ?? false)
    );
  }

  get capabilities(): ProviderCapabilities {
    return {
      video: true,
      image: true,
      text: true,
      vision: true,
    };
  }

  readonly videoCapabilities = {
    supportsLastFrame: true,
    supportsReferenceVideo: true,
    supportsMimicryLevel: false,
    defaultModel: "veo-3",
    maxDuration: 8,
    supportedCodecs: ["h264", "h265", "vp9"],
    urlTtl: 86400,
  };

  readonly imageCapabilities = {
    supportsReferenceImage: false,
    defaultModel: "veo-3",
  };

  getModelCapabilities(_modelId: string): ModelCapabilities {
    return DEFAULT_MODEL_CAPS;
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
      model: ctx.model || "veo-3",
      prompt,
    };

    if (ctx.firstFrameUrl) {
      body.image = { imageBytes: ctx.firstFrameUrl };
    }
    if (ctx.lastFrameUrl) {
      body.lastFrame = { imageBytes: ctx.lastFrameUrl };
    }
    if (ctx.referenceVideoUrl) {
      body.referenceVideo = { videoBytes: ctx.referenceVideoUrl };
    }

    return {
      body,
      endpoint: `/models/${ctx.model || "veo-3"}:predictLongRunning`,
    };
  }

  buildImageRequest(ctx: ImageBuildContext): ImageRequestResult {
    return {
      body: {
        model: ctx.model || "veo-3",
        prompt: ctx.prompt,
        n: 1,
        size: ctx.size,
      },
      endpoint: "/images/generations",
    };
  }

  buildTextRequest(ctx: TextBuildContext): TextRequestResult {
    return {
      body: {
        model: ctx.model || "veo-3",
        messages: [{ role: "user", content: ctx.prompt }],
        max_tokens: ctx.maxTokens,
        temperature: ctx.temperature,
      },
      endpoint: "/chat/completions",
    };
  }

  buildVisionRequest(ctx: VisionBuildContext): VisionRequestResult {
    return {
      body: {
        model: ctx.model || "veo-3",
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

  async prepareImage(
    url: string,
    _purpose: ImagePurpose,
    _apiConfig: { apiKey: string; apiUrl: string },
  ): Promise<string | undefined> {
    try {
      if (
        url.startsWith("data:") ||
        url.startsWith("http://") ||
        url.startsWith("https://")
      ) {
        return urlToPureBase64(url);
      }
      const base64 = await resolveLocalUrlToBase64(url);
      if (base64) {
        return stripDataUriPrefix(base64);
      }
      return urlToPureBase64(url);
    } catch {
      logger.warn("Failed to resolve image URL to base64 for Google API");
      return undefined;
    }
  }

  getAuthHeaders(
    _apiKey: string,
    _endpoint?: string,
  ): Record<string, string> {
    return {};
  }

  appendAuthToUrl(url: string, apiKey: string): string {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}key=${apiKey}`;
  }

  getVideoStatusEndpoint(
    baseUrl: string,
    taskId: string,
    _model?: string,
  ): string {
    return `${baseUrl}/operations/${taskId}`;
  }

  getCloudInfo(_baseUrl: string): CloudProviderInfo {
    return {
      name: "Google AI",
      websiteUrl: "https://ai.google.dev",
      taskUrlPattern: (taskId: string) =>
        `https://ai.google.dev/operations/${taskId}`,
      queryEndpoint: (baseUrl: string, taskId: string) =>
        `${baseUrl}/operations/${taskId}`,
      apiDocUrl: "https://ai.google.dev/gemini-api/docs/video-generation",
      howToCheck:
        "Visit Google AI Studio (ai.google.dev) to check operation status and results",
    };
  }

  getApiKeyDetection(): ApiKeyDetection {
    return {
      rules: [
        {
          pattern: "^AIza[A-Za-z0-9_-]{26,}$",
          confidence: "high",
        },
      ],
      suggestedName: "Google AI",
      baseUrl: "https://generativeai.googleapis.com/v1",
    };
  }
}
