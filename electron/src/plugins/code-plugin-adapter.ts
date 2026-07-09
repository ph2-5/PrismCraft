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
  /**
   * P1-5 修复：插件死亡标志。
   * 当 attemptRestart 失败（如崩溃次数超限）时设为 true，
   * match() 返回 false 使 PluginRegistry.select() 跳过此 adapter，
   * 避免请求路由到已死亡的插件导致持续失败。
   */
  private disabled = false;
  /**
   * P1-5 三审修复：不可逆销毁标志。
   * dispose() 设置为 true 后，attemptRestart / scheduleRestartRetry / timer 回调
   * 均检查此标志并提前返回，防止 in-flight 重启或 pending 定时器在销毁后
   * spawn 孤儿进程或反转 disabled 状态。
   * 与 disabled 的区别：disabled 是可恢复的（重试成功后清除），disposed 是不可逆的。
   */
  private disposed = false;
  /**
   * P1-5 审查修复：disabled 状态的定时重试机制。
   * 之前 disabled 后无重试，插件永久卡在 disabled 状态，需手动重启应用才能恢复。
   * 现在以指数退避自动重试（60s → 120s → 240s ...），最多 5 次。
   */
  private restartRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private restartRetryCount = 0;
  private static readonly MAX_RESTART_RETRIES = 5;
  private static readonly RESTART_RETRY_BASE_MS = 60_000;

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
    // P1-5 三审修复：disposed 后不再尝试重启
    if (this.restarting || this.disposed) return;
    this.restarting = true;
    try {
      logger.info(`Attempting auto-restart for plugin ${this._id}...`);
      await this.processManager.restart();
      // P1-5 三审修复：dispose() 可能在 await 期间被调用——检查 disposed 避免反转状态
      if (this.disposed) return;
      logger.info(`Auto-restart succeeded for plugin ${this._id}`);
      // 重启成功，清除 disabled 标志和重试计数
      this.disabled = false;
      this.restartRetryCount = 0;
      if (this.restartRetryTimer) {
        clearTimeout(this.restartRetryTimer);
        this.restartRetryTimer = null;
      }
    } catch (e) {
      // P1-5 修复：重启失败时标记 disabled，使 select() 跳过此 adapter。
      // 之前仅 log，插件"静默死亡"——registry 仍匹配到它，后续请求持续失败。
      this.disabled = true;
      logger.error(
        `Auto-restart failed for plugin ${this._id}, marking as disabled: ${e instanceof Error ? e.message : String(e)}`,
      );
      // P1-5 三审修复：dispose() 可能在 await 期间被调用——不再调度重试
      // P1-5 五审修复：shutdownAllProcessManagers 路径不调 dispose()，
      // 但 restart() 会抛 MANAGER_SHUT_DOWN_DURING_RESTART_BACKOFF——识别此错误不调度重试
      const isManagerShutdown = e instanceof Error && e.message === "MANAGER_SHUT_DOWN_DURING_RESTART_BACKOFF";
      if (!this.disposed && !isManagerShutdown) {
        this.scheduleRestartRetry();
      }
    } finally {
      this.restarting = false;
    }
  }

  /**
   * P1-5 审查修复：以指数退避调度重启重试。
   * 60s → 120s → 240s → 480s → 960s，最多 5 次。
   * 达到上限后放弃重试，需手动 reload 插件才能恢复。
   */
  private scheduleRestartRetry(): void {
    // P1-5 三审修复：disposed 后不再调度重试
    if (this.disposed) return;
    if (this.restartRetryCount >= CodePluginAdapter.MAX_RESTART_RETRIES) {
      logger.error(
        `[code-plugin-adapter] 插件 ${this._id} 重启重试已达上限 ${CodePluginAdapter.MAX_RESTART_RETRIES}，放弃重试，需手动 reload 插件`,
      );
      return;
    }
    this.restartRetryCount += 1;
    const delay =
      CodePluginAdapter.RESTART_RETRY_BASE_MS *
      Math.pow(2, this.restartRetryCount - 1);
    logger.info(
      `[code-plugin-adapter] 插件 ${this._id} 将在 ${delay}ms 后重试重启 (${this.restartRetryCount}/${CodePluginAdapter.MAX_RESTART_RETRIES})`,
    );
    // P1-5 审查修复：赋值前先清理前一个 timer，防止覆盖引用导致泄漏
    if (this.restartRetryTimer) {
      clearTimeout(this.restartRetryTimer);
    }
    this.restartRetryTimer = setTimeout(() => {
      this.restartRetryTimer = null;
      // P1-5 三审修复：dispose() 可能在定时器 pending 期间被调用——检查 disposed
      if (this.disposed) return;
      // P1-5 审查修复：若另一个重启正在进行（restarting=true），回滚计数并重新调度，
      // 避免重试次数被空转浪费导致插件过早永久 disabled
      if (this.restarting) {
        this.restartRetryCount = Math.max(0, this.restartRetryCount - 1);
        this.scheduleRestartRetry();
        return;
      }
      void this.attemptRestart();
    }, delay);
  }

  /** P1-5 修复：检查插件是否可用（未 disabled） */
  isAvailable(): boolean {
    return !this.disabled;
  }

  /**
   * P1-5 审查修复：清理定时器并标记 disposed，防止插件卸载/reload 后
   * pending 的 restartRetryTimer 触发 attemptRestart → spawn 孤儿进程。
   * 由 registry.loadCodePlugins 移除旧插件时和 registry.unregister() 调用。
   * P1-5 三审修复：设置不可逆 disposed 标志，使 in-flight attemptRestart 和
   * pending 定时器回调均能检测到销毁状态并提前返回。
   */
  dispose(): void {
    this.disposed = true;
    this.disabled = true;
    if (this.restartRetryTimer) {
      clearTimeout(this.restartRetryTimer);
      this.restartRetryTimer = null;
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
    // P1-5 修复：disabled 状态的插件不参与匹配，使 select() 跳过它
    if (this.disabled) return false;
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
      supportsCharacterRef: false,
      supportsSceneRef: false,
      nativeCharacterRef: false,
      nativeSceneRef: false,
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
    // P1-5 审查修复：先清理定时器，防止 shutdown 后 pending 的 restartRetryTimer 触发孤儿进程
    this.dispose();
    await this.processManager.shutdown();
  }
}
