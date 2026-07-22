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

export class RunwayPlugin extends BaseAIProviderPlugin implements AIProviderPlugin {
  readonly id = "runway";
  readonly displayName = "Runway";

  readonly matchPatterns: MatchPattern[] = [
    { urlPattern: "api.dev.runwayml.com" },
    { urlPattern: "", modelPattern: "gen3a" },
    { urlPattern: "", modelPattern: "gen4" },
  ];

  match(apiUrl: string, model?: string): boolean {
    if (apiUrl.includes("api.dev.runwayml.com") || apiUrl.includes("runwayml.com")) {
      return true;
    }
    const m = model?.toLowerCase() ?? "";
    return m.includes("gen3") || m.includes("gen4");
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
    // gen3a_turbo 已被 Runway 标记为 deprecated（2026-07-30 sunset），迁移到 gen4_turbo
    // gen4_turbo: 5 credits/sec, 支持 image_to_video (首帧 + 文本), 5/10s, 不支持尾帧/参考视频
    // gen4.5: 25 credits/sec, 2026-01 起支持首帧，质量更高但成本更高，作为可选高质量模型
    defaultModel: "gen4_turbo",
    maxDuration: 10,
    supportedCodecs: ["h264", "h265"],
    urlTtl: 86400,
  };

  readonly imageCapabilities = {
    supportsReferenceImage: false,
    defaultModel: "gen4_turbo",
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
      model: ctx.model || this.videoCapabilities.defaultModel,
      promptText: ctx.prompt,
    };

    if (ctx.firstFrameUrl) {
      body.promptImage = ctx.firstFrameUrl;
    }

    if (ctx.duration) {
      body.duration = Math.min(ctx.duration, this.videoCapabilities.maxDuration);
    }

    return {
      body,
      endpoint: "/image_to_video",
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
    const output = data.output as string[] | undefined;
    if (output && Array.isArray(output) && output.length > 0) {
      return output[0];
    }
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
    const rawStatus = (response.status as string) || "RUNNING";

    let status: string;
    switch (rawStatus) {
      case "SUCCEEDED":
        status = "completed";
        break;
      case "FAILED":
        status = "failed";
        break;
      case "RUNNING":
      default:
        status = "generating";
        break;
    }

    const message = (response.error as string) || (response.failure as string);
    const progress = response.progress as number | undefined;
    return { status, progress, message };
  }

  getVideoStatusEndpoint(
    baseUrl: string,
    taskId: string,
    _model?: string,
  ): string {
    return `${baseUrl}/tasks/${taskId}`;
  }

  getCloudInfo(_baseUrl: string): CloudProviderInfo {
    return {
      name: "Runway",
      websiteUrl: "https://runwayml.com",
      taskUrlPattern: (taskId: string) =>
        `https://runwayml.com/tasks/${taskId}`,
      queryEndpoint: (baseUrl: string, taskId: string) =>
        `${baseUrl}/tasks/${taskId}`,
      apiDocUrl: "https://docs.runwayml.com/docs/api",
      howToCheck:
        "Visit Runway (runwayml.com) and check your generations for task status",
    };
  }
}
