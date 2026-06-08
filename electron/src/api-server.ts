import http from "http";
import type net from "net";
import fs from "fs";
import path from "path";
import { handleConfig, handleSecureConfig } from "./handlers/config";
import { handleTestConnection } from "./handlers/test-connection";
import { handleSyncConfig, handleSyncTest, handleSyncProxy } from "./handlers/sync";
import * as apiGateway from "./api-gateway";
import * as storyService from "./services/story/story-service";
import * as videoTaskService from "./services/video/video-task-service";
import * as promptService from "./services/prompt/prompt-service";
import { pluginRegistry, saveUserPlugin, deleteUserPlugin, listUserPluginFiles, validatePluginConfig, getAllProcessMetrics } from "./plugins";
import type { UserPluginConfig } from "./plugins";
import * as referenceEngine from "./services/shot/reference-engine";
import * as consistencyCheck from "./services/shot/consistency-check";
import * as referenceCheck from "./services/shot/reference-check";
import * as visualConsistencyCheck from "./services/shot/visual-consistency-check";
import * as storyboardGeneration from "./services/story/storyboard-generation";
import * as videoTracker from "./services/video/video-tracker";
import * as videoRecovery from "./services/video/video-recovery";
import { getLogger } from "./logging";
import type { RouteHandler } from "./types/api";
import { API_SERVER_PORT, APP_SERVER_PORT, DEV_SERVER_PORT } from "./config/ports";
import { getDb, CURRENT_SCHEMA_VERSION } from "./database";

const logger = getLogger("api-server");
const serverStartTime = Date.now();
let pluginCacheInvalidationToken = 0;

let apiServer: http.Server | null = null;
const apiConnections: Set<net.Socket> = new Set();
const API_PORT = API_SERVER_PORT;
const MAX_REQUEST_BODY_SIZE = 50 * 1024 * 1024;

interface RateLimitEntry {
  windowMs: number;
  max: number;
  requests: Map<string, number[]>;
  check(ip: string): boolean;
  cleanup(): void;
}

const rateLimit: RateLimitEntry = {
  windowMs: 60000,
  max: 180,
  requests: new Map(),

  check(ip: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    if (!this.requests.has(ip)) {
      this.requests.set(ip, []);
    }

    const requests = this.requests.get(ip)!;
    const validRequests = requests.filter(
      (timestamp) => timestamp > windowStart,
    );
    this.requests.set(ip, validRequests);

    if (validRequests.length >= this.max) {
      return false;
    }

    validRequests.push(now);
    return true;
  },

  cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    for (const [ip, requests] of this.requests.entries()) {
      const valid = requests.filter((t) => t > windowStart);
      if (valid.length === 0) {
        this.requests.delete(ip);
      } else {
        this.requests.set(ip, valid);
      }
    }
    if (this.requests.size > 10000) {
      const entries = Array.from(this.requests.entries());
      entries.sort((a, b) => {
        const aLast = a[1][a[1].length - 1] || 0;
        const bLast = b[1][b[1].length - 1] || 0;
        return bLast - aLast;
      });
      this.requests = new Map(entries.slice(0, 10000));
    }
  },
};

const cleanupTimer = setInterval(() => rateLimit.cleanup(), 60000);
if (cleanupTimer.unref) {
  cleanupTimer.unref();
}

interface Route {
  handler: RouteHandler;
  methods: string[];
}

function resolveDocsPath(fileName: string): string {
  const candidates = [
    path.join(__dirname, "..", "..", "docs", fileName),
    path.join(__dirname, "..", "docs", fileName),
    path.join(process.resourcesPath || "", "app", "out", "docs", fileName),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch (e) { logger.warn("API请求处理失败", { error: e instanceof Error ? e.message : String(e) }); }
  }
  return candidates[0]!;
}

