import { BaseAIProviderPlugin } from "../base-provider";
import type {
  AIProviderPlugin,
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
  MatchPattern,
} from "../types";

export class LumaPlugin extends BaseAIProviderPlugin implements AIProviderPlugin {
  readonly id = "luma";
  readonly displayName = "Luma Dream Machine";

  readonly matchPatterns: MatchPattern[] = [
    { urlPattern: "api.lumalabs.ai" },
    { urlPattern: "", modelPattern: "dream-machine" },
  ];

  match(apiUrl: string, model?: string): boolean {
    return apiUrl.includes("api.lumalabs.ai") || (model?.toLowerCase().includes("dream-machine") ?? false);
  }

  get capabilities(): ProviderCapabilities {
    return {
      video: true,
      image: false,
      text: false,
      vision: false,
    };
  }

  readonly videoCapabilities = {
    supportsLastFrame: true,
    supportsReferenceVideo: false,
    supportsMimicryLevel: false,
    supportsCharacterRef: false,
    supportsSceneRef: false,
    characterRefMode: "none" as ImageRefMode,
    sceneRefMode: "none" as ImageRefMode,
    imageUploadMode: "url" as const,
    defaultModel: "dream-machine-1.6",
    maxDuration: 5,
    supportedCodecs: ["h264", "h265"],
    urlTtl: 86400,
  };

  readonly imageCapabilities = {
    supportsReferenceImage: false,
    defaultModel: "dream-machine-1.6",
  };

  getModelCapabilities(_modelId: string): ModelCapabilities {
    return {
      maxReferences: 0,
      maxResolution: 1920,
      maxSizeMB: 10,
      supportsLastFrame: true,
      supportsCharacterRef: false,
      supportsSceneRef: false,
      referenceMode: "merged",
      defaultImageSize: "1920x1080",
      supportedImageSizes: [
        { width: 1920, height: 1080, label: "1920×1080", aspectRatio: "16:9" },
        { width: 1080, height: 1920, label: "1080×1920", aspectRatio: "9:16" },
        { width: 1280, height: 720, label: "1280×720", aspectRatio: "16:9" },
      ],
    };
  }

  buildVideoRequest(ctx: VideoBuildContext): VideoRequestResult {
    const body: Record<string, unknown> = {
      prompt: ctx.prompt,
      model: ctx.model || this.videoCapabilities.defaultModel,
    };

    if (ctx.firstFrameUrl) {
      body.image_url = ctx.firstFrameUrl;
    }

    if (ctx.lastFrameUrl) {
      body.end_image_url = ctx.lastFrameUrl;
    }

    body.aspect_ratio = "16:9";

    return {
      body,
      endpoint: "/generations",
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
    return (data.id as string | undefined) || (data.task_id as string | undefined);
  }

  extractVideoUrl(data: Record<string, unknown>): string | undefined {
    const assets = data.assets as Record<string, unknown> | undefined;
    if (assets?.video) return assets.video as string;
    return (
      (data.video_url as string | undefined) ||
      (data.url as string | undefined)
    );
  }

  extractStatus(response: Record<string, unknown>): {
    status: string;
    progress?: number;
    message?: string;
  } {
    const rawStatus = (response.state as string) || (response.status as string) || "dreaming";

    let status: string;
    switch (rawStatus) {
      case "completed":
        status = "completed";
        break;
      case "failed":
        status = "failed";
        break;
      case "dreaming":
      default:
        status = "generating";
        break;
    }

    const message = (response.error as string) || (response.failure_reason as string);
    return { status, message };
  }

  getVideoStatusEndpoint(
    baseUrl: string,
    taskId: string,
    _model?: string,
  ): string {
    return `${baseUrl}/generations/${taskId}`;
  }

  getCloudInfo(_baseUrl: string): CloudProviderInfo {
    return {
      name: "Luma AI",
      websiteUrl: "https://lumalabs.ai",
      taskUrlPattern: (taskId: string) =>
        `https://lumalabs.ai/dream-machine/${taskId}`,
      queryEndpoint: (baseUrl: string, taskId: string) =>
        `${baseUrl}/generations/${taskId}`,
      apiDocUrl: "https://docs.lumalabs.ai/docs/dream-machine-api",
      howToCheck:
        "Visit Luma AI (lumalabs.ai) and check your Dream Machine generations for task status",
    };
  }
}
