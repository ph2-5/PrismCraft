import type {
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
  CloudProviderInfo,
  ApiKeyDetection,
} from "./types";
import { BaseAIProviderPlugin } from "./base-provider";
import type { CodePluginExport } from "./code-plugin-loader";
import { getLogger } from "../logging/logger";

const logger = getLogger("code-plugin-adapter");

function safeCall<T>(fn: unknown, args: unknown[], fallback: T, context: string, pluginId: string): T {
  if (typeof fn !== "function") return fallback;
  try {
    const result = (fn as (...a: unknown[]) => T)(...args);
    return result;
  } catch (e) {
    logger.warn(
      `Code plugin ${pluginId} ${context}() threw error: ${e instanceof Error ? e.message : String(e)}`,
    );
    return fallback;
  }
}

export class CodePluginAdapter extends BaseAIProviderPlugin {
  private readonly pluginExport: CodePluginExport;

  constructor(pluginExport: CodePluginExport) {
    super();
    this.pluginExport = pluginExport;
  }

  get id(): string {
    return this.pluginExport.id;
  }

  get displayName(): string {
    return this.pluginExport.displayName;
  }

  match(apiUrl: string, model?: string): boolean {
    return safeCall(
      this.pluginExport.match,
      [apiUrl, model],
      false,
      "match",
      this.pluginExport.id,
    );
  }

  get videoCapabilities(): VideoCapabilities {
    return this.pluginExport.videoCapabilities;
  }

  get imageCapabilities(): ImageCapabilities {
    return this.pluginExport.imageCapabilities;
  }

  getModelCapabilities(modelId: string): ModelCapabilities {
    const fallback: ModelCapabilities = {
      maxReferences: 4,
      maxResolution: 2048,
      maxSizeMB: 10,
      supportsLastFrame: false,
      referenceMode: "separate",
    };
    const result = safeCall(
      this.pluginExport.getModelCapabilities,
      [modelId],
      fallback,
      "getModelCapabilities",
      this.pluginExport.id,
    );
    return {
      maxReferences: result.maxReferences ?? fallback.maxReferences,
      maxResolution: result.maxResolution ?? fallback.maxResolution,
      maxSizeMB: result.maxSizeMB ?? fallback.maxSizeMB,
      supportsLastFrame: result.supportsLastFrame ?? fallback.supportsLastFrame,
      referenceMode: result.referenceMode ?? fallback.referenceMode,
      defaultImageSize: result.defaultImageSize,
      supportedImageSizes: result.supportedImageSizes,
    };
  }

  buildVideoRequest(ctx: VideoBuildContext): VideoRequestResult {
    const fallback: VideoRequestResult = { body: {}, endpoint: "" };
    const result = safeCall(
      this.pluginExport.buildVideoRequest,
      [ctx],
      fallback,
      "buildVideoRequest",
      this.pluginExport.id,
    );
    return {
      body: result.body ?? {},
      endpoint: result.endpoint ?? "",
      extraHeaders: result.extraHeaders,
      method: result.method,
    };
  }

  buildImageRequest(ctx: ImageBuildContext): ImageRequestResult {
    const fallback: ImageRequestResult = { body: {}, endpoint: "" };
    const result = safeCall(
      this.pluginExport.buildImageRequest,
      [ctx],
      fallback,
      "buildImageRequest",
      this.pluginExport.id,
    );
    return {
      body: result.body ?? {},
      endpoint: result.endpoint ?? "",
    };
  }

  extractTaskId(data: Record<string, unknown>): string | undefined {
    const result = safeCall<string | undefined>(
      this.pluginExport.extractTaskId,
      [data],
      undefined,
      "extractTaskId",
      this.pluginExport.id,
    );
    if (result !== undefined) return result;
    return super.extractTaskId(data);
  }

  extractVideoUrl(data: Record<string, unknown>): string | undefined {
    const result = safeCall<string | undefined>(
      this.pluginExport.extractVideoUrl,
      [data],
      undefined,
      "extractVideoUrl",
      this.pluginExport.id,
    );
    if (result !== undefined) return result;
    return super.extractVideoUrl(data);
  }

  extractImageUrl(data: Record<string, unknown>): string | undefined {
    const result = safeCall<string | undefined>(
      this.pluginExport.extractImageUrl,
      [data],
      undefined,
      "extractImageUrl",
      this.pluginExport.id,
    );
    if (result !== undefined) return result;
    return super.extractImageUrl(data);
  }

  getVideoStatusEndpoint(baseUrl: string, taskId: string, model?: string): string {
    if (this.pluginExport.getVideoStatusEndpoint) {
      const result = safeCall<string>(
        this.pluginExport.getVideoStatusEndpoint,
        [baseUrl, taskId, model],
        "",
        "getVideoStatusEndpoint",
        this.pluginExport.id,
      );
      if (result) return result;
    }
    return super.getVideoStatusEndpoint(baseUrl, taskId, model);
  }

