import { BaseAIProviderPlugin } from "../base-provider";
import type {
  AIProviderPlugin,
  ModelCapabilities,
  VideoBuildContext,
  ImageBuildContext,
  VisionBuildContext,
  VideoRequestResult,
  ImageRequestResult,
  VisionRequestResult,
  ImageTransportMode,
  ImagePurpose,
  CloudProviderInfo,
} from "../types";

export class PixversePlugin
  extends BaseAIProviderPlugin
  implements AIProviderPlugin
{
  readonly id = "pixverse";
  readonly displayName = "Pixverse (阿里云百炼)";

  match(apiUrl: string, _model?: string): boolean {
    return apiUrl.includes("dashscope.aliyuncs.com");
  }

  readonly videoCapabilities = {
    supportsLastFrame: false,
    supportsReferenceVideo: true,
    supportsMimicryLevel: false,
    defaultModel: "pixverse/pixverse-v6-t2v",
    maxDuration: 10,
    supportedCodecs: ["h264", "h265"],
    urlTtl: 86400,
  };

  readonly imageCapabilities = {
    supportsReferenceImage: false,
    defaultModel: "pixverse/pixverse-v6-t2v",
  };

  getModelCapabilities(modelId: string): ModelCapabilities {
    const base: Omit<ModelCapabilities, "supportedImageSizes"> = {
      maxReferences: 4,
      maxResolution: 2048,
      maxSizeMB: 10,
      supportsLastFrame: true,
      referenceMode: "separate",
      defaultImageSize: "1920x1920",
    };

    if (modelId.includes("pixverse-v6-t2v")) {
      return {
        ...base,
        supportedImageSizes: [
          {
            width: 1920,
            height: 1920,
            label: "1920x1920",
            aspectRatio: "1:1",
          },
          {
            width: 1920,
            height: 1080,
            label: "1920x1080",
            aspectRatio: "16:9",
          },
          {
            width: 1080,
            height: 1920,
            label: "1080x1920",
            aspectRatio: "9:16",
          },
        ],
      };
    }

    return {
      ...base,
      supportedImageSizes: [
        {
          width: 1920,
          height: 1920,
          label: "1920x1920",
          aspectRatio: "1:1",
        },
      ],
    };
  }

  buildVideoRequest(ctx: VideoBuildContext): VideoRequestResult {
    const input: Record<string, unknown> = { prompt: ctx.prompt };
    const parameters: Record<string, unknown> = {
      size: "1280*720",
      duration: ctx.duration,
      watermark: true,
    };

    if (ctx.firstFrameUrl) {
      input.image_url = ctx.firstFrameUrl;
    }

    if (ctx.referenceVideoUrl) {
      input.reference_video_url = ctx.referenceVideoUrl;
      if (ctx.referenceVideoMimicryLevel === "deep") {
        parameters.ref_mode = 1;
      } else if (ctx.referenceVideoMimicryLevel === "medium") {
        parameters.ref_mode = 2;
      } else if (ctx.referenceVideoMimicryLevel === "light") {
        parameters.ref_mode = 3;
      }
    }

    const refImg = ctx.characterRef || ctx.sceneRef;
    if (refImg) {
      input.ref_img = refImg;
    }

    return {
      body: {
        model: ctx.model || this.videoCapabilities.defaultModel,
        input,
        parameters,
      },
      endpoint: "/services/aigc/video-generation/video-synthesis",
      extraHeaders: { "X-DashScope-Async": "enable" },
    };
  }

  buildImageRequest(ctx: ImageBuildContext): ImageRequestResult {
    return {
      body: {
        model: ctx.model || this.imageCapabilities.defaultModel,
        prompt: ctx.prompt,
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
    const output = data.output as Record<string, unknown> | undefined;
    if (output?.task_id) return output.task_id as string;
    if (data.task_id) return data.task_id as string;
    if (data.id) return data.id as string;
    return undefined;
  }

  extractVideoUrl(data: Record<string, unknown>): string | undefined {
    const output = data.output as Record<string, unknown> | undefined;
    if (output?.video_url) return output.video_url as string;
    if (data.video_url) return data.video_url as string;
    if (data.url) return data.url as string;
    return undefined;
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
      name: "阿里云百炼",
      websiteUrl: "https://bailian.console.aliyun.com/",
      taskUrlPattern: (taskId: string) =>
        `https://bailian.console.aliyun.com/#/task-detail/${taskId}`,
      queryEndpoint: (baseUrl: string, taskId: string) =>
        `${baseUrl}/tasks/${taskId}`,
      apiDocUrl:
        "https://help.aliyun.com/document_detail/2712536.html",
      howToCheck:
        "在阿里云百炼控制台的「任务管理」中查看任务状态和结果",
    };
  }
}
