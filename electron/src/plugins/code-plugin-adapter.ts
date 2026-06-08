import type {
  ModelCapabilities,
  ModelParameterProfile,
  ProviderCapabilities,
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
  MatchPattern,
  AsyncAIProviderPlugin,
} from "./types";
import { BaseAIProviderPlugin } from "./base-provider";
import type { PluginProcessManager } from "./plugin-process-manager";
import { getLogger } from "../logging/logger";

const logger = getLogger("code-plugin-adapter");

interface CachedMetadata {
  capabilities: ProviderCapabilities;
  videoCapabilities: VideoCapabilities;
  imageCapabilities: ImageCapabilities;
  availableModels: string[];
  apiKeyDetection: ApiKeyDetection | undefined;
  preferLocalData: boolean | undefined;
  matchPatterns: MatchPattern[] | undefined;
}

export class CodePluginAdapter extends BaseAIProviderPlugin implements AsyncAIProviderPlugin {
  private readonly processManager: PluginProcessManager;
  private readonly _id: string;
  private readonly _displayName: string;
  private readonly cached: CachedMetadata;
  private restarting = false;

  constructor(processManager: PluginProcessManager, metadata: CachedMetadata) {
    super();
    this.processManager = processManager;
    this._id = processManager.id || metadata.videoCapabilities.defaultModel || "unknown";
    this._displayName = processManager.displayName || "Unknown Plugin";
    this.cached = metadata;

    this.processManager.setOnProcessDeath(() => {
      this.attemptRestart();
    });
  }

