import type { Route } from "./types";
import { defineRoute } from "./types";
import { handleConfig, handleSecureConfig } from "../handlers/config";
import { handleTestConnection } from "../handlers/test-connection";
import { handleSyncConfig, handleSyncTest, handleSyncProxy } from "../handlers/sync";
import * as apiGateway from "../api-gateway";
import * as storyService from "../services/story/story-service";
import * as videoTaskService from "../services/video/video-task-service";
import * as promptService from "../services/prompt/prompt-service";
import { pluginRegistry, saveUserPlugin, deleteUserPlugin, listUserPluginFiles, validatePluginConfig, getAllProcessMetrics } from "../plugins";
import type { UserPluginConfig } from "../plugins";
import * as referenceEngine from "../services/shot/reference-engine";
import * as consistencyCheck from "../services/shot/consistency-check";
import * as referenceCheck from "../services/shot/reference-check";
import * as visualConsistencyCheck from "../services/shot/visual-consistency-check";
import * as storyboardGeneration from "../services/story/storyboard-generation";
import * as videoTracker from "../services/video/video-tracker";
import * as videoRecovery from "../services/video/video-recovery";
import { getDb } from "../database";
import fs from "fs";
import path from "path";
import { getLogger } from "../logging";
import {
  analyzeImageSchema,
  generateImageSchema,
  generateKeyframeSchema,
  generateFramePairSchema,
  generateVideoSchema,
  videoStatusSchema,
  generateTextSchema,
  testConnectionSchema,
  exportSchema,
  storyPlanSchema,
  storyGenerateVideoSchema,
  storyGenerateKeyframeSchema,
  storyGenerateFramePairSchema,
  quickGenerateVideoSchema,
  characterGenerateImageSchema,
  sceneGenerateImageSchema,
  characterAnalyzeImageSchema,
  sceneAnalyzeImageSchema,
  videoSelectStrategySchema,
  videoDetectFormatSchema,
  pluginAddSchema,
  pluginDeleteSchema,
  pluginValidateSchema,
  videoTrackingInfoSchema,
  videoProviderInfoSchema,
  shotValidateReferenceSchema,
  shotGetReferenceVideoUrlSchema,
  shotBuildReferenceDescriptionSchema,
  validateConsistencySchema,
  validateFeatureAnchoringSchema,
  validateNoFrameBindingSchema,
  referenceCheckCharacterSchema,
  referenceCheckSceneSchema,
  visualConsistencyCheckSchema,
  visualConsistencyCheckBeatSchema,
  storyboardGenerateKeyframeSchema,
  storyboardGenerateFramePairSchema,
  storyboardGenerateVideoSchema,
  storyboardGenerateFullWorkflowSchema,
  storyboardGenerateKeyframeChainSchema,
  videoRecoverSchema,
  videoTasksBulkSaveSchema,
} from "./schemas";

const logger = getLogger("api-routes");

let pluginCacheInvalidationToken = 0;

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

