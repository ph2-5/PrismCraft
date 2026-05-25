import { BaseAIProviderPlugin } from "../base-provider";
import type {
  ModelCapabilities,
  VideoBuildContext,
  ImageBuildContext,
  VideoRequestResult,
  ImageRequestResult,
  CloudProviderInfo,
} from "../types";

export class OpenAISoraPlugin extends BaseAIProviderPlugin {
  readonly id = "openai-sora";
  readonly displayName = "OpenAI (Sora)";

  match(apiUrl: string, model?: string): boolean {
    return apiUrl.includes("api.openai.com") && !!model && model.includes("sora");
  }

  readonly videoCapabilities = {
    supportsLastFrame: true,
    supportsReferenceVideo: false,
    supportsMimicryLevel: false,
    defaultModel: "sora-2",
    maxDuration: 20,
    supportedCodecs: ["h264", "h265"],
    urlTtl: 3600,
  };

  readonly imageCapabilities = {
    supportsReferenceImage: true,
    defaultModel: "gpt-image-1",
  };

  getModelCapabilities(_modelId: string): ModelCapabilities {
    return {
      maxReferences: 4,
      maxResolution: 2048,
      maxSizeMB: 10,
      supportsLastFrame: true,
      referenceMode: "separate",
      defaultImageSize: "1024x1024",
      supportedImageSizes: [
        { width: 1024, height: 1024, label: "1024×1024", aspectRatio: "1:1" },
        { width: 1024, height: 1792, label: "1024×1792", aspectRatio: "2:3" },
        { width: 1792, height: 1024, label: "1792×1024", aspectRatio: "3:2" },
      ],
    };
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
      model: ctx.model || "sora-2",
      prompt,
      duration: ctx.duration,
    };

    if (ctx.firstFrameUrl) {
      body.image_url = ctx.firstFrameUrl;
    }

    if (ctx.lastFrameUrl) {
      body.last_frame_url = ctx.lastFrameUrl;
    }

    return {
      body,
      endpoint: "/video/generations",
    };
  }

  buildImageRequest(ctx: ImageBuildContext): ImageRequestResult {
    const model = ctx.model || "gpt-image-1";

    if (model.includes("gpt-image")) {
      const content: Record<string, unknown>[] = [
        { type: "input_text", text: ctx.prompt },
      ];

      const refs = ctx.referenceImages.slice(0, 4);
      for (const refUrl of refs) {
        content.push({ type: "input_image", image_url: refUrl });
      }

      return {
        body: { model, content },
        endpoint: "/images/generations",
      };
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
    return `${baseUrl}/video/generations/${taskId}`;
  }

  getCloudInfo(_baseUrl: string): CloudProviderInfo {
    return {
      name: "OpenAI",
      websiteUrl: "https://platform.openai.com",
      taskUrlPattern: (taskId: string) =>
        `https://platform.openai.com/video/${taskId}`,
      queryEndpoint: (baseUrl: string, taskId: string) =>
        `${baseUrl}/video/generations/${taskId}`,
      apiDocUrl: "https://platform.openai.com/docs/api-reference/video",
      howToCheck:
        "Log in to the OpenAI platform (platform.openai.com) and check the Video Generations section for task status and results",
    };
  }
}