  private async attemptRestart(): Promise<void> {
    if (this.restarting) return;
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

  get matchPatterns(): MatchPattern[] | undefined {
    return this.cached.matchPatterns;
  }

  private async ipc<T>(method: string, args: unknown[]): Promise<T> {
    return this.processManager.call<T>(method, args);
  }

  private lastSyncedApiKey: string | undefined;

  private async syncConfigToWorker(apiKey?: string): Promise<void> {
    if (apiKey === this.lastSyncedApiKey) return;
    this.lastSyncedApiKey = apiKey;
    await this.processManager.setConfig({ apiKey });
  }

  match(apiUrl: string, model?: string): boolean {
    if (this.cached.matchPatterns && this.cached.matchPatterns.length > 0) {
      return this.cached.matchPatterns.some((pattern) => {
        const urlMatches = apiUrl.includes(pattern.urlPattern);
        if (!urlMatches) return false;
        if (pattern.modelPattern) {
          return model?.includes(pattern.modelPattern) ?? false;
        }
        return true;
      });
    }
    return false;
  }

  get videoCapabilities(): VideoCapabilities {
    return this.cached.videoCapabilities;
  }

  get imageCapabilities(): ImageCapabilities {
    return this.cached.imageCapabilities;
  }

  get capabilities(): ProviderCapabilities {
    return this.cached.capabilities;
  }

  getModelCapabilities(_modelId: string): ModelCapabilities {
    const fallback: ModelCapabilities = {
      maxReferences: 4,
      maxResolution: 2048,
      maxSizeMB: 10,
      supportsLastFrame: false,
      referenceMode: "separate",
    };
    return fallback;
  }

  buildVideoRequest(_ctx: VideoBuildContext): VideoRequestResult {
    return { body: {}, endpoint: "" };
  }

  buildImageRequest(_ctx: ImageBuildContext): ImageRequestResult {
    return { body: {}, endpoint: "" };
  }

  extractTaskId(data: Record<string, unknown>): string | undefined {
    return super.extractTaskId(data);
  }

  extractVideoUrl(data: Record<string, unknown>): string | undefined {
    return super.extractVideoUrl(data);
  }

  extractImageUrl(data: Record<string, unknown>): string | undefined {
    return super.extractImageUrl(data);
  }

  getVideoStatusEndpoint(baseUrl: string, taskId: string, model?: string): string {
    return super.getVideoStatusEndpoint(baseUrl, taskId, model);
  }

  getAuthHeaders(apiKey: string, _endpoint?: string): Record<string, string> {
    return { Authorization: `Bearer ${apiKey}` };
  }

  getModelParameterProfile(modelId: string): ModelParameterProfile {
    return super.getModelParameterProfile(modelId);
  }

  buildTextRequest(ctx: TextBuildContext): TextRequestResult {
    return super.buildTextRequest(ctx);
  }

  buildVisionRequest(ctx: VisionBuildContext): VisionRequestResult {
    return super.buildVisionRequest(ctx);
  }

  extractTextContent(response: Record<string, unknown>): string {
    return super.extractTextContent(response);
  }

  extractStatus(response: Record<string, unknown>): { status: string; progress?: number; message?: string } {
    return super.extractStatus(response);
  }

  getStatusMethod(): "GET" | "POST" {
    return super.getStatusMethod();
  }

  getAvailableModels(): string[] {
    return this.cached.availableModels;
  }

  getCloudInfo?(_baseUrl: string): CloudProviderInfo | undefined {
    return undefined;
  }

  getImageTransportMode(purpose: ImagePurpose): ImageTransportMode {
    return super.getImageTransportMode(purpose);
  }

  appendAuthToUrl(url: string, _apiKey: string): string {
    return url;
  }

  getApiKeyDetection(): ApiKeyDetection | undefined {
    return this.cached.apiKeyDetection;
  }

  get preferLocalData(): boolean | undefined {
    return this.cached.preferLocalData;
  }

  async buildVideoRequestAsync(ctx: VideoBuildContext): Promise<VideoRequestResult> {
    return this.ipc<VideoRequestResult>("buildVideoRequest", [ctx]);
  }

  async buildImageRequestAsync(ctx: ImageBuildContext): Promise<ImageRequestResult> {
    return this.ipc<ImageRequestResult>("buildImageRequest", [ctx]);
  }

  async buildTextRequestAsync(ctx: TextBuildContext): Promise<TextRequestResult> {
    return this.ipc<TextRequestResult>("buildTextRequest", [ctx]);
  }

  async buildVisionRequestAsync(ctx: VisionBuildContext): Promise<VisionRequestResult> {
    return this.ipc<VisionRequestResult>("buildVisionRequest", [ctx]);
  }

  async getAuthHeadersAsync(apiKey: string, endpoint?: string): Promise<Record<string, string>> {
    await this.syncConfigToWorker(apiKey);
    return this.ipc<Record<string, string>>("getAuthHeaders", [apiKey, endpoint]);
  }

  async extractTaskIdAsync(response: Record<string, unknown>): Promise<string | undefined> {
    return this.ipc<string | undefined>("extractTaskId", [response]);
  }

  async extractVideoUrlAsync(response: Record<string, unknown>): Promise<string | undefined> {
    return this.ipc<string | undefined>("extractVideoUrl", [response]);
  }

  async extractImageUrlAsync(response: Record<string, unknown>): Promise<string | undefined> {
    return this.ipc<string | undefined>("extractImageUrl", [response]);
  }

  async extractStatusAsync(response: Record<string, unknown>): Promise<{ status: string; progress?: number; message?: string }> {
    return this.ipc<{ status: string; progress?: number; message?: string }>("extractStatus", [response]);
  }

  async extractTextContentAsync(response: Record<string, unknown>): Promise<string> {
    return this.ipc<string>("extractTextContent", [response]);
  }

  async getVideoStatusEndpointAsync(baseUrl: string, taskId: string, model?: string): Promise<string> {
    return this.ipc<string>("getVideoStatusEndpoint", [baseUrl, taskId, model]);
  }

  async getModelCapabilitiesAsync(modelId: string): Promise<ModelCapabilities> {
    return this.ipc<ModelCapabilities>("getModelCapabilities", [modelId]);
  }

  async getModelParameterProfileAsync(modelId: string): Promise<ModelParameterProfile> {
    return this.ipc<ModelParameterProfile>("getModelParameterProfile", [modelId]);
  }

  async getAvailableModelsAsync(): Promise<string[]> {
    return this.ipc<string[]>("getAvailableModels", []);
  }

  async getApiKeyDetectionAsync(): Promise<ApiKeyDetection | undefined> {
    return this.ipc<ApiKeyDetection | undefined>("getApiKeyDetection", []);
  }

  async getCloudInfoAsync(baseUrl: string): Promise<CloudProviderInfo | undefined> {
    return this.ipc<CloudProviderInfo | undefined>("getCloudInfo", [baseUrl]);
  }

  async shutdownProcess(): Promise<void> {
    await this.processManager.shutdown();
  }
}
