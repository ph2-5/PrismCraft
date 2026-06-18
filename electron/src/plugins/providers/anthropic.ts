import type {
  ModelCapabilities,
  ProviderCapabilities,
  VideoCapabilities,
  ImageCapabilities,
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
  ApiKeyDetection,
} from "../types";
import { BaseAIProviderPlugin } from "../base-provider";

const VIDEO_CAPABILITIES: VideoCapabilities = {
  supportsLastFrame: false,
  supportsReferenceVideo: false,
  supportsMimicryLevel: false,
  supportsCharacterRef: false,
  supportsSceneRef: false,
  characterRefMode: "none",
  sceneRefMode: "none",
  defaultModel: "claude-3-5-sonnet-20241022",
  maxDuration: 0,
  supportedCodecs: [],
};

const IMAGE_CAPABILITIES: ImageCapabilities = {
  supportsReferenceImage: false,
  defaultModel: "claude-3-5-sonnet-20241022",
};

export class AnthropicPlugin extends BaseAIProviderPlugin {
  readonly id = "anthropic";
  readonly displayName = "Anthropic (Claude)";

  match(apiUrl: string, _model?: string): boolean {
    return apiUrl.includes("anthropic.com") || apiUrl.includes("bedrock-runtime");
  }

  get capabilities(): ProviderCapabilities {
    return {
      video: false,
      image: false,
      text: true,
      vision: true,
    };
  }

  readonly videoCapabilities = VIDEO_CAPABILITIES;
  readonly imageCapabilities = IMAGE_CAPABILITIES;

  getModelCapabilities(_modelId: string): ModelCapabilities {
    return {
      maxReferences: 0,
      maxResolution: 0,
      maxSizeMB: 0,
      supportsLastFrame: false,
      referenceMode: "separate",
    };
  }

  buildVideoRequest(_ctx: VideoBuildContext): VideoRequestResult {
    throw new Error("ANTHROPIC_VIDEO_NOT_SUPPORTED");
  }

  buildImageRequest(_ctx: ImageBuildContext): ImageRequestResult {
    throw new Error("ANTHROPIC_IMAGE_NOT_SUPPORTED");
  }

  buildTextRequest(ctx: TextBuildContext): TextRequestResult {
    return {
      body: {
        model: ctx.model || "claude-3-5-sonnet-20241022",
        messages: [{ role: "user", content: ctx.prompt }],
        max_tokens: ctx.maxTokens,
        ...(ctx.temperature !== undefined ? { temperature: ctx.temperature } : {}),
      },
      endpoint: "/messages",
    };
  }

  buildVisionRequest(ctx: VisionBuildContext): VisionRequestResult {
    return {
      body: {
        model: ctx.model || "claude-3-5-sonnet-20241022",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: ctx.prompt },
              { type: "image_url", image_url: { url: ctx.imageUrl } },
            ],
          },
        ],
        max_tokens: ctx.maxTokens || 4096,
      },
      endpoint: "/messages",
    };
  }

  getImageTransportMode(_purpose: ImagePurpose): ImageTransportMode {
    return "url";
  }

  getAuthHeaders(apiKey: string, _endpoint?: string): Record<string, string> {
    return {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    };
  }

  extractTextContent(response: Record<string, unknown>): string {
    const content = response.content as Record<string, unknown>[] | undefined;
    if (content && Array.isArray(content) && content.length > 0) {
      return (content[0]?.text as string) || "";
    }
    return "";
  }

  getApiKeyDetection(): ApiKeyDetection {
    return {
      rules: [
        {
          pattern: "^sk-ant-api03-",
          confidence: "high",
        },
      ],
      suggestedName: "Anthropic",
      baseUrl: "https://api.anthropic.com/v1",
    };
  }
}