export const routes: Record<string, Route> = {
  config: { handler: handleConfig, methods: ["GET", "POST", "HEAD"] },
  "secure-config": { handler: handleSecureConfig, methods: ["POST"] },
  upload: {
    handler: (_m, b) => apiGateway.handleUpload(b),
    methods: ["POST"],
  },
  "analyze-image": {
    schema: analyzeImageSchema,
    handler: (_m, b) => apiGateway.analyzeImage(b),
    methods: ["POST"],
  },
  "generate-image": {
    schema: generateImageSchema,
    handler: (_m, b) => apiGateway.generateImage(b),
    methods: ["POST"],
  },
  "generate-keyframe": {
    schema: generateKeyframeSchema,
    handler: (_m, b) => apiGateway.generateKeyframe(b),
    methods: ["POST"],
  },
  "generate-frame-pair": {
    schema: generateFramePairSchema,
    handler: (_m, b) => apiGateway.generateFramePair(b),
    methods: ["POST"],
  },
  "generate-video": {
    schema: generateVideoSchema,
    handler: (_m, b) => apiGateway.generateVideo(b),
    methods: ["POST"],
  },
  "video-status": {
    schema: videoStatusSchema,
    handler: (_m, b) => apiGateway.videoStatus(b),
    methods: ["GET", "POST"],
  },
  "generate-text": {
    schema: generateTextSchema,
    handler: (_m, b) => apiGateway.generateText(b),
    methods: ["POST"],
  },
  "test-connection": {
    schema: testConnectionSchema,
    handler: handleTestConnection,
    methods: ["POST"],
  },
  "sync/config": { handler: handleSyncConfig, methods: ["GET", "POST"] },
  "sync/test": { handler: handleSyncTest, methods: ["POST"] },
  "sync/proxy": { handler: handleSyncProxy, methods: ["POST"] },
  export: {
    schema: exportSchema,
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
  "story/plan": defineRoute({
    schema: storyPlanSchema,
    handler: async (_m, b) => {
      const result = await storyService.generateStoryPlanWithValidation(
        b.story || {},
        b.characters || [],
        b.scenes || [],
        { ...b.options, planPrompt: b.planPrompt },
        (prompt: string, opts: Record<string, unknown>) => apiGateway.generateText({ prompt, ...opts }),
      );
      return { success: true, data: result };
    },
    methods: ["POST"],
  }),
  "story/generate-video": {
    schema: storyGenerateVideoSchema,
    handler: async (_m, b) => {
      const params = videoTaskService.buildVideoGenerationParams(b);
      return apiGateway.generateVideo(params as unknown as Record<string, unknown>);
    },
    methods: ["POST"],
  },
  "story/generate-keyframe": {
    schema: storyGenerateKeyframeSchema,
    handler: async (_m, b) => {
      const params = videoTaskService.buildKeyframeGenerationParams(b as unknown as Parameters<typeof videoTaskService.buildKeyframeGenerationParams>[0]);
      return apiGateway.generateKeyframe(params);
    },
    methods: ["POST"],
  },
  "story/generate-frame-pair": {
    schema: storyGenerateFramePairSchema,
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
    schema: quickGenerateVideoSchema,
    handler: async (_m, b) => {
      const params = videoTaskService.buildQuickVideoParams(b);
      return apiGateway.generateVideo(params);
    },
    methods: ["POST"],
  },
  "character/generate-image": defineRoute({
    schema: characterGenerateImageSchema,
    handler: async (_m, b) => {
      const character = b.character;
      const useDetailedPrompt = b.useDetailedPrompt;
      const imageSize = b.imageSize;
      const providerId = b.providerId;
      const modelId = b.modelId;
      const imagePrompt = b.imagePrompt;
      const detailedPromptInstruction = b.detailedPromptInstruction;
      let finalPrompt: string =
        imagePrompt || promptService.generateCharacterImagePrompt(character as import("../services/prompt/prompt-service").CharacterInput);
      if (useDetailedPrompt && !imagePrompt) {
        const instruction: string =
          detailedPromptInstruction ||
          promptService.generateCharacterDetailedPromptInstruction(character as import("../services/prompt/prompt-service").CharacterInput);
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
  }),
  "scene/generate-image": defineRoute({
    schema: sceneGenerateImageSchema,
    handler: async (_m, b) => {
      const scene = b.scene;
      const useDetailedPrompt = b.useDetailedPrompt;
      const imageSize = b.imageSize;
      const providerId = b.providerId;
      const modelId = b.modelId;
      const imagePrompt = b.imagePrompt;
      const detailedPromptInstruction = b.detailedPromptInstruction;
      let finalPrompt: string =
        imagePrompt ||
        (scene.imageGenerationPrompt as string | undefined) ||
        promptService.generateSceneImagePrompt(scene as import("../services/prompt/prompt-service").SceneInput);
      if (useDetailedPrompt && !imagePrompt) {
        const instruction: string =
          detailedPromptInstruction ||
          promptService.generateScenePromptOptimization(
            (scene.description as string | undefined) || finalPrompt,
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
  }),
  "character/analyze-image": defineRoute({
    schema: characterAnalyzeImageSchema,
    handler: async (_m, b) => {
      const analysisPrompt: string =
        b.analysisPrompt || promptService.generateCharacterAnalysisPrompt();
      return apiGateway.analyzeImage({ ...b, prompt: analysisPrompt });
    },
    methods: ["POST"],
  }),
  "scene/analyze-image": defineRoute({
    schema: sceneAnalyzeImageSchema,
    handler: async (_m, b) => {
      const analysisPrompt: string =
        b.analysisPrompt || promptService.generateSceneAnalysisPrompt();
      return apiGateway.analyzeImage({ ...b, prompt: analysisPrompt });
    },
    methods: ["POST"],
  }),
  "video/select-strategy": defineRoute({
    schema: videoSelectStrategySchema,
    handler: async (_m, b) => {
      const plugin = pluginRegistry.select(b.apiUrl, b.model);
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
  }),
  "video/detect-format": defineRoute({
    schema: videoDetectFormatSchema,
    handler: async (_m, b) => {
      const plugin = pluginRegistry.select(b.apiUrl, b.modelId);
      const format = plugin?.id || "openai-compatible";
      return { success: true, data: { format } };
    },
    methods: ["POST"],
  }),
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
    schema: pluginAddSchema,
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
      return {
        success: true,
        data: {
          filePath: result.filePath,
          loadedCount: reloadResult.loaded,
          reloadErrors: reloadResult.errors,
          cacheInvalidationToken: ++pluginCacheInvalidationToken,
        },
      };
    },
    methods: ["POST"],
  },
  "plugins/delete": defineRoute({
    schema: pluginDeleteSchema,
    handler: async (_m, b) => {
      if (!b.pluginId) {
        return { success: false, error: "缺少 pluginId" };
      }
      if (!pluginRegistry.isUserPlugin(b.pluginId)) {
        return { success: false, error: "不能删除内置插件" };
      }
      const result = deleteUserPlugin(b.pluginId);
      if (!result.success) {
        return { success: false, error: result.error };
      }
      pluginRegistry.unregister(b.pluginId);
      return { success: true, data: { cacheInvalidationToken: ++pluginCacheInvalidationToken } };
    },
    methods: ["POST"],
  }),
  "plugins/reload": {
    handler: async () => {
      const result = pluginRegistry.reloadUserPlugins();
      return { success: true, data: { loaded: result.loaded, errors: result.errors, cacheInvalidationToken: ++pluginCacheInvalidationToken } };
    },
    methods: ["POST"],
  },
  "plugins/reload-code": {
    handler: async () => {
      const result = await pluginRegistry.loadCodePlugins();
      return { success: true, data: { loaded: result.loaded, errors: result.errors, cacheInvalidationToken: ++pluginCacheInvalidationToken } };
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
    schema: pluginValidateSchema,
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
  "video/tracking-info": defineRoute({
    schema: videoTrackingInfoSchema,
    handler: async (_m, b) => {
      const info = videoTracker.buildTrackingInfo(
        b.taskId,
        b.apiUrl,
        b.apiKeyPreview,
        b.model,
      );
      return { success: true, data: info };
    },
    methods: ["POST"],
  }),
  "video/provider-info": defineRoute({
    schema: videoProviderInfoSchema,
    handler: async (_m, b) => {
      const info = videoTracker.getProviderInfo(b.apiUrl);
      return { success: true, data: info };
    },
    methods: ["POST"],
  }),
  "shot/validate-reference": {
    schema: shotValidateReferenceSchema,
    handler: async (_m, b) => {
      const result = referenceEngine.validateReference(
        b.shot as import("../services/shot/reference-engine").Shot,
        b.allShots as import("../services/shot/reference-engine").Shot[],
        b.reference as import("../services/shot/reference-engine").Reference,
      );
      return { success: true, data: result };
    },
    methods: ["POST"],
  },
  "shot/get-reference-video-url": {
    schema: shotGetReferenceVideoUrlSchema,
    handler: async (_m, b) => {
      const url = referenceEngine.getReferenceVideoUrl(
        b.shot as import("../services/shot/reference-engine").Shot,
        b.allShots as import("../services/shot/reference-engine").Shot[],
        b.reference as import("../services/shot/reference-engine").Reference,
      );
      return { success: true, data: { videoUrl: url } };
    },
    methods: ["POST"],
  },
  "shot/build-reference-description": {
    schema: shotBuildReferenceDescriptionSchema,
    handler: async (_m, b) => {
      const desc = referenceEngine.buildReferenceDescription(
        b.shot as import("../services/shot/reference-engine").Shot,
        b.allShots as import("../services/shot/reference-engine").Shot[],
        b.reference as import("../services/shot/reference-engine").Reference,
      );
      return { success: true, data: { description: desc } };
    },
    methods: ["POST"],
  },
  "validate/consistency": {
    schema: validateConsistencySchema,
    handler: async (_m, b) => {
      const result = consistencyCheck.performConfigCheck(b as unknown as Parameters<typeof consistencyCheck.performConfigCheck>[0]);
      return { success: true, data: result };
    },
    methods: ["POST"],
  },
  "validate/feature-anchoring": {
    schema: validateFeatureAnchoringSchema,
    handler: async (_m, b) => {
      const config = b.config as import("../services/shot/consistency-check").FeatureAnchoringConfig;
      const result = consistencyCheck.validateFeatureAnchoringConfig(config);
      return { success: true, data: result };
    },
    methods: ["POST"],
  },
  "validate/no-frame-binding": {
    schema: validateNoFrameBindingSchema,
    handler: async (_m, b) => {
      const result = consistencyCheck.validateNoFrameBinding(b);
      return { success: true, data: result };
    },
    methods: ["POST"],
  },
  "reference/check-character": defineRoute({
    schema: referenceCheckCharacterSchema,
    handler: async (_m, b) => {
      const result = referenceCheck.checkCharacterReferences(
        b.characterId,
        b.stories as import("../services/shot/reference-check").Story[],
      );
      return { success: true, data: result };
    },
    methods: ["POST"],
  }),
  "reference/check-scene": defineRoute({
    schema: referenceCheckSceneSchema,
    handler: async (_m, b) => {
      const result = referenceCheck.checkSceneReferences(b.sceneId, b.stories as import("../services/shot/reference-check").Story[]);
      return { success: true, data: result };
    },
    methods: ["POST"],
  }),
  "visual-consistency/check": defineRoute({
    schema: visualConsistencyCheckSchema,
    handler: async (_m, b) => {
      const result = await visualConsistencyCheck.checkVisualConsistency(
        apiGateway as unknown as import("../services/story/storyboard-generation").ApiGateway,
        {
          generatedImageUrl: b.generatedImageUrl,
          referenceImageUrl: b.referenceImageUrl,
          element: b.element as unknown as import("../services/shot/visual-consistency-check").Element,
        },
      );
      return { success: true, data: result };
    },
    methods: ["POST"],
  }),
  "visual-consistency/check-beat": defineRoute({
    schema: visualConsistencyCheckBeatSchema,
    handler: async (_m, b) => {
      const result = await visualConsistencyCheck.checkBeatElementConsistency(
        apiGateway as unknown as import("../services/story/storyboard-generation").ApiGateway,
        {
          beat: b.beat as import("../services/shot/visual-consistency-check").Beat,
          elements: b.elements as import("../services/shot/visual-consistency-check").Element[],
          getGeneratedImageUrl: (elementId: string) =>
            (b.generatedImageMap || {})[elementId],
        },
      );
      return { success: true, data: result };
    },
    methods: ["POST"],
  }),
  "storyboard/generate-keyframe": defineRoute({
    schema: storyboardGenerateKeyframeSchema,
    handler: async (_m, b) => {
      const result = await storyboardGeneration.generateBeatKeyframe(
        apiGateway as unknown as import("../services/story/storyboard-generation").ApiGateway,
        promptService,
        b.beat as import("../services/story/storyboard-generation").Beat,
        b.prevBeat as import("../services/story/storyboard-generation").Beat | undefined,
        b.options,
      );
      return { success: true, data: result };
    },
    methods: ["POST"],
  }),
  "storyboard/generate-frame-pair": defineRoute({
    schema: storyboardGenerateFramePairSchema,
    handler: async (_m, b) => {
      const result = await storyboardGeneration.generateBeatFramePair(
        apiGateway as unknown as import("../services/story/storyboard-generation").ApiGateway,
        promptService,
        b.beat as import("../services/story/storyboard-generation").Beat,
        b.options,
      );
      return { success: true, data: result };
    },
    methods: ["POST"],
  }),
  "storyboard/generate-video": defineRoute({
    schema: storyboardGenerateVideoSchema,
    handler: async (_m, b) => {
      const result = await storyboardGeneration.generateBeatVideo(
        apiGateway as unknown as import("../services/story/storyboard-generation").ApiGateway,
        b.beat as import("../services/story/storyboard-generation").Beat,
        b.options,
      );
      return { success: true, data: result };
    },
    methods: ["POST"],
  }),
  "storyboard/generate-full-workflow": defineRoute({
    schema: storyboardGenerateFullWorkflowSchema,
    handler: async (_m, b) => {
      const result = await storyboardGeneration.generateBeatFullWorkflow(
        apiGateway as unknown as import("../services/story/storyboard-generation").ApiGateway,
        promptService,
        b.beat as import("../services/story/storyboard-generation").Beat,
        b.prevBeat as import("../services/story/storyboard-generation").Beat | undefined,
        b.options,
      );
      return { success: true, data: result };
    },
    methods: ["POST"],
  }),
  "storyboard/generate-keyframe-chain": defineRoute({
    schema: storyboardGenerateKeyframeChainSchema,
    handler: async (_m, b) => {
      const result = await storyboardGeneration.generateKeyframeChain(
        apiGateway as unknown as import("../services/story/storyboard-generation").ApiGateway,
        promptService,
        b.beats as import("../services/story/storyboard-generation").Beat[],
        b.options as Parameters<typeof storyboardGeneration.generateKeyframeChain>[3],
      );
      return { success: true, data: result };
    },
    methods: ["POST"],
  }),
  "video/recover": defineRoute({
    schema: videoRecoverSchema,
    handler: async (_m, b) => {
      const result = await videoRecovery.recoverVideoByTaskId(
        apiGateway as unknown as import("../services/story/storyboard-generation").ApiGateway,
        b.taskId,
        b.taskRecord,
      );
      return { success: true, data: result };
    },
    methods: ["POST"],
  }),
  "video-tasks/bulk-save": {
    schema: videoTasksBulkSaveSchema,
    handler: async (_m, b) => {
      const tasks = b.tasks;
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