  getAuthHeaders(apiKey: string, endpoint?: string): Record<string, string> {
    return safeCall<Record<string, string>>(
      this.pluginExport.getAuthHeaders,
      [apiKey, endpoint],
      { Authorization: `Bearer ${apiKey}` },
      "getAuthHeaders",
      this.pluginExport.id,
    );
  }

  getModelParameterProfile(modelId: string): ModelParameterProfile {
    const result = safeCall<ModelParameterProfile>(
      this.pluginExport.getModelParameterProfile,
      [modelId],
      null as unknown as ModelParameterProfile,
      "getModelParameterProfile",
      this.pluginExport.id,
    );
    if (result) return result;
    return super.getModelParameterProfile(modelId);
  }

  buildTextRequest(ctx: TextBuildContext): TextRequestResult {
    if (this.pluginExport.buildTextRequest) {
      const result = safeCall<TextRequestResult>(
        this.pluginExport.buildTextRequest,
        [ctx],
        null as unknown as TextRequestResult,
        "buildTextRequest",
        this.pluginExport.id,
      );
      if (result) return result;
    }
    return super.buildTextRequest(ctx);
  }

  buildVisionRequest(ctx: VisionBuildContext): VisionRequestResult {
    if (this.pluginExport.buildVisionRequest) {
      const result = safeCall<VisionRequestResult>(
        this.pluginExport.buildVisionRequest,
        [ctx],
        null as unknown as VisionRequestResult,
        "buildVisionRequest",
        this.pluginExport.id,
      );
      if (result) return result;
    }
    return super.buildVisionRequest(ctx);
  }

  extractTextContent(response: Record<string, unknown>): string {
    if (this.pluginExport.extractTextContent) {
      const result = safeCall<string>(
        this.pluginExport.extractTextContent,
        [response],
        "",
        "extractTextContent",
        this.pluginExport.id,
      );
      if (result) return result;
    }
    return super.extractTextContent(response);
  }

  extractStatus(response: Record<string, unknown>): { status: string; progress?: number; message?: string } {
    if (this.pluginExport.extractStatus) {
      const result = safeCall<{ status: string; progress?: number; message?: string }>(
        this.pluginExport.extractStatus,
        [response],
        null as unknown as { status: string; progress?: number; message?: string },
        "extractStatus",
        this.pluginExport.id,
      );
      if (result) return result;
    }
    return super.extractStatus(response);
  }

  getStatusMethod(): "GET" | "POST" {
    if (this.pluginExport.getStatusMethod) {
      const result = safeCall<"GET" | "POST">(
        this.pluginExport.getStatusMethod,
        [],
        "GET",
        "getStatusMethod",
        this.pluginExport.id,
      );
      return result;
    }
    return super.getStatusMethod();
  }

  getAvailableModels(): string[] {
    if (this.pluginExport.getAvailableModels) {
      return safeCall<string[]>(
        this.pluginExport.getAvailableModels,
        [],
        [],
        "getAvailableModels",
        this.pluginExport.id,
      );
    }
    return super.getAvailableModels();
  }

  getCloudInfo?(baseUrl: string): CloudProviderInfo | undefined {
    if (this.pluginExport.getCloudInfo) {
      return safeCall<CloudProviderInfo | undefined>(
        this.pluginExport.getCloudInfo,
        [baseUrl],
        undefined,
        "getCloudInfo",
        this.pluginExport.id,
      );
    }
    return undefined;
  }

  getImageTransportMode(purpose: ImagePurpose): ImageTransportMode {
    if (this.pluginExport.getImageTransportMode) {
      const result = safeCall<ImageTransportMode>(
        this.pluginExport.getImageTransportMode,
        [purpose],
        "url",
        "getImageTransportMode",
        this.pluginExport.id,
      );
      return result;
    }
    return super.getImageTransportMode(purpose);
  }

  appendAuthToUrl(url: string, apiKey: string): string {
    if (this.pluginExport.appendAuthToUrl) {
      const result = safeCall<string>(
        this.pluginExport.appendAuthToUrl,
        [url, apiKey],
        url,
        "appendAuthToUrl",
        this.pluginExport.id,
      );
      return result;
    }
    return super.appendAuthToUrl(url, apiKey);
  }

  getApiKeyDetection(): ApiKeyDetection | undefined {
    const detection = this.pluginExport.apiKeyDetection;
    if (!detection || !detection.rules?.length) return undefined;
    return {
      rules: detection.rules.map((r) => ({
        pattern: r.pattern,
        confidence: r.confidence,
      })),
      suggestedName: detection.suggestedName || this.pluginExport.displayName,
      baseUrl: detection.baseUrl,
    };
  }

  get preferLocalData(): boolean | undefined {
    return this.pluginExport.preferLocalData;
  }
}