const routes: Record<string, Route> = {
  config: { handler: handleConfig, methods: ["GET", "POST", "HEAD"] },
  "secure-config": { handler: handleSecureConfig, methods: ["POST"] },
  upload: { handler: (_m, b) => apiGateway.handleUpload(b), methods: ["POST"] },
  "analyze-image": {
    handler: (_m, b) => apiGateway.analyzeImage(b),
    methods: ["POST"],
  },
  "generate-image": {
    handler: (_m, b) => apiGateway.generateImage(b),
    methods: ["POST"],
  },
  "generate-keyframe": {
    handler: (_m, b) => apiGateway.generateKeyframe(b),
    methods: ["POST"],
  },
  "generate-frame-pair": {
    handler: (_m, b) => apiGateway.generateFramePair(b),
    methods: ["POST"],
  },
  "generate-video": {
    handler: (_m, b) => apiGateway.generateVideo(b),
    methods: ["POST"],
  },
  "video-status": {
    handler: (_m, b) => apiGateway.videoStatus(b),
    methods: ["GET", "POST"],
  },
  "generate-text": {
    handler: (_m, b) => apiGateway.generateText(b),
    methods: ["POST"],
  },
  "test-connection": { handler: handleTestConnection, methods: ["POST"] },
  "sync/config": { handler: handleSyncConfig, methods: ["GET", "POST"] },
  "sync/test": { handler: handleSyncTest, methods: ["POST"] },
  "sync/proxy": { handler: handleSyncProxy, methods: ["POST"] },
  export: {
    handler: async (_m, b) => {
      const { data, format } = b;
      if (!data) {
        return { success: false, error: "No data provided" };
      }
      const content =
        typeof data === "string" ? data : JSON.stringify(data, null, 2);
      const filename = `ai-animation-export-${crypto.randomUUID()}.${format || "json"}`;
      return { success: true, data: { content, filename } };
    },
    methods: ["POST"],
  },
  "story/plan": {
    handler: async (_m, b) => {
      const result = await storyService.generateStoryPlanWithValidation(
        (b.story || {}) as Record<string, unknown>,
        (b.characters || []) as unknown[],
        (b.scenes || []) as unknown[],
        { ...((b.options || {}) as Record<string, unknown>), planPrompt: b.planPrompt as string | undefined },
        (prompt: string, opts: Record<string, unknown>) => apiGateway.generateText({ prompt, ...opts }),
      );
      return { success: true, data: result };
    },
    methods: ["POST"],
  },
  "story/generate-video": {
    handler: async (_m, b) => {
      const params = videoTaskService.buildVideoGenerationParams(b);
      return apiGateway.generateVideo(params as unknown as Record<string, unknown>);
    },
    methods: ["POST"],
  },
  "story/generate-keyframe": {
    handler: async (_m, b) => {
      const params = videoTaskService.buildKeyframeGenerationParams(b as unknown as Parameters<typeof videoTaskService.buildKeyframeGenerationParams>[0]);
      return apiGateway.generateKeyframe(params);
    },
    methods: ["POST"],
  },
  "story/generate-frame-pair": {
    handler: async (_m, b) => {
      const params = videoTaskService.buildFramePairGenerationParams(b as unknown as Parameters<typeof videoTaskService.buildFramePairGenerationParams>[0]);
      const firstFrameResult = await apiGateway.generateKeyframe({
        ...params.firstFrame,
        prompt:
          params.firstFrame.prompt ||
          promptService.generateFirstFramePrompt(params.firstFrame),
      });
      let lastFrameResult: { success: boolean; data?: { imageUrl?: string }; error?: string | { code: string; message: string } } | null = null;
      if (firstFrameResult.success) {
        lastFrameResult = await apiGateway.generateKeyframe({
          ...params.lastFrame,
          prompt:
            params.lastFrame.prompt ||
            promptService.generateLastFramePrompt(params.lastFrame),
        });
      }
      return {
        success: true,
        data: {
          firstFrameUrl: firstFrameResult.data?.imageUrl,
          lastFrameUrl: lastFrameResult?.success
            ? lastFrameResult.data?.imageUrl
            : null,
          lastFrameError:
            lastFrameResult && !lastFrameResult.success
              ? lastFrameResult.error
              : null,
        },
      };
    },
    methods: ["POST"],
  },
  "quick-generate/video": {
    handler: async (_m, b) => {
      const params = videoTaskService.buildQuickVideoParams(b);
      return apiGateway.generateVideo(params);
    },
    methods: ["POST"],
  },
  "character/generate-image": {
    handler: async (_m, b) => {
      const character = (b.character ?? {}) as import("./services/prompt/prompt-service").CharacterInput;
      const useDetailedPrompt = b.useDetailedPrompt as boolean | undefined;
      const imageSize = b.imageSize as string | undefined;
      const providerId = b.providerId as string | undefined;
      const modelId = b.modelId as string | undefined;
      const imagePrompt = b.imagePrompt as string | undefined;
      const detailedPromptInstruction = b.detailedPromptInstruction as string | undefined;
      let finalPrompt: string =
        imagePrompt || promptService.generateCharacterImagePrompt(character);
      if (useDetailedPrompt && !imagePrompt) {
        const instruction: string =
          detailedPromptInstruction ||
          promptService.generateCharacterDetailedPromptInstruction(character);
        const detailedResult = await apiGateway.generateText({
          prompt: instruction,
          maxTokens: 300,
          temperature: 0.7,
        });
        if (detailedResult.success && (detailedResult.data as Record<string, unknown>)?.text) {
          finalPrompt = (detailedResult.data as Record<string, unknown>).text as string;
        }
      }
      return apiGateway.generateImage({
        prompt: finalPrompt,
        category: "character",
        size: imageSize || "1024x1024",
        providerId,
        modelId,
      });
    },
    methods: ["POST"],
  },
  "scene/generate-image": {
    handler: async (_m, b) => {
      const scene = (b.scene ?? {}) as import("./services/prompt/prompt-service").SceneInput;
      const useDetailedPrompt = b.useDetailedPrompt as boolean | undefined;
      const imageSize = b.imageSize as string | undefined;
      const providerId = b.providerId as string | undefined;
      const modelId = b.modelId as string | undefined;
      const imagePrompt = b.imagePrompt as string | undefined;
      const detailedPromptInstruction = b.detailedPromptInstruction as string | undefined;
      const sceneRecord = scene as Record<string, unknown> | undefined;
      let finalPrompt: string =
        imagePrompt ||
        (sceneRecord?.imageGenerationPrompt as string) ||
        promptService.generateSceneImagePrompt(scene);
      if (useDetailedPrompt && !imagePrompt) {
        const instruction: string =
          detailedPromptInstruction ||
          promptService.generateScenePromptOptimization(
            (sceneRecord?.description as string) || finalPrompt,
          );
        const detailedResult = await apiGateway.generateText({
          prompt: instruction,
          maxTokens: 300,
          temperature: 0.8,
        });
        if (detailedResult.success && (detailedResult.data as Record<string, unknown>)?.text) {
          finalPrompt = (detailedResult.data as Record<string, unknown>).text as string;
        }
      }
      return apiGateway.generateImage({
        prompt: finalPrompt,
        category: "scene",
        size: imageSize || "1024x1024",
        providerId,
        modelId,
      });
    },
    methods: ["POST"],
  },
  "character/analyze-image": {
    handler: async (_m, b) => {
      const analysisPrompt: string =
        (b.analysisPrompt as string) || promptService.generateCharacterAnalysisPrompt();
      return apiGateway.analyzeImage({ ...b, prompt: analysisPrompt });
    },
    methods: ["POST"],
  },
  "scene/analyze-image": {
    handler: async (_m, b) => {
      const analysisPrompt: string =
        (b.analysisPrompt as string) || promptService.generateSceneAnalysisPrompt();
      return apiGateway.analyzeImage({ ...b, prompt: analysisPrompt });
    },
    methods: ["POST"],
  },
  "video/select-strategy": {
    handler: async (_m, b) => {
      const apiUrl = (b.apiUrl as string) || "";
      const model = (b.model as string) || "";
      const plugin = pluginRegistry.select(apiUrl, model);
      if (!plugin) {
        return { success: false, error: "未找到匹配的视频服务商策略" };
      }
      return {
        success: true,
        data: {
          name: plugin.displayName,
          id: plugin.id,
        },
      };
    },
    methods: ["POST"],
  },
  "video/detect-format": {
    handler: async (_m, b) => {
      const apiUrl = (b.apiUrl as string) || "";
      const modelId = b.modelId as string | undefined;
      const plugin = pluginRegistry.select(apiUrl, modelId);
      const format = plugin?.id || "openai-compatible";
      return { success: true, data: { format } };
    },
    methods: ["POST"],
  },
  "plugins/list": {
    handler: async () => {
      const allPlugins = pluginRegistry.getAll();
      const capabilities = pluginRegistry.getAllCapabilities();
      const modelProfiles = pluginRegistry.getAllModelProfiles();
      const userPluginFiles = listUserPluginFiles();
      return {
        success: true,
        data: {
          plugins: allPlugins.map((p) => ({
            id: p.id,
            displayName: p.displayName,
            isUserPlugin: pluginRegistry.isUserPlugin(p.id),
            isCodePlugin: pluginRegistry.isCodePlugin(p.id),
            capabilities: p.capabilities,
            videoCapabilities: p.videoCapabilities,
            imageCapabilities: p.imageCapabilities,
          })),
          capabilities,
          modelProfiles,
          userPluginFiles,
        },
      };
    },
    methods: ["GET"],
  },
  "plugins/capabilities": {
    handler: async () => {
      const allPlugins = pluginRegistry.getAll();
      const providerCapabilities: Record<string, {
        id: string;
        displayName: string;
        capabilities: { video: boolean; image: boolean; text: boolean; vision: boolean };
        supportsLastFrame: boolean;
        supportsReferenceVideo: boolean;
        supportsMimicryLevel: boolean;
        supportsReferenceImage: boolean;
        defaultVideoModel: string;
        defaultImageModel: string;
        maxDuration: number;
        supportedCodecs: string[];
      }> = {};
      for (const plugin of allPlugins) {
        providerCapabilities[plugin.id] = {
          id: plugin.id,
          displayName: plugin.displayName,
          capabilities: plugin.capabilities,
          supportsLastFrame: plugin.videoCapabilities.supportsLastFrame,
          supportsReferenceVideo: plugin.videoCapabilities.supportsReferenceVideo,
          supportsMimicryLevel: plugin.videoCapabilities.supportsMimicryLevel,
          supportsReferenceImage: plugin.imageCapabilities.supportsReferenceImage,
          defaultVideoModel: plugin.videoCapabilities.defaultModel,
          defaultImageModel: plugin.imageCapabilities.defaultModel,
          maxDuration: plugin.videoCapabilities.maxDuration,
          supportedCodecs: plugin.videoCapabilities.supportedCodecs || ["h264", "h265"],
        };
      }
      return { success: true, data: providerCapabilities };
    },
    methods: ["GET"],
  },
  "plugins/detection-rules": {
    handler: async () => {
      const allPlugins = pluginRegistry.getAll();
      const rules: Array<{
        pluginId: string;
        rules: Array<{ pattern: string; confidence: "high" | "medium" | "low" }>;
        suggestedName: string;
        baseUrl?: string;
        isUserPlugin: boolean;
        isCodePlugin: boolean;
      }> = [];
      for (const plugin of allPlugins) {
        const detection = plugin.getApiKeyDetection?.();
        if (detection && detection.rules.length > 0) {
          rules.push({
            pluginId: plugin.id,
            rules: detection.rules.map((r) => ({
              pattern: r.pattern,
              confidence: r.confidence,
            })),
            suggestedName: detection.suggestedName,
            baseUrl: detection.baseUrl,
            isUserPlugin: pluginRegistry.isUserPlugin(plugin.id),
            isCodePlugin: pluginRegistry.isCodePlugin?.(plugin.id) ?? false,
          });
        }
      }
      rules.sort((a, b) => {
        const confidenceOrder = { high: 0, medium: 1, low: 2 };
        const aMin = Math.min(...a.rules.map((r) => confidenceOrder[r.confidence]));
        const bMin = Math.min(...b.rules.map((r) => confidenceOrder[r.confidence]));
        return aMin - bMin;
      });
      return { success: true, data: rules };
    },
    methods: ["GET"],
  },
  "plugins/add": {
    handler: async (_m, b) => {
      const config = b.config as UserPluginConfig;
      if (!config) {
        return { success: false, error: "缺少插件配置" };
      }
      const validation = validatePluginConfig(config);
      if (!validation.valid) {
        return { success: false, error: `插件配置无效: ${validation.errors.join("; ")}` };
      }
      const existing = pluginRegistry.selectById(config.id);
      if (existing && !pluginRegistry.isUserPlugin(config.id)) {
        return { success: false, error: `插件 ID "${config.id}" 与内置插件冲突` };
      }
      const result = saveUserPlugin(config);
      if (!result.success) {
        return { success: false, error: result.error };
      }
      const reloadResult = pluginRegistry.reloadUserPlugins();
      pluginCacheInvalidationToken++;
      return {
        success: true,
        data: {
          filePath: result.filePath,
          loadedCount: reloadResult.loaded,
          reloadErrors: reloadResult.errors,
          cacheInvalidationToken: pluginCacheInvalidationToken,
        },
      };
    },
    methods: ["POST"],
  },
  "plugins/delete": {
    handler: async (_m, b) => {
      const pluginId = b.pluginId as string;
      if (!pluginId) {
        return { success: false, error: "缺少 pluginId" };
      }
      if (!pluginRegistry.isUserPlugin(pluginId)) {
        return { success: false, error: "不能删除内置插件" };
      }
      const result = deleteUserPlugin(pluginId);
      if (!result.success) {
        return { success: false, error: result.error };
      }
      pluginRegistry.unregister(pluginId);
      pluginCacheInvalidationToken++;
      return { success: true, data: { cacheInvalidationToken: pluginCacheInvalidationToken } };
    },
    methods: ["POST"],
  },
  "plugins/reload": {
    handler: async () => {
      const result = pluginRegistry.reloadUserPlugins();
      pluginCacheInvalidationToken++;
      return { success: true, data: { loaded: result.loaded, errors: result.errors, cacheInvalidationToken: pluginCacheInvalidationToken } };
    },
    methods: ["POST"],
  },
  "plugins/reload-code": {
    handler: async () => {
      const result = await pluginRegistry.loadCodePlugins();
      pluginCacheInvalidationToken++;
      return { success: true, data: { loaded: result.loaded, errors: result.errors, cacheInvalidationToken: pluginCacheInvalidationToken } };
    },
    methods: ["POST"],
  },
  "plugins/process-metrics": {
    handler: async () => {
      const metrics = getAllProcessMetrics();
      return { success: true, data: metrics };
    },
    methods: ["GET"],
  },
  "plugins/validate": {
    handler: async (_m, b) => {
      const config = b.config as UserPluginConfig;
      if (!config) {
        return { success: false, error: "缺少插件配置" };
      }
      const validation = validatePluginConfig(config);
      return { success: true, data: { valid: validation.valid, errors: validation.errors } };
    },
    methods: ["POST"],
  },
  "plugins/schema": {
    handler: async () => {
      try {
        const schemaPath = resolveDocsPath("plugin-spec.schema.json");
        const schemaContent = fs.readFileSync(schemaPath, "utf-8");
        const schema = JSON.parse(schemaContent);
        return {
          success: true,
          data: schema,
        };
      } catch (e) {
        return {
          success: false,
          error: `Failed to load plugin schema: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
    },
    methods: ["GET"],
  },
  "plugins/specification": {
    handler: async () => {
      try {
        const specPath = resolveDocsPath("plugin-specification.md");
        const content = fs.readFileSync(specPath, "utf-8");
        return {
          success: true,
          data: { content },
        };
      } catch (e) {
        return {
          success: false,
          error: `Failed to load plugin specification: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
    },
    methods: ["GET"],
  },
  "plugins/templates": {
    handler: async () => {
      return {
        success: true,
        data: {
          templates: [
            {
              id: "openai-compatible",
              displayName: "OpenAI 兼容提供商",
              description: "适用于所有兼容 OpenAI API 格式的提供商（如 DeepSeek、Moonshot、SiliconFlow）",
              template: {
                id: "",
                version: "1.0.0",
                displayName: "",
                match: { apiUrlPatterns: [{ pattern: "", type: "contains" }] },
                availableModels: [],
                capabilities: {
                  video: { supported: true, defaultModel: "", maxDuration: 10, supportsLastFrame: false, supportsReferenceVideo: false },
                  image: { supported: true, defaultModel: "" },
                },
                endpoints: {
                  video: { generate: "/v1/videos/generations", status: "/v1/videos/generations/{taskId}" },
                  image: { generate: "/v1/images/generations" },
                },
                request: {
                  video: { bodyFormat: "openai-content", promptField: "prompt", modelField: "model" },
                  image: { bodyFormat: "openai-content", promptField: "prompt", modelField: "model" },
                },
                response: {
                  video: { taskIdPath: "data.task_id", statusPath: "data.status", videoUrlPath: "data.video_url" },
                  image: { imageUrlPath: "data.image_url" },
                },
                auth: { type: "bearer" },
                models: {},
              },
            },
            {
              id: "custom-api",
              displayName: "自定义 API 格式",
              description: "适用于非标准 API 格式的提供商，需要手动配置请求和响应映射",
              template: {
                id: "",
                version: "1.0.0",
                displayName: "",
                match: { apiUrlPatterns: [{ pattern: "", type: "contains" }] },
                availableModels: [],
                capabilities: {
                  video: { supported: true, defaultModel: "", maxDuration: 10, supportsLastFrame: false, supportsReferenceVideo: false },
                },
                endpoints: {
                  video: { generate: "", status: "" },
                },
                request: {
                  video: { bodyFormat: "custom", promptField: "prompt", modelField: "model", customBodyTemplate: "{}" },
                },
                response: {
                  video: { taskIdPath: "", statusPath: "", videoUrlPath: "" },
                },
                auth: { type: "api-key-header", headerName: "X-API-Key" },
                models: {},
              },
            },
            {
              id: "image-only",
              displayName: "仅图片生成",
              description: "适用于只提供图片生成能力的提供商（如 MidJourney API 代理）",
              template: {
                id: "",
                version: "1.0.0",
                displayName: "",
                match: { apiUrlPatterns: [{ pattern: "", type: "contains" }] },
                availableModels: [],
                capabilities: {
                  image: { supported: true, defaultModel: "" },
                },
                endpoints: {
                  image: { generate: "/v1/images/generations" },
                },
                request: {
                  image: { bodyFormat: "openai-content", promptField: "prompt", modelField: "model" },
                },
                response: {
                  image: { imageUrlPath: "data.image_url" },
                },
                auth: { type: "bearer" },
                models: {},
              },
            },
          ],
        },
      };
    },
    methods: ["GET"],
  },
  "video/tracking-info": {
    handler: async (_m, b) => {
      const taskId = b.taskId as string;
      const apiUrl = b.apiUrl as string;
      const apiKeyPreview = b.apiKeyPreview as string;
      const model = b.model as string;
      const info = videoTracker.buildTrackingInfo(
        taskId,
        apiUrl,
        apiKeyPreview,
        model,
      );
      return { success: true, data: info };
    },
    methods: ["POST"],
  },
  "video/provider-info": {
    handler: async (_m, b) => {
      const apiUrl = b.apiUrl as string | undefined;
      const info = videoTracker.getProviderInfo(apiUrl);
      return { success: true, data: info };
    },
    methods: ["POST"],
  },
  "shot/validate-reference": {
    handler: async (_m, b) => {
      const shot = b.shot as import("./services/shot/reference-engine").Shot;
      const allShots = b.allShots as import("./services/shot/reference-engine").Shot[];
      const reference = b.reference as import("./services/shot/reference-engine").Reference;
      const result = referenceEngine.validateReference(
        shot,
        allShots,
        reference,
      );
      return { success: true, data: result };
    },
    methods: ["POST"],
  },
  "shot/get-reference-video-url": {
    handler: async (_m, b) => {
      const shot = b.shot as import("./services/shot/reference-engine").Shot;
      const allShots = b.allShots as import("./services/shot/reference-engine").Shot[];
      const reference = b.reference as import("./services/shot/reference-engine").Reference;
      const url = referenceEngine.getReferenceVideoUrl(
        shot,
        allShots,
        reference,
      );
      return { success: true, data: { videoUrl: url } };
    },
    methods: ["POST"],
  },
  "shot/build-reference-description": {
    handler: async (_m, b) => {
      const shot = b.shot as import("./services/shot/reference-engine").Shot;
      const allShots = b.allShots as import("./services/shot/reference-engine").Shot[];
      const reference = b.reference as import("./services/shot/reference-engine").Reference;
      const desc = referenceEngine.buildReferenceDescription(
        shot,
        allShots,
        reference,
      );
      return { success: true, data: { description: desc } };
    },
    methods: ["POST"],
  },
  "validate/consistency": {
    handler: async (_m, b) => {
      const result = consistencyCheck.performConfigCheck(b as unknown as Parameters<typeof consistencyCheck.performConfigCheck>[0]);
      return { success: true, data: result };
    },
    methods: ["POST"],
  },
  "validate/feature-anchoring": {
    handler: async (_m, b) => {
      const config = b.config as import("./services/shot/consistency-check").FeatureAnchoringConfig;
      const result = consistencyCheck.validateFeatureAnchoringConfig(config);
      return { success: true, data: result };
    },
    methods: ["POST"],
  },
  "validate/no-frame-binding": {
    handler: async (_m, b) => {
      const result = consistencyCheck.validateNoFrameBinding(b);
      return { success: true, data: result };
    },
    methods: ["POST"],
  },
  "reference/check-character": {
    handler: async (_m, b) => {
      const characterId = b.characterId as string;
      const stories = b.stories as import("./services/shot/reference-check").Story[];
      const result = referenceCheck.checkCharacterReferences(
        characterId,
        stories,
      );
      return { success: true, data: result };
    },
    methods: ["POST"],
  },
  "reference/check-scene": {
    handler: async (_m, b) => {
      const sceneId = b.sceneId as string;
      const stories = b.stories as import("./services/shot/reference-check").Story[];
      const result = referenceCheck.checkSceneReferences(sceneId, stories);
      return { success: true, data: result };
    },
    methods: ["POST"],
  },
  "visual-consistency/check": {
    handler: async (_m, b) => {
      const generatedImageUrl = b.generatedImageUrl as string | undefined;
      const referenceImageUrl = b.referenceImageUrl as string | undefined;
      const element = (b.element ?? {}) as import("./services/shot/visual-consistency-check").Element;
      const result = await visualConsistencyCheck.checkVisualConsistency(
        apiGateway as unknown as import("./services/story/storyboard-generation").ApiGateway,
        {
          generatedImageUrl,
          referenceImageUrl,
          element,
        },
      );
      return { success: true, data: result };
    },
    methods: ["POST"],
  },
  "visual-consistency/check-beat": {
    handler: async (_m, b) => {
      const beat = b.beat as import("./services/shot/visual-consistency-check").Beat;
      const elements = b.elements as import("./services/shot/visual-consistency-check").Element[];
      const generatedImageMap = b.generatedImageMap as Record<string, string> | undefined;
      const result = await visualConsistencyCheck.checkBeatElementConsistency(
        apiGateway as unknown as import("./services/story/storyboard-generation").ApiGateway,
        {
          beat,
          elements,
          getGeneratedImageUrl: (elementId: string) =>
            (generatedImageMap || {})[elementId],
        },
      );
      return { success: true, data: result };
    },
    methods: ["POST"],
  },
  "storyboard/generate-keyframe": {
    handler: async (_m, b) => {
      const beat = b.beat as import("./services/story/storyboard-generation").Beat;
      const prevBeat = b.prevBeat as import("./services/story/storyboard-generation").Beat | undefined;
      const options = (b.options || {}) as Record<string, unknown>;
      const result = await storyboardGeneration.generateBeatKeyframe(
        apiGateway as unknown as import("./services/story/storyboard-generation").ApiGateway,
        promptService,
        beat,
        prevBeat,
        options,
      );
      return { success: true, data: result };
    },
    methods: ["POST"],
  },
  "storyboard/generate-frame-pair": {
    handler: async (_m, b) => {
      const beat = b.beat as import("./services/story/storyboard-generation").Beat;
      const options = (b.options || {}) as Record<string, unknown>;
      const result = await storyboardGeneration.generateBeatFramePair(
        apiGateway as unknown as import("./services/story/storyboard-generation").ApiGateway,
        promptService,
        beat,
        options,
      );
      return { success: true, data: result };
    },
    methods: ["POST"],
  },
  "storyboard/generate-video": {
    handler: async (_m, b) => {
      const beat = b.beat as import("./services/story/storyboard-generation").Beat;
      const options = (b.options || {}) as Record<string, unknown>;
      const result = await storyboardGeneration.generateBeatVideo(
        apiGateway as unknown as import("./services/story/storyboard-generation").ApiGateway,
        beat,
        options,
      );
      return { success: true, data: result };
    },
    methods: ["POST"],
  },
  "storyboard/generate-full-workflow": {
    handler: async (_m, b) => {
      const beat = b.beat as import("./services/story/storyboard-generation").Beat;
      const prevBeat = b.prevBeat as import("./services/story/storyboard-generation").Beat | undefined;
      const options = (b.options || {}) as Record<string, unknown>;
      const result = await storyboardGeneration.generateBeatFullWorkflow(
        apiGateway as unknown as import("./services/story/storyboard-generation").ApiGateway,
        promptService,
        beat,
        prevBeat,
        options,
      );
      return { success: true, data: result };
    },
    methods: ["POST"],
  },
  "storyboard/generate-keyframe-chain": {
    handler: async (_m, b) => {
      const beats = b.beats as import("./services/story/storyboard-generation").Beat[];
      const options = (b.options || {}) as Record<string, unknown>;
      const result = await storyboardGeneration.generateKeyframeChain(
        apiGateway as unknown as import("./services/story/storyboard-generation").ApiGateway,
        promptService,
        beats,
        options,
      );
      return { success: true, data: result };
    },
    methods: ["POST"],
  },
  "video/recover": {
    handler: async (_m, b) => {
      const taskId = b.taskId as string;
      const taskRecord = b.taskRecord as Record<string, unknown> | undefined;
      const result = await videoRecovery.recoverVideoByTaskId(
        apiGateway as unknown as import("./services/story/storyboard-generation").ApiGateway,
        taskId,
        taskRecord,
      );
      return { success: true, data: result };
    },
    methods: ["POST"],
  },
  "video-tasks/bulk-save": {
    handler: async (_m, b) => {
      const tasks = b.tasks as Array<Record<string, unknown>> | undefined;
      if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
        return { success: true, saved: 0 };
      }
      try {
        const db = getDb();
        const insertStmt = db.prepare(
          `INSERT OR REPLACE INTO video_tasks
           (id, status, progress, video_url, story_id, beat_id, message, config, provider, media_refs, tracking, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        const updateStmt = db.prepare(
          `UPDATE video_tasks SET status = ?, progress = ?, video_url = ?, message = ?, updated_at = ? WHERE id = ?`,
        );
        let saved = 0;
        const nowSec = Math.floor(Date.now() / 1000);
        db.transaction(() => {
          for (const task of tasks) {
            try {
              const taskId = task.taskId as string || task.id as string;
              if (!taskId) continue;
              const status = (task.status as string) || "pending";
              const progress = (task.progress as number) || 0;
              const videoUrl = (task.videoUrl as string) || null;
              const storyId = (task.storyId as string) || null;
              const beatId = (task.beatId as string) || null;
              const message = (task.message as string) || null;
              const config = task.config ? JSON.stringify(task.config) : "{}";
              const provider = task.provider ? JSON.stringify(task.provider) : "{}";
              const mediaRefs = task.mediaRefs ? JSON.stringify(task.mediaRefs) : "{}";
              const tracking = task.tracking ? JSON.stringify(task.tracking) : "{}";
              const createdAt = typeof task.createdAt === "number"
                ? task.createdAt
                : nowSec;

              const existing = db.prepare("SELECT id FROM video_tasks WHERE id = ?").get(taskId) as { id: string } | undefined;
              if (existing) {
                updateStmt.run(status, progress, videoUrl, message, nowSec, taskId);
              } else {
                insertStmt.run(taskId, status, progress, videoUrl, storyId, beatId, message, config, provider, mediaRefs, tracking, createdAt, nowSec);
              }
              saved++;
            } catch {
              logger.warn("[API] Failed to save individual video task in bulk-save");
            }
          }
        });
        return { success: true, saved };
      } catch (error) {
        logger.error("[API] video-tasks/bulk-save failed:", error instanceof Error ? error : undefined);
        return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
      }
    },
    methods: ["POST"],
  },
};

const allowedOrigins = new Set<string>();

function registerAllowedOrigin(port: number): void {
  allowedOrigins.add(`http://localhost:${port}`);
  allowedOrigins.add(`http://127.0.0.1:${port}`);
}

registerAllowedOrigin(APP_SERVER_PORT);
registerAllowedOrigin(DEV_SERVER_PORT);

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  return allowedOrigins.has(origin);
}

function startApiServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    apiServer = http.createServer(async (req, res) => {
      const origin = req.headers.origin || "";
      if (isAllowedOrigin(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
      } else if (origin) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Origin not allowed" }));
        return;
      }

      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Electron-App",
      );
      res.setHeader("Content-Type", "application/json");

      if (req.method === "OPTIONS") {
        res.writeHead(200);
        res.end();
        return;
      }

      const urlParts = (req.url || "").split("?");
      const pathname = urlParts[0]!.replace(/^\//, "").replace(/^api\//, "");

      if (pathname === "health") {
        let dbStatus = "uninitialized";
        let schemaVersion: number | null = null;
        try {
          const db = getDb();
          db.pragma("schema_version");
          dbStatus = "connected";
          schemaVersion = CURRENT_SCHEMA_VERSION;
        } catch {
          logger.warn("[API] Failed to check database connection in health endpoint");
          dbStatus = "error";
        }
        res.writeHead(200);
        res.end(
          JSON.stringify({
            status: "ok",
            uptime: Math.round((Date.now() - serverStartTime) / 1000),
            timestamp: new Date().toISOString(),
            database: { status: dbStatus, schemaVersion },
          }),
        );
        return;
      }

      if (!req.headers["x-electron-app"]) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing X-Electron-App header" }));
        return;
      }

      const clientIp = req.socket.remoteAddress || "127.0.0.1";

      if (!rateLimit.check(clientIp)) {
        res.writeHead(429);
        res.end(
          JSON.stringify({
            success: false,
            error: "Too many requests, please try again later",
          }),
        );
        return;
      }

      logger.info(`[API Server] ${req.method} ${req.url} from ${clientIp}`);

      try {
        const queryString = urlParts[1] || "";

        const queryParams: Record<string, string> = {};
        if (queryString) {
          queryString.split("&").forEach((param) => {
            const eqIndex = param.indexOf("=");
            if (eqIndex > 0) {
              const key = param.substring(0, eqIndex);
              const value = param.substring(eqIndex + 1);
              try {
                queryParams[key] = decodeURIComponent(value || "");
              } catch {
                logger.warn("[API] Failed to decode URI component in query params", { key });
                queryParams[key] = value || "";
              }
            }
          });
        }

        const route = routes[pathname];

        if (!route) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: `Not found: ${pathname}` }));
          return;
        }

        if (!route.methods.includes(req.method || "")) {
          res.writeHead(405);
          res.end(
            JSON.stringify({ error: `Method not allowed: ${req.method}` }),
          );
          return;
        }

        const chunks: Buffer[] = [];
        let bodyLength = 0;
        let bodyTooLarge = false;

        req.on("data", (chunk: Buffer) => {
          if (bodyTooLarge) return;
          bodyLength += chunk.length;
          if (bodyLength > MAX_REQUEST_BODY_SIZE) {
            bodyTooLarge = true;
            res.writeHead(413);
            res.end(
              JSON.stringify({
                success: false,
                error: "Request body too large",
              }),
            );
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });

        req.on("end", async () => {
          if (bodyTooLarge || res.writableEnded) return;
          try {
            const body = Buffer.concat(chunks).toString("utf-8");
            const parsedBody = body ? JSON.parse(body) : {};
            const fullBody = { ...queryParams, ...parsedBody };
            const result = await route.handler(req.method || "GET", fullBody, req);

            const resultObj = result as Record<string, unknown>;
            const httpStatus: number =
              resultObj && typeof resultObj === "object" && resultObj.httpStatus
                ? (resultObj.httpStatus as number)
                : 200;
            res.writeHead(httpStatus);
            res.end(JSON.stringify(result));
          } catch (error: unknown) {
            logger.error("[API] Handler error:", error instanceof Error ? error : undefined);
            res.writeHead(500);
            res.end(
              JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : "Internal server error",
              }),
            );
          }
        });
      } catch (error) {
        logger.error("[API] Server error:", error instanceof Error ? error : undefined);
        res.writeHead(500);
        res.end(
          JSON.stringify({
            success: false,
            error: "Internal server error",
          }),
        );
      }
    });

    apiServer.on("connection", (socket) => {
      apiConnections.add(socket);
      socket.on("close", () => {
        apiConnections.delete(socket);
      });
    });

    apiServer.listen(API_PORT, "127.0.0.1", () => {
      logger.info(`[API Server] Running on http://localhost:${API_PORT}`);
      resolve();
    });

    apiServer.on("error", reject);
  });
}

function stopApiServer(): void {
  if (apiServer) {
    logger.info("[API Server] Stopping...");
    const server = apiServer;
    apiServer = null;
    for (const conn of apiConnections) {
      try {
        conn.destroy();
      } catch (e) { logger.warn("API服务器关闭时清理连接失败", { error: e instanceof Error ? e.message : String(e) }); }
    }
    apiConnections.clear();
    server.close((err) => {
      if (err) {
        logger.error("[API Server] Error stopping:", err instanceof Error ? err : new Error(String(err)));
      } else {
        logger.info("[API Server] Stopped");
      }
    });
  }
}

export { startApiServer, stopApiServer, API_PORT, registerAllowedOrigin };
