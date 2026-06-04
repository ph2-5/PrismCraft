import https from "https";
import http from "http";
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
import {
  ensureAccessibleUrl,
  resolveLocalUrlToBase64,
  stripDataUriPrefix,
} from "../utils";
import { getLogger } from "../../logging/logger";

const logger = getLogger("kuaishou");

export class KuaishouPlugin extends BaseAIProviderPlugin implements AIProviderPlugin {
  readonly id = "kuaishou";
  readonly displayName = "可灵AI (Kling)";

  match(apiUrl: string, _model?: string): boolean {
    return apiUrl.includes("klingai.com");
  }

  readonly videoCapabilities = {
    supportsLastFrame: true,
    supportsReferenceVideo: true,
    supportsMimicryLevel: false,
    defaultModel: "kling-v2-master",
    maxDuration: 10,
    supportedCodecs: ["h264", "h265"],
    urlTtl: 86400,
  };

  readonly imageCapabilities = {
    supportsReferenceImage: false,
    defaultModel: "kling-v2-master",
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

    if (modelId.includes("v2-master") || modelId.includes("v2-pro")) {
      return {
        ...base,
        supportedImageSizes: [
          { width: 1920, height: 1920, label: "1920x1920", aspectRatio: "1:1" },
          { width: 1920, height: 1080, label: "1920x1080", aspectRatio: "16:9" },
          { width: 1080, height: 1920, label: "1080x1920", aspectRatio: "9:16" },
        ],
      };
    }

    return {
      ...base,
      supportedImageSizes: [
        { width: 1920, height: 1920, label: "1920x1920", aspectRatio: "1:1" },
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

    const model = ctx.model || this.videoCapabilities.defaultModel;
    const body: Record<string, unknown> = {
      model,
      prompt,
      duration: ctx.duration,
      aspect_ratio: "16:9",
    };

    if (ctx.firstFrameUrl) {
      body.image = ctx.firstFrameUrl;
    }

    if (ctx.lastFrameUrl) {
      body.tail_image = ctx.lastFrameUrl;
    }

    if (ctx.referenceVideoUrl) {
      body.reference_video = ctx.referenceVideoUrl;
      body.ref_mode = ctx.referenceVideoMimicryLevel === "deep" ? 1 : 0;
    }

    const endpoint = ctx.firstFrameUrl
      ? "/v1/videos/image2video"
      : "/v1/videos/text2video";

    return { body, endpoint };
  }

  buildImageRequest(ctx: ImageBuildContext): ImageRequestResult {
    const model = ctx.model || this.imageCapabilities.defaultModel;
    return {
      body: {
        model,
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
    return "upload";
  }

  async uploadAsset(
    data: Buffer,
    _filename: string,
    _mimeType: string,
    apiKey: string,
    apiUrl: string,
  ): Promise<string> {
    const base64 = data.toString("base64");
    const url = new URL(`${apiUrl}/v1/images`);
    const payload = JSON.stringify({
      image: base64,
      image_type: "base64",
    });

    return new Promise((resolve, reject) => {
      const client = url.protocol === "https:" ? https : http;
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname,
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      };

      const req = client.request(options, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const responseBody = Buffer.concat(chunks).toString("utf-8");
          try {
            const parsed = JSON.parse(responseBody) as Record<string, unknown>;
            const dataField = parsed.data as Record<string, unknown> | undefined;
            if (dataField) {
              const images = dataField.images as Record<string, unknown>[] | undefined;
              if (images && images.length > 0 && images[0].url) {
                resolve(images[0].url as string);
                return;
              }
              if (dataField.image_url) {
                resolve(dataField.image_url as string);
                return;
              }
            }
            reject(new Error(`Failed to extract image URL from upload response: ${responseBody.substring(0, 200)}`));
          } catch (e) {
            reject(new Error(`Failed to parse upload response: ${e instanceof Error ? e.message : String(e)}`));
          }
        });
      });

      req.on("error", (e) => reject(e));
      req.write(payload);
      req.end();
    });
  }

  extractTaskId(data: Record<string, unknown>): string | undefined {
    return (
      ((data.data as Record<string, unknown>)?.task_id as string | undefined) ||
      (data.task_id as string | undefined) ||
      (data.id as string | undefined)
    );
  }

  extractVideoUrl(data: Record<string, unknown>): string | undefined {
    return (
      ((data.data as Record<string, unknown>)?.video_url as string | undefined) ||
      (data.video_url as string | undefined) ||
      (data.url as string | undefined)
    );
  }

  getVideoStatusEndpoint(
    baseUrl: string,
    taskId: string,
    _model?: string,
  ): string {
    return `${baseUrl}/api/v1/video/status/${taskId}`;
  }

  async prepareImage(
    url: string,
    _purpose: ImagePurpose,
    apiConfig: { apiKey: string; apiUrl: string },
  ): Promise<string | undefined> {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      return url;
    }

    try {
      const base64 = await resolveLocalUrlToBase64(url);
      if (base64) {
        const pureBase64 = stripDataUriPrefix(base64);
        const buffer = Buffer.from(pureBase64, "base64");
        const uploadedUrl = await this.uploadAsset(
          buffer,
          "image.png",
          "image/png",
          apiConfig.apiKey,
          apiConfig.apiUrl,
        );
        return uploadedUrl;
      }
    } catch {
      logger.warn("Failed to upload image via Kuaishou API");
      // fall through
    }

    return ensureAccessibleUrl(url);
  }

  getCloudInfo(_baseUrl: string): CloudProviderInfo {
    return {
      name: "可灵AI",
      websiteUrl: "https://klingai.com",
      taskUrlPattern: (taskId: string) => `https://klingai.com/creator/task/${taskId}`,
      queryEndpoint: (baseUrl: string, taskId: string) =>
        `${baseUrl}/api/v1/video/status/${taskId}`,
      apiDocUrl: "https://klingai.com/docs/api",
      howToCheck: "登录可灵AI官网，在「我的任务」中查看任务状态和结果。",
    };
  }
}
