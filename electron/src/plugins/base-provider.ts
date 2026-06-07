import type {
  AIProviderPlugin,
  ModelCapabilities,
  ModelParameterProfile,
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
} from "./types";
import {
  ensureAccessibleUrl,
  resolveLocalUrlToBase64,
  downloadAsBase64,
} from "./utils";
import { getLogger } from "../logging/logger";

const logger = getLogger("base-provider");

export abstract class BaseAIProviderPlugin implements AIProviderPlugin {
  abstract readonly id: string;
  abstract readonly displayName: string;
  abstract match(apiUrl: string, model?: string): boolean;

  abstract readonly videoCapabilities: VideoCapabilities;
  abstract readonly imageCapabilities: ImageCapabilities;
  abstract getModelCapabilities(modelId: string): ModelCapabilities;

  abstract buildVideoRequest(ctx: VideoBuildContext): VideoRequestResult;
  abstract buildImageRequest(ctx: ImageBuildContext): ImageRequestResult;

  extractTaskId(data: Record<string, unknown>): string | undefined {
    return (
      (data.id as string | undefined) ||
      (data.task_id as string | undefined) ||
      ((data.data as Record<string, unknown>)?.task_id as string | undefined) ||
      ((data.output as Record<string, unknown>)?.task_id as string | undefined)
    );
  }

  extractVideoUrl(data: Record<string, unknown>): string | undefined {
    return (
      (data.video_url as string | undefined) ||
      (data.url as string | undefined) ||
      ((data.data as Record<string, unknown>)?.video_url as
        | string
        | undefined) ||
      ((data.output as Record<string, unknown>)?.video_url as
        | string
        | undefined)
    );
  }

  extractImageUrl(data: Record<string, unknown>): string | undefined {
    const responseData = (data.data as Record<string, unknown>[])?.[0];
    if (responseData?.url) return responseData.url as string;
    if (responseData?.b64_json)
      return `data:image/png;base64,${responseData.b64_json as string}`;
    return undefined;
  }

  getVideoStatusEndpoint(
    baseUrl: string,
    taskId: string,
    _model?: string,
  ): string {
    return `${baseUrl}/videos/${taskId}`;
  }

  buildTextRequest(ctx: TextBuildContext): TextRequestResult {
    return {
      body: {
        model: ctx.model || "gpt-4o",
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

  async prepareImage(
    url: string,
    _purpose: ImagePurpose,
    _apiConfig: { apiKey: string; apiUrl: string },
  ): Promise<string | undefined> {
    if (!url) return undefined;

    if (url.startsWith("data:")) return url;

    if (url.startsWith("vcache://") || url.startsWith("/") || url.startsWith("file://")) {
      const base64 = await resolveLocalUrlToBase64(url);
      if (base64) return base64;
      logger.warn(`Failed to resolve local file to base64: ${url.substring(0, 60)}`);
      return undefined;
    }

    if (url.startsWith("https://") || url.startsWith("http://")) {
      try {
        const base64 = await downloadAsBase64(url);
        const ext = url.split(".").pop()?.toLowerCase() || "png";
        const mimeMap: Record<string, string> = {
          png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
          webp: "image/webp", gif: "image/gif", mp4: "video/mp4", webm: "video/webm",
        };
        const mime = mimeMap[ext] || "image/png";
        return `data:${mime};base64,${base64}`;
      } catch (e) {
        logger.warn(
          `Failed to download remote image, falling back to URL: ${e instanceof Error ? e.message : String(e)}`,
        );
        return url;
      }
    }

    return ensureAccessibleUrl(url);
  }

  getAuthHeaders(
    apiKey: string,
    _endpoint?: string,
  ): Record<string, string> {
    return { Authorization: `Bearer ${apiKey}` };
  }

  appendAuthToUrl(url: string, _apiKey: string): string {
    return url;
  }

  extractTextContent(response: Record<string, unknown>): string {
    const choices = response.choices as Record<string, unknown>[] | undefined;
    if (choices && Array.isArray(choices) && choices.length > 0) {
      const message = choices[0]!.message as Record<string, unknown> | undefined;
      if (message?.content) return message.content as string;
    }
    return "";
  }

  extractStatus(response: Record<string, unknown>): {
    status: string;
    progress?: number;
    message?: string;
  } {
    const r = response as Record<string, unknown>;
    const status = (r.status as string) || "generating";
    const progress = (r.progress as number) || (r.progress_percentage as number);
    const message = (r.message as string) || (r.error as string) || (r.msg as string);
    return { status, progress, message };
  }

  getStatusMethod(): "GET" | "POST" {
    return "GET";
  }

  getModelParameterProfile(modelId: string): ModelParameterProfile {
    const capabilities = this.getModelCapabilities(modelId);
    return {
      modelId,
      capabilities,
      parameters: {
        durations: [
          { value: 2, label: "2秒" },
          { value: 5, label: "5秒" },
          { value: 10, label: "10秒" },
        ],
        resolutions: capabilities.supportedImageSizes?.map((s) => ({
          value: `${s.width}x${s.height}`,
          label: s.label,
          width: s.width,
          height: s.height,
        })) || [{ value: `${capabilities.maxResolution}x${capabilities.maxResolution}`, label: "1:1", width: capabilities.maxResolution, height: capabilities.maxResolution }],
        styles: [],
        negativePrompt: false,
        seed: false,
      },
    };
  }

  getAvailableModels(): string[] {
    return [];
  }
}
