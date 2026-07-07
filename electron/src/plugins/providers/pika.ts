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

export class PikaPlugin extends BaseAIProviderPlugin implements AIProviderPlugin {
  readonly id = "pika";
  readonly displayName = "Pika";

  readonly matchPatterns: MatchPattern[] = [
    { urlPattern: "api.pika.art" },
    { urlPattern: "", modelPattern: "pika" },
  ];

  match(apiUrl: string, model?: string): boolean {
    return apiUrl.includes("api.pika.art") || (model?.toLowerCase().includes("pika") ?? false);
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
    supportsLastFrame: false,
    supportsReferenceVideo: false,
    supportsMimicryLevel: false,
    supportsCharacterRef: false,
    supportsSceneRef: false,
    characterRefMode: "none" as ImageRefMode,
    sceneRefMode: "none" as ImageRefMode,
    imageUploadMode: "url" as const,
    defaultModel: "pika-2.2",
    // Pika 2.2 单次最长 10 秒（-d 10 参数）
    maxDuration: 10,
    supportedCodecs: ["h264", "h265"],
    urlTtl: 86400,
  };

  readonly imageCapabilities = {
    supportsReferenceImage: false,
    defaultModel: "pika-2.2",
  };

  getModelCapabilities(_modelId: string): ModelCapabilities {
    return {
      maxReferences: 0,
      maxResolution: 1920,
      maxSizeMB: 10,
      supportsLastFrame: false,
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

    if (ctx.duration) {
      body.duration = Math.min(ctx.duration, this.videoCapabilities.maxDuration);
    }

    body.aspect_ratio = "16:9";

    return {
      body,
      endpoint: "/video/generate",
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
    const dataField = data.data as Record<string, unknown> | undefined;
    if (dataField?.id) return dataField.id as string;
    return (data.id as string | undefined) || (data.task_id as string | undefined);
  }

  extractVideoUrl(data: Record<string, unknown>): string | undefined {
    const dataField = data.data as Record<string, unknown> | undefined;
    if (dataField?.video_url) return dataField.video_url as string;
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
    const dataField = response.data as Record<string, unknown> | undefined;
    const rawStatus = (dataField?.status as string) || (response.status as string) || "processing";

    let status: string;
    switch (rawStatus) {
      case "completed":
        status = "completed";
        break;
      case "failed":
        status = "failed";
        break;
      case "processing":
      default:
        status = "generating";
        break;
    }

    const message = (dataField?.error as string) || (response.error as string);
    return { status, message };
  }

  getVideoStatusEndpoint(
    baseUrl: string,
    taskId: string,
    _model?: string,
  ): string {
    return `${baseUrl}/video/status/${taskId}`;
  }

  getCloudInfo(_baseUrl: string): CloudProviderInfo {
    return {
      name: "Pika",
      websiteUrl: "https://pika.art",
      taskUrlPattern: (taskId: string) =>
        `https://pika.art/tasks/${taskId}`,
      queryEndpoint: (baseUrl: string, taskId: string) =>
        `${baseUrl}/video/status/${taskId}`,
      apiDocUrl: "https://pika.art/docs/api",
      howToCheck:
        "Visit Pika (pika.art) and check your generation history for task status",
    };
  }
}
