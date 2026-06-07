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
  AsyncAIProviderPlugin,
} from "./types";
import { BaseAIProviderPlugin } from "./base-provider";
import type { CodePluginExport } from "./code-plugin-loader";
import type { PluginProcessManager } from "./plugin-process-manager";
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

type IsolationMode = "process" | "sandbox";

interface CachedMetadata {
  videoCapabilities: VideoCapabilities;
  imageCapabilities: ImageCapabilities;
  availableModels: string[];
  apiKeyDetection: ApiKeyDetection | undefined;
  preferLocalData: boolean | undefined;
}

export class CodePluginAdapter extends BaseAIProviderPlugin implements AsyncAIProviderPlugin {
  private readonly pluginExport: CodePluginExport;
  private readonly processManager: PluginProcessManager | null;
  private readonly mode: IsolationMode;
  private readonly _id: string;
  private readonly _displayName: string;
  private cached: CachedMetadata | null = null;
  private restarting = false;

  constructor(pluginExport: CodePluginExport, processManager?: PluginProcessManager, metadata?: CachedMetadata) {
    super();
    this.pluginExport = pluginExport;
    this.processManager = processManager || null;
    this.mode = processManager ? "process" : "sandbox";
    this._id = pluginExport.id;
    this._displayName = pluginExport.displayName;

    if (metadata) {
      this.cached = metadata;
    }

    if (this.processManager) {
      this.processManager.setOnProcessDeath(() => {
        this.attemptRestart();
      });
    }
  }

