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
  ImageRefMode,
  ImageUploadMode,
  VisionRequestResult,
  ImageTransportMode,
  ImagePurpose,
  CloudProviderInfo,
} from "../types";

export class MiniMaxPlugin extends BaseAIProviderPlugin implements AIProviderPlugin {
  readonly id = "minimax";
  readonly displayName = "MiniMax (Hailuo)";

  match(apiUrl: string, model?: string): boolean {
    return apiUrl.includes("minimaxi.com") || (model?.includes("hailuo") ?? false);
  }

  get capabilities(): ProviderCapabilities {
    return {
      video: true,
      image: true,
      text: false,
      vision: false,
    };
  }

  readonly videoCapabilities = {
    supportsLastFrame: false,
    supportsReferenceVideo: false,
    supportsMimicryLevel: false,
    supportsCharacterRef: true,
    supportsSceneRef: true,
    characterRefMode: "native_field" as ImageRefMode,
    sceneRefMode: "text_append" as ImageRefMode,
    characterRefField: "subject_image_url",
    imageUploadMode: "base64" as ImageUploadMode,
    maxCharacterRefs: 1,
    defaultModel: "MiniMax-Hailuo-02",
    maxDuration: 10,
    supportedCodecs: ["h264", "h265"],
    urlTtl: 86400,
  };

  readonly imageCapabilities = {
    supportsReferenceImage: false,
    defaultModel: "MiniMax-Hailuo-02",
  };

  getModelCapabilities(modelId: string): ModelCapabilities {
    const isS2V = modelId.includes("S2V-") || modelId.includes("s2v-");
    const isI2V = modelId.startsWith("I2V-") || modelId.startsWith("i2v-");
    const supportsLastFrame = isS2V || isI2V;

    return {
      maxReferences: 4,
      maxResolution: 2048,
      maxSizeMB: 10,
      supportsLastFrame,
      referenceMode: "separate",
      defaultImageSize: "1920x1920",
      supportedImageSizes: [
        { width: 1920, height: 1920, label: "1920×1920", aspectRatio: "1:1" },
      ],
    };
  }

  buildVideoRequest(ctx: VideoBuildContext): VideoRequestResult {
    let prompt = ctx.prompt;
    const charRefs = ctx.characterRefs?.length ? ctx.characterRefs : (ctx.characterRef ? [ctx.characterRef] : []);
    const model = ctx.model || this.videoCapabilities.defaultModel;

    const isS2V = model.includes("S2V-01") || model.includes("s2v-01");

    if (ctx.sceneRef) {
      prompt += `\n[场景参考] 请严格按照参考图中的场景环境、光照、色调等特征生成场景。`;
    }

    const body: Record<string, unknown> = {
      model,
      prompt,
    };

    if (ctx.firstFrameUrl) {
      body.image_url = ctx.firstFrameUrl;
    }

    if (isS2V && charRefs.length > 0 && charRefs[0]) {
      body.subject_image_url = charRefs[0];
    }

    return {
      body,
      endpoint: "/video_generation/task",
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
    return (
      (data.task_id as string | undefined) ||
      (data.id as string | undefined)
    );
  }

  extractVideoUrl(data: Record<string, unknown>): string | undefined {
    // MiniMax 完成态: { file_id, file_download_url }
    return (
      (data.file_download_url as string | undefined) ||
      (data.video_url as string | undefined) ||
      (data.url as string | undefined)
    );
  }

  getVideoStatusEndpoint(
    baseUrl: string,
    taskId: string,
    _model?: string,
  ): string {
    return `${baseUrl}/video_generation/task/${taskId}`;
  }

  getCloudInfo(_baseUrl: string): CloudProviderInfo {
    return {
      name: "MiniMax",
      websiteUrl: "https://platform.minimaxi.com",
      taskUrlPattern: (taskId: string) =>
        `https://platform.minimaxi.com/video/task/${taskId}`,
      queryEndpoint: (baseUrl: string, taskId: string) =>
        `${baseUrl}/video_generation/task/${taskId}`,
      apiDocUrl: "https://platform.minimaxi.com/document/video-generation",
      howToCheck:
        "登录MiniMax开放平台 (platform.minimaxi.com)，在「视频生成」页面查看任务状态和结果",
    };
  }
}
