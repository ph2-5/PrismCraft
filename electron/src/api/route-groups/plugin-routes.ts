import type { Route } from "../types";
import { defineRoute } from "../types";
import { pluginRegistry, saveUserPlugin, deleteUserPlugin, listUserPluginFiles, validatePluginConfig, getAllProcessMetrics } from "../../plugins";
import type { UserPluginConfig } from "../../plugins";
import { CODE_PLUGINS_DIR } from "../../plugins/code-plugin-loader";
import fs from "fs";
import path from "path";
import { getLogger } from "../../logging";
import {
  videoSelectStrategySchema,
  videoDetectFormatSchema,
  pluginAddSchema,
  pluginDeleteSchema,
  pluginValidateSchema,
} from "../schemas";

const logger = getLogger("api-routes");

let pluginCacheInvalidationToken = 0;

export function getPluginCacheInvalidationToken(): number {
  return pluginCacheInvalidationToken;
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

export const pluginRoutes: Record<string, Route> = {
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
  "plugins/list": defineRoute({
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
  }),
  "plugins/capabilities": defineRoute({
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
  }),
  "plugins/detection-rules": defineRoute({
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
  }),
  "plugins/add": defineRoute({
    schema: pluginAddSchema,
    handler: async (_m, b) => {
      // Schema uses z.record(z.string(), z.unknown()) for config because UserPluginConfig is a
      // complex nested interface (match/capabilities/apiKeyDetection). A full Zod schema would be
      // large and brittle. Validation is delegated to validatePluginConfig below.
      const config = b.config as unknown as UserPluginConfig;
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
  }),
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
  "plugins/reload": defineRoute({
    handler: async () => {
      const result = pluginRegistry.reloadUserPlugins();
      return { success: true, data: { loaded: result.loaded, errors: result.errors, cacheInvalidationToken: ++pluginCacheInvalidationToken } };
    },
    methods: ["POST"],
  }),
  "plugins/reload-code": defineRoute({
    handler: async () => {
      const result = await pluginRegistry.loadCodePlugins();
      return { success: true, data: { loaded: result.loaded, errors: result.errors, cacheInvalidationToken: ++pluginCacheInvalidationToken } };
    },
    methods: ["POST"],
  }),
  "plugins/process-metrics": defineRoute({
    handler: async () => {
      const metrics = getAllProcessMetrics();
      return { success: true, data: metrics };
    },
    methods: ["GET"],
  }),
  "plugins/validate": defineRoute({
    schema: pluginValidateSchema,
    handler: async (_m, b) => {
      // Schema uses z.record(z.string(), z.unknown()) for config; UserPluginConfig is a complex
      // nested interface. Validation is performed by validatePluginConfig which checks the shape.
      const config = b.config as unknown as UserPluginConfig;
      if (!config) {
        return { success: false, error: "缺少插件配置" };
      }
      const validation = validatePluginConfig(config);
      return { success: true, data: { valid: validation.valid, errors: validation.errors } };
    },
    methods: ["POST"],
  }),
  "plugins/schema": defineRoute({
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
  }),
  "plugins/specification": defineRoute({
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
  }),
  "plugins/templates": defineRoute({
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
  }),
  "plugins/code-plugins-dir": defineRoute({
    handler: async () => {
      return { success: true, data: { dir: CODE_PLUGINS_DIR } };
    },
    methods: ["GET"],
  }),
};