  private async attemptRestart(): Promise<void> {
    if (this.restarting || !this.processManager) return;
    this.restarting = true;
    try {
      logger.info(`Attempting auto-restart for plugin ${this._id}...`);
      await this.processManager.restart();
      logger.info(`Auto-restart succeeded for plugin ${this._id}`);
    } catch (e) {
      logger.error(`Auto-restart failed for plugin ${this._id}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.restarting = false;
    }
  }

  get id(): string {
    return this._id;
  }

  get displayName(): string {
    return this._displayName;
  }

  get isolationMode(): IsolationMode {
    return this.mode;
  }

  private async ipc<T>(method: string, args: unknown[]): Promise<T> {
    if (!this.processManager) {
      throw new Error(`插件 ${this._id} 未运行在子进程模式`);
    }
    return this.processManager.call<T>(method, args);
  }

  private lastSyncedApiKey: string | undefined;

  private async syncConfigToWorker(apiKey?: string): Promise<void> {
    if (!this.processManager || apiKey === this.lastSyncedApiKey) return;
    this.lastSyncedApiKey = apiKey;
    await this.processManager.setConfig({ apiKey });
  }

  match(apiUrl: string, model?: string): boolean {
    return safeCall(this.pluginExport.match, [apiUrl, model], false, "match", this._id);
  }

  get videoCapabilities(): VideoCapabilities {
    if (this.cached) return this.cached.videoCapabilities;
    return this.pluginExport.videoCapabilities;
  }

  get imageCapabilities(): ImageCapabilities {
    if (this.cached) return this.cached.imageCapabilities;
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
      this._id,
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
      this._id,
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
      this._id,
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
      this._id,
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
      this._id,
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
      this._id,
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
        this._id,
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
      this._id,
    );
  }

  getModelParameterProfile(modelId: string): ModelParameterProfile {
    const result = safeCall<ModelParameterProfile>(
      this.pluginExport.getModelParameterProfile,
      [modelId],
      null as unknown as ModelParameterProfile,
      "getModelParameterProfile",
      this._id,
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
        this._id,
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
        this._id,
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
        this._id,
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
        this._id,
      );
      if (result) return result;
    }
    return super.extractStatus(response);
  }

  getStatusMethod(): "GET" | "POST" {
    if (this.pluginExport.getStatusMethod) {
      return safeCall<"GET" | "POST">(
        this.pluginExport.getStatusMethod,
        [],
        "GET",
        "getStatusMethod",
        this._id,
      );
    }
    return super.getStatusMethod();
  }

  getAvailableModels(): string[] {
    if (this.cached) return this.cached.availableModels;
    if (this.pluginExport.getAvailableModels) {
      return safeCall<string[]>(
        this.pluginExport.getAvailableModels,
        [],
        [],
        "getAvailableModels",
        this._id,
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
        this._id,
      );
    }
    return undefined;
  }

  getImageTransportMode(purpose: ImagePurpose): ImageTransportMode {
    if (this.pluginExport.getImageTransportMode) {
      return safeCall<ImageTransportMode>(
        this.pluginExport.getImageTransportMode,
        [purpose],
        "url",
        "getImageTransportMode",
        this._id,
      );
    }
    return super.getImageTransportMode(purpose);
  }

  appendAuthToUrl(url: string, apiKey: string): string {
    if (this.pluginExport.appendAuthToUrl) {
      return safeCall<string>(
        this.pluginExport.appendAuthToUrl,
        [url, apiKey],
        url,
        "appendAuthToUrl",
        this._id,
      );
    }
    return super.appendAuthToUrl(url, apiKey);
  }

  getApiKeyDetection(): ApiKeyDetection | undefined {
    if (this.cached) return this.cached.apiKeyDetection;
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
    if (this.cached) return this.cached.preferLocalData;
    return this.pluginExport.preferLocalData;
  }

  async buildVideoRequestAsync(ctx: VideoBuildContext): Promise<VideoRequestResult> {
    if (this.mode === "process") {
      try {
        return await this.ipc<VideoRequestResult>("buildVideoRequest", [ctx]);
      } catch (e) {
        logger.warn(`IPC buildVideoRequest failed for ${this._id}, falling back to sync: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return this.buildVideoRequest(ctx);
  }

  async buildImageRequestAsync(ctx: ImageBuildContext): Promise<ImageRequestResult> {
    if (this.mode === "process") {
      try {
        return await this.ipc<ImageRequestResult>("buildImageRequest", [ctx]);
      } catch (e) {
        logger.warn(`IPC buildImageRequest failed for ${this._id}, falling back to sync: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return this.buildImageRequest(ctx);
  }

  async buildTextRequestAsync(ctx: TextBuildContext): Promise<TextRequestResult> {
    if (this.mode === "process") {
      try {
        return await this.ipc<TextRequestResult>("buildTextRequest", [ctx]);
      } catch (e) {
        logger.warn(`IPC buildTextRequest failed for ${this._id}, falling back to sync: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return this.buildTextRequest(ctx);
  }

  async buildVisionRequestAsync(ctx: VisionBuildContext): Promise<VisionRequestResult> {
    if (this.mode === "process") {
      try {
        return await this.ipc<VisionRequestResult>("buildVisionRequest", [ctx]);
      } catch (e) {
        logger.warn(`IPC buildVisionRequest failed for ${this._id}, falling back to sync: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return this.buildVisionRequest(ctx);
  }

  async getAuthHeadersAsync(apiKey: string, endpoint?: string): Promise<Record<string, string>> {
    if (this.mode === "process") {
      try {
        await this.syncConfigToWorker(apiKey);
        return await this.ipc<Record<string, string>>("getAuthHeaders", [apiKey, endpoint]);
      } catch (e) {
        logger.warn(`IPC getAuthHeaders failed for ${this._id}, falling back to sync: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return this.getAuthHeaders(apiKey, endpoint);
  }

  async extractTaskIdAsync(response: Record<string, unknown>): Promise<string | undefined> {
    if (this.mode === "process") {
      try {
        return await this.ipc<string | undefined>("extractTaskId", [response]);
      } catch (e) {
        logger.warn(`IPC extractTaskId failed for ${this._id}, falling back to sync: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return this.extractTaskId(response);
  }

  async extractVideoUrlAsync(response: Record<string, unknown>): Promise<string | undefined> {
    if (this.mode === "process") {
      try {
        return await this.ipc<string | undefined>("extractVideoUrl", [response]);
      } catch (e) {
        logger.warn(`IPC extractVideoUrl failed for ${this._id}, falling back to sync: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return this.extractVideoUrl(response);
  }

  async extractImageUrlAsync(response: Record<string, unknown>): Promise<string | undefined> {
    if (this.mode === "process") {
      try {
        return await this.ipc<string | undefined>("extractImageUrl", [response]);
      } catch (e) {
        logger.warn(`IPC extractImageUrl failed for ${this._id}, falling back to sync: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return this.extractImageUrl(response);
  }

  async extractStatusAsync(response: Record<string, unknown>): Promise<{ status: string; progress?: number; message?: string }> {
    if (this.mode === "process") {
      try {
        return await this.ipc<{ status: string; progress?: number; message?: string }>("extractStatus", [response]);
      } catch (e) {
        logger.warn(`IPC extractStatus failed for ${this._id}, falling back to sync: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return this.extractStatus(response);
  }

  async extractTextContentAsync(response: Record<string, unknown>): Promise<string> {
    if (this.mode === "process") {
      try {
        return await this.ipc<string>("extractTextContent", [response]);
      } catch (e) {
        logger.warn(`IPC extractTextContent failed for ${this._id}, falling back to sync: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return this.extractTextContent(response);
  }

  async getVideoStatusEndpointAsync(baseUrl: string, taskId: string, model?: string): Promise<string> {
    if (this.mode === "process") {
      try {
        return await this.ipc<string>("getVideoStatusEndpoint", [baseUrl, taskId, model]);
      } catch (e) {
        logger.warn(`IPC getVideoStatusEndpoint failed for ${this._id}, falling back to sync: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return this.getVideoStatusEndpoint(baseUrl, taskId, model);
  }

  async getModelCapabilitiesAsync(modelId: string): Promise<ModelCapabilities> {
    if (this.mode === "process") {
      try {
        return await this.ipc<ModelCapabilities>("getModelCapabilities", [modelId]);
      } catch (e) {
        logger.warn(`IPC getModelCapabilities failed for ${this._id}, falling back to sync: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return this.getModelCapabilities(modelId);
  }

  async getModelParameterProfileAsync(modelId: string): Promise<ModelParameterProfile> {
    if (this.mode === "process") {
      try {
        return await this.ipc<ModelParameterProfile>("getModelParameterProfile", [modelId]);
      } catch (e) {
        logger.warn(`IPC getModelParameterProfile failed for ${this._id}, falling back to sync: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return this.getModelParameterProfile(modelId);
  }

  async getAvailableModelsAsync(): Promise<string[]> {
    if (this.mode === "process") {
      try {
        return await this.ipc<string[]>("getAvailableModels", []);
      } catch (e) {
        logger.warn(`IPC getAvailableModels failed for ${this._id}, falling back to sync: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return this.getAvailableModels();
  }

  async getApiKeyDetectionAsync(): Promise<ApiKeyDetection | undefined> {
    if (this.mode === "process") {
      try {
        return await this.ipc<ApiKeyDetection | undefined>("getApiKeyDetection", []);
      } catch (e) {
        logger.warn(`IPC getApiKeyDetection failed for ${this._id}, falling back to sync: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return this.getApiKeyDetection();
  }

  async getCloudInfoAsync(baseUrl: string): Promise<CloudProviderInfo | undefined> {
    if (this.mode === "process") {
      try {
        return await this.ipc<CloudProviderInfo | undefined>("getCloudInfo", [baseUrl]);
      } catch (e) {
        logger.warn(`IPC getCloudInfo failed for ${this._id}, falling back to sync: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return this.getCloudInfo?.(baseUrl);
  }

  async shutdownProcess(): Promise<void> {
    if (this.processManager) {
      await this.processManager.shutdown();
    }
  }
}
