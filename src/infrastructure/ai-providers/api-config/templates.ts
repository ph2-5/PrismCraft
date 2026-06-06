/**
 * 预定义提供商模板
 * 包含所有支持的 AI 服务提供商配置
 * 支持插件驱动的 Provider Template（P7）
 */

import { ProviderConfig, ApiFormat, ModelConfig } from "./types";
import { isElectron } from "@/shared/utils/platform";
import { API_SERVER_PORT, ELECTRON_APP_HEADERS } from "@/config/constants";
import { errorLogger } from "@/shared/error-logger";

export type ProviderTemplate = Omit<ProviderConfig, "id" | "apiKey">;

export interface PluginProviderTemplate extends ProviderTemplate {
  pluginId: string;
  isUserPlugin: boolean;
  isCodePlugin: boolean;
}

const FORMAT_MAP: Record<string, ApiFormat> = {
  volcengine: "openai",
  zhipu: "zhipu",
  seedance: "seedance",
  kuaishou: "kuaishou",
  pixverse: "pixverse",
  anthropic: "anthropic",
  google: "google",
};

function resolveFormat(pluginId: string): ApiFormat {
  return FORMAT_MAP[pluginId] ?? "openai";
}

interface PluginListItem {
  id: string;
  displayName: string;
  isUserPlugin: boolean;
  videoCapabilities?: { defaultModel?: string; maxDuration?: number; supportsLastFrame?: boolean };
  imageCapabilities?: { defaultModel?: string };
  modelProfiles?: Array<{
    modelId: string;
    displayName?: string;
    capabilities?: Record<string, unknown>;
    parameters?: Record<string, unknown>;
  }>;
  apiKeyDetection?: { baseUrl?: string };
}

interface PluginsListResponse {
  success: boolean;
  data?: {
    plugins: PluginListItem[];
    modelProfiles?: Record<string, { modelId: string; displayName?: string; capabilities?: Record<string, unknown>; parameters?: Record<string, unknown>; providerId?: string }>;
  };
}

let pluginTemplates: Record<string, PluginProviderTemplate> = {};

export function getPluginTemplates(): Record<string, PluginProviderTemplate> {
  return pluginTemplates;
}

export async function loadPluginTemplates(): Promise<void> {
  if (!isElectron()) return;

  try {
    const baseUrl = `http://localhost:${API_SERVER_PORT}`;
    const response = await fetch(`${baseUrl}/api/plugins/list`, {
      headers: { ...ELECTRON_APP_HEADERS, "Content-Type": "application/json" },
    });

    if (!response.ok) return;

    const result: PluginsListResponse = await response.json();
    if (!result.success || !result.data?.plugins) return;

    const newTemplates: Record<string, PluginProviderTemplate> = {};

    for (const plugin of result.data.plugins) {
      const templateId = plugin.id;
      const baseUrlFromDetection = plugin.apiKeyDetection?.baseUrl ?? "";
      const format = resolveFormat(plugin.id);

      const models: ModelConfig[] = [];

      if (plugin.videoCapabilities?.defaultModel) {
        models.push({
          id: plugin.videoCapabilities.defaultModel,
          name: plugin.videoCapabilities.defaultModel,
          capabilities: ["video"],
          defaultParams: { duration: plugin.videoCapabilities.maxDuration ?? 5 },
        });
      }

      if (plugin.imageCapabilities?.defaultModel) {
        models.push({
          id: plugin.imageCapabilities.defaultModel,
          name: plugin.imageCapabilities.defaultModel,
          capabilities: ["image"],
          defaultParams: {},
        });
      }

      if (result.data.modelProfiles) {
        const pluginProfiles = Object.values(result.data.modelProfiles).filter(
          (p) => p.providerId === plugin.id,
        );
        for (const profile of pluginProfiles) {
          if (models.some((m) => m.id === profile.modelId)) continue;
          const caps: string[] = [];
          if (profile.parameters) {
            if ("durations" in profile.parameters) caps.push("video");
            if ("resolutions" in profile.parameters && !caps.includes("video")) caps.push("image");
          }
          if (caps.length === 0) caps.push("video");
          models.push({
            id: profile.modelId,
            name: profile.displayName ?? profile.modelId,
            capabilities: caps as ModelConfig["capabilities"],
            defaultParams: {},
          });
        }
      }

      newTemplates[templateId] = {
        name: plugin.displayName,
        format,
        baseUrl: baseUrlFromDetection,
        models,
        pluginId: plugin.id,
        isUserPlugin: plugin.isUserPlugin,
        isCodePlugin: false,
      };
    }

    pluginTemplates = newTemplates;
  } catch (e) {
    errorLogger.warn("[Templates] 加载插件模板失败", e);
  }
}

export function getAllTemplates(): Record<string, ProviderTemplate> {
  return { ...PROVIDER_TEMPLATES, ...pluginTemplates };
}

export function getTemplateWithPlugins(id: string): ProviderTemplate | PluginProviderTemplate | undefined {
  if (pluginTemplates[id]) return pluginTemplates[id];
  return PROVIDER_TEMPLATES[id];
}

export const PROVIDER_TEMPLATES: Record<string, ProviderTemplate> = {
  // OpenAI 官方
  openai: {
    name: "OpenAI",
    format: "openai" as ApiFormat,
    baseUrl: "https://api.openai.com/v1",
    models: [
      {
        id: "gpt-4o",
        name: "GPT-4o",
        capabilities: ["text", "vision"],
        defaultParams: { maxTokens: 4096, temperature: 0.7 },
      },
      {
        id: "gpt-4o-mini",
        name: "GPT-4o Mini",
        capabilities: ["text", "vision"],
        defaultParams: { maxTokens: 4096, temperature: 0.7 },
      },
      {
        id: "gpt-4-turbo",
        name: "GPT-4 Turbo",
        capabilities: ["text", "vision"],
        defaultParams: { maxTokens: 4096, temperature: 0.7 },
      },
      {
        id: "gpt-3.5-turbo",
        name: "GPT-3.5 Turbo",
        capabilities: ["text"],
        defaultParams: { maxTokens: 4096, temperature: 0.7 },
      },
      {
        id: "dall-e-3",
        name: "DALL-E 3",
        capabilities: ["image"],
        defaultParams: { size: "1024x1024", quality: "standard" },
      },
      {
        id: "dall-e-2",
        name: "DALL-E 2",
        capabilities: ["image"],
        defaultParams: { size: "1024x1024" },
      },
    ],
  },

  // Moonshot/Kimi
  moonshot: {
    name: "Moonshot (Kimi)",
    format: "openai" as ApiFormat,
    baseUrl: "https://api.moonshot.cn/v1",
    models: [
      {
        id: "moonshot-v1-8k",
        name: "Kimi K2.5 (8K)",
        capabilities: ["text", "vision"],
        defaultParams: { maxTokens: 8192, temperature: 0.7 },
      },
      {
        id: "moonshot-v1-32k",
        name: "Kimi K2.5 (32K)",
        capabilities: ["text", "vision"],
        defaultParams: { maxTokens: 32768, temperature: 0.7 },
      },
      {
        id: "moonshot-v1-128k",
        name: "Kimi K2.5 (128K)",
        capabilities: ["text", "vision"],
        defaultParams: { maxTokens: 128000, temperature: 0.7 },
      },
      {
        id: "moonshot-v1-256k",
        name: "Kimi K2.5 (256K)",
        capabilities: ["text", "vision"],
        defaultParams: { maxTokens: 262144, temperature: 0.7 },
      },
      {
        id: "moonshot-v1-8k-vision-preview",
        name: "Kimi Vision (8K)",
        capabilities: ["text", "vision"],
        defaultParams: { maxTokens: 8192, temperature: 0.7 },
      },
      {
        id: "moonshot-v1-32k-vision-preview",
        name: "Kimi Vision (32K)",
        capabilities: ["text", "vision"],
        defaultParams: { maxTokens: 32768, temperature: 0.7 },
      },
    ],
  },

  // 火山引擎 (使用 OpenAI 兼容格式)
  volcengine: {
    name: "火山引擎",
    format: "openai" as ApiFormat,
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    models: [
      // 豆包系列模型
      {
        id: "doubao-seed-1-8-251228",
        name: "Doubao Seed 1.8",
        capabilities: ["text", "vision"],
        defaultParams: { maxTokens: 256000, temperature: 0.7 },
      },
      {
        id: "doubao-seed-1-6-251015",
        name: "Doubao Seed 1.6",
        capabilities: ["text", "vision"],
        defaultParams: { maxTokens: 256000, temperature: 0.7 },
      },
      {
        id: "doubao-seed-1-6-vision-251015",
        name: "Doubao Seed 1.6 Vision",
        capabilities: ["text", "vision"],
        defaultParams: { maxTokens: 256000, temperature: 0.7 },
      },
      {
        id: "doubao-seed-1-5-250828",
        name: "Doubao Seed 1.5",
        capabilities: ["text"],
        defaultParams: { maxTokens: 128000, temperature: 0.7 },
      },
      // 代码模型
      {
        id: "ark-code-latest",
        name: "Ark Code Latest",
        capabilities: ["text"],
        defaultParams: { maxTokens: 4096, temperature: 0.7 },
      },
      {
        id: "doubao-seed-2-0-code-260128",
        name: "Doubao Seed 2.0 Code",
        capabilities: ["text"],
        defaultParams: { maxTokens: 128000, temperature: 0.7 },
      },
      {
        id: "doubao-seed-code-250828",
        name: "Doubao Seed Code",
        capabilities: ["text"],
        defaultParams: { maxTokens: 128000, temperature: 0.7 },
      },
      // 第三方模型
      {
        id: "kimi-k2-5",
        name: "Kimi K2.5",
        capabilities: ["text", "vision"],
        defaultParams: { maxTokens: 8192, temperature: 0.7 },
      },
      {
        id: "glm-4-7",
        name: "GLM-4.7",
        capabilities: ["text", "vision"],
        defaultParams: { maxTokens: 8192, temperature: 0.7 },
      },
      {
        id: "deepseek-v3-2-251201",
        name: "DeepSeek V3.2",
        capabilities: ["text", "vision"],
        defaultParams: { maxTokens: 4096, temperature: 0.7 },
      },
      // 图片生成模型
      {
        id: "ecom-imagegen",
        name: "电商图片生成",
        capabilities: ["image"],
        defaultParams: { size: "1920x1920" },
      },
      // Seedream 系列
      {
        id: "doubao-seedream-4-0-250828",
        name: "Seedream 4.0",
        capabilities: ["image"],
        defaultParams: { size: "1920x1920" },
      },
      {
        id: "doubao-seedream-4-5-251128",
        name: "Seedream 4.5",
        capabilities: ["image"],
        defaultParams: { size: "1920x1920" },
      },
      {
        id: "doubao-seedream-5-0-260128",
        name: "Seedream 5.0 Lite",
        capabilities: ["image"],
        defaultParams: { size: "1920x1920" },
      },
      // 视频生成模型
      {
        id: "ep-20240414153753-vs22r",
        name: "视频生成",
        capabilities: ["video"],
        defaultParams: { duration: 5 },
      },
      // Seedance 视频生成模型
      {
        id: "doubao-seedance-1-0-lite-t2v-250428",
        name: "Seedance 1.0 Lite (文本到视频)",
        capabilities: ["video"],
        defaultParams: { duration: 5 },
      },
      {
        id: "doubao-seedance-1-0-lite-i2v-250428",
        name: "Seedance 1.0 Lite (图片到视频)",
        capabilities: ["video"],
        defaultParams: { duration: 5 },
      },
      {
        id: "doubao-seedance-1-0-pro-250528",
        name: "Seedance 1.0 Pro",
        capabilities: ["video"],
        defaultParams: { duration: 8 },
      },
      {
        id: "doubao-seedance-1-5-pro-251215",
        name: "Seedance 1.5 Pro",
        capabilities: ["video"],
        defaultParams: { duration: 10 },
      },
      {
        id: "doubao-seedance-2-0-260315",
        name: "Seedance 2.0",
        capabilities: ["video"],
        defaultParams: { duration: 15, maxKeyframes: 9 },
      },
    ],
  },

  // BytePlus (字节跳动云服务，包含 Seedance 系列)
  byteplus: {
    name: "BytePlus",
    format: "openai" as ApiFormat,
    baseUrl: "https://ark.ap-southeast.bytepluses.com/api/v3",
    models: [
      // 文本模型
      {
        id: "seed-1-8-251228",
        name: "Seed 1.8",
        capabilities: ["text", "vision"],
        defaultParams: { maxTokens: 4096, temperature: 0.7 },
      },
      // 第三方模型
      {
        id: "kimi-k2-5",
        name: "Kimi K2.5",
        capabilities: ["text", "vision"],
        defaultParams: { maxTokens: 8192, temperature: 0.7 },
      },
      {
        id: "glm-4-7",
        name: "GLM-4.7",
        capabilities: ["text", "vision"],
        defaultParams: { maxTokens: 8192, temperature: 0.7 },
      },
      // Seedance 视频生成模型
      {
        id: "seedance-1-0-lite-t2v-250428",
        name: "Seedance 1.0 Lite (文本到视频)",
        capabilities: ["video"],
        defaultParams: { duration: 5 },
      },
      {
        id: "seedance-1-0-lite-i2v-250428",
        name: "Seedance 1.0 Lite (图片到视频)",
        capabilities: ["video"],
        defaultParams: { duration: 5 },
      },
      {
        id: "seedance-1-0-pro-250528",
        name: "Seedance 1.0 Pro",
        capabilities: ["video"],
        defaultParams: { duration: 8 },
      },
      {
        id: "seedance-1-5-pro-251215",
        name: "Seedance 1.5 Pro",
        capabilities: ["video"],
        defaultParams: { duration: 12 },
      },
      {
        id: "seedance-2-0-260315",
        name: "Seedance 2.0",
        capabilities: ["video"],
        defaultParams: { duration: 15, maxKeyframes: 9 },
      },
    ],
  },

  // 智谱
  zhipu: {
    name: "智谱 AI",
    format: "zhipu" as ApiFormat,
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    models: [
      {
        id: "glm-4.7",
        name: "GLM-4.7",
        capabilities: ["text", "vision"],
        defaultParams: { maxTokens: 8192, temperature: 0.7 },
      },
      {
        id: "glm-4.6",
        name: "GLM-4.6",
        capabilities: ["text", "vision"],
        defaultParams: { maxTokens: 8192, temperature: 0.7 },
      },
      {
        id: "glm-4.5",
        name: "GLM-4.5",
        capabilities: ["text", "vision"],
        defaultParams: { maxTokens: 8192, temperature: 0.7 },
      },
      {
        id: "glm-4",
        name: "GLM-4",
        capabilities: ["text"],
        defaultParams: { maxTokens: 4096, temperature: 0.7 },
      },
      {
        id: "glm-4v",
        name: "GLM-4V",
        capabilities: ["text", "vision"],
        defaultParams: { maxTokens: 4096, temperature: 0.7 },
      },
      {
        id: "glm-3-turbo",
        name: "GLM-3 Turbo",
        capabilities: ["text"],
        defaultParams: { maxTokens: 4096, temperature: 0.7 },
      },
      {
        id: "cogview-3",
        name: "CogView-3",
        capabilities: ["image"],
        defaultParams: { size: "1024x1024" },
      },
      {
        id: "cogvideox-3",
        name: "CogVideoX-3",
        capabilities: ["video"],
        defaultParams: { duration: 10, maxKeyframes: 3 },
      },
      {
        id: "cogvideox-2",
        name: "CogVideoX-2",
        capabilities: ["video"],
        defaultParams: { duration: 8, maxKeyframes: 2 },
      },
    ],
  },

  // OpenRouter
  openrouter: {
    name: "OpenRouter",
    format: "openai" as ApiFormat,
    baseUrl: "https://openrouter.ai/api/v1",
    models: [
      {
        id: "openai/gpt-4o",
        name: "GPT-4o (OR)",
        capabilities: ["text", "vision"],
        defaultParams: { maxTokens: 4096, temperature: 0.7 },
      },
      {
        id: "anthropic/claude-3.5-sonnet",
        name: "Claude 3.5 Sonnet",
        capabilities: ["text", "vision"],
        defaultParams: { maxTokens: 4096, temperature: 0.7 },
      },
      {
        id: "google/gemini-pro",
        name: "Gemini Pro",
        capabilities: ["text", "vision"],
        defaultParams: { maxTokens: 4096, temperature: 0.7 },
      },
    ],
  },

  // Seedance 视频
  seedance: {
    name: "Seedance (Atlas)",
    format: "seedance" as ApiFormat,
    baseUrl: "https://api.atlascloud.ai/v1",
    models: [
      {
        id: "seedance-1.5-pro",
        name: "Seedance 1.5 Pro",
        capabilities: ["video"],
        defaultParams: { duration: 5 },
      },
      {
        id: "seedance-1.5-lite",
        name: "Seedance 1.5 Lite",
        capabilities: ["video"],
        defaultParams: { duration: 5 },
      },
    ],
  },

  // Pollinations（免费备用）
  pollinations: {
    name: "Pollinations (免费)",
    format: "openai" as ApiFormat,
    baseUrl: "https://image.pollinations.ai",
    models: [
      {
        id: "flux",
        name: "Flux",
        capabilities: ["image"],
        defaultParams: { size: "1024x1024" },
      },
    ],
  },

  // Ollama 本地
  ollama: {
    name: "Ollama (本地)",
    format: "openai" as ApiFormat,
    baseUrl: "http://localhost:11434/v1",
    models: [
      {
        id: "qwen2.5:7b",
        name: "Qwen 2.5 7B",
        capabilities: ["text"],
        defaultParams: { maxTokens: 4096, temperature: 0.7 },
      },
      {
        id: "llava:7b",
        name: "LLaVA 7B",
        capabilities: ["text", "vision"],
        defaultParams: { maxTokens: 4096, temperature: 0.7 },
      },
    ],
  },

  // 通义千问
  qwen: {
    name: "通义千问",
    format: "openai" as ApiFormat,
    baseUrl: "https://dashscope.aliyuncs.com/api/v1",
    models: [
      {
        id: "qwen-max",
        name: "通义千问 Max",
        capabilities: ["text"],
        defaultParams: { maxTokens: 4096, temperature: 0.7 },
      },
      {
        id: "qwen-plus",
        name: "通义千问 Plus",
        capabilities: ["text"],
        defaultParams: { maxTokens: 4096, temperature: 0.7 },
      },
      {
        id: "qwen-turbo",
        name: "通义千问 Turbo",
        capabilities: ["text"],
        defaultParams: { maxTokens: 4096, temperature: 0.7 },
      },
      {
        id: "qwen-vl-max",
        name: "通义千问 VL Max",
        capabilities: ["vision"],
        defaultParams: { maxTokens: 4096, temperature: 0.7 },
      },
    ],
  },

  // 自定义 API
  custom: {
    name: "自定义 API",
    format: "openai" as ApiFormat,
    baseUrl: "http://localhost:8000/v1", // 默认本地部署地址
    models: [
      {
        id: "custom-model",
        name: "自定义模型",
        capabilities: ["text"],
        defaultParams: { maxTokens: 4096, temperature: 0.7 },
      },
    ],
  },

  // 快手可灵 Kling
  kuaishou: {
    name: "快手可灵 Kling",
    format: "kuaishou" as ApiFormat,
    baseUrl: "https://api.klingai.com",
    models: [
      {
        id: "kling-v2-master",
        name: "Kling V2 Master",
        capabilities: ["video"],
        defaultParams: { duration: 5 },
      },
      {
        id: "kling-v1-6",
        name: "Kling V1.6",
        capabilities: ["video"],
        defaultParams: { duration: 5 },
      },
      {
        id: "kling-v1-5",
        name: "Kling V1.5",
        capabilities: ["video"],
        defaultParams: { duration: 5 },
      },
    ],
  },

  // PixVerse (阿里云百炼)
  pixverse: {
    name: "PixVerse",
    format: "pixverse" as ApiFormat,
    baseUrl: "https://dashscope.aliyuncs.com/api/v1",
    models: [
      {
        id: "pixverse/pixverse-c1-t2v",
        name: "PixVerse C1",
        capabilities: ["video"],
        defaultParams: { duration: 5, size: "1280*720", maxKeyframes: 7 },
      },
      {
        id: "pixverse/pixverse-v6-t2v",
        name: "PixVerse V6",
        capabilities: ["video"],
        defaultParams: { duration: 5, size: "1280*720", maxKeyframes: 7 },
      },
      {
        id: "pixverse/pixverse-v5.6-t2v",
        name: "PixVerse V5.6",
        capabilities: ["video"],
        defaultParams: { duration: 5, size: "1280*720", maxKeyframes: 7 },
      },
    ],
  },

  // OpenAI Sora
  sora: {
    name: "OpenAI Sora",
    format: "openai" as ApiFormat,
    baseUrl: "https://api.openai.com/v1",
    models: [
      {
        id: "sora-2",
        name: "Sora 2",
        capabilities: ["video"],
        defaultParams: { duration: 60, maxKeyframes: 10 },
      },
    ],
  },

  // Google Gemini
  google: {
    name: "Google Gemini",
    format: "google" as ApiFormat,
    baseUrl: "https://generativeai.googleapis.com/v1",
    models: [
      {
        id: "gemini-3.1-pro",
        name: "Gemini 3.1 Pro",
        capabilities: ["text", "vision"],
        defaultParams: { maxTokens: 4096, temperature: 0.7 },
      },
      {
        id: "gemini-3.1-pro-vision",
        name: "Gemini 3.1 Pro Vision",
        capabilities: ["text", "vision"],
        defaultParams: { maxTokens: 4096, temperature: 0.7 },
      },
      {
        id: "gemini-3.1-ultra",
        name: "Gemini 3.1 Ultra",
        capabilities: ["text", "vision"],
        defaultParams: { maxTokens: 8192, temperature: 0.7 },
      },
    ],
  },

  // Anthropic Claude
  anthropic: {
    name: "Anthropic Claude",
    format: "anthropic" as ApiFormat,
    baseUrl: "https://api.anthropic.com/v1",
    models: [
      {
        id: "claude-3-opus-20240229",
        name: "Claude 3 Opus",
        capabilities: ["text", "vision"],
        defaultParams: { maxTokens: 200000, temperature: 0.7 },
      },
      {
        id: "claude-3-sonnet-20240229",
        name: "Claude 3 Sonnet",
        capabilities: ["text", "vision"],
        defaultParams: { maxTokens: 200000, temperature: 0.7 },
      },
      {
        id: "claude-3-haiku-20240307",
        name: "Claude 3 Haiku",
        capabilities: ["text", "vision"],
        defaultParams: { maxTokens: 200000, temperature: 0.7 },
      },
    ],
  },

  // Amazon Bedrock
  bedrock: {
    name: "Amazon Bedrock",
    format: "anthropic" as ApiFormat,
    baseUrl: "https://bedrock-runtime.us-east-1.amazonaws.com",
    models: [
      {
        id: "anthropic.claude-3-opus-20240229-v1:0",
        name: "Claude 3 Opus (Bedrock)",
        capabilities: ["text", "vision"],
        defaultParams: { maxTokens: 200000, temperature: 0.7 },
      },
      {
        id: "anthropic.claude-3-sonnet-20240229-v1:0",
        name: "Claude 3 Sonnet (Bedrock)",
        capabilities: ["text", "vision"],
        defaultParams: { maxTokens: 200000, temperature: 0.7 },
      },
      {
        id: "google.gemini-1.5-pro-20240613-v1:0",
        name: "Gemini 1.5 Pro (Bedrock)",
        capabilities: ["text", "vision"],
        defaultParams: { maxTokens: 4096, temperature: 0.7 },
      },
    ],
  },

  // DeepSeek
  deepseek: {
    name: "DeepSeek",
    format: "openai" as ApiFormat,
    baseUrl: "https://api.deepseek.com/v1",
    models: [
      {
        id: "deepseek-chat",
        name: "DeepSeek Chat",
        capabilities: ["text"],
        defaultParams: { maxTokens: 4096, temperature: 0.7 },
      },
      {
        id: "deepseek-llm-7b-chat",
        name: "DeepSeek 7B Chat",
        capabilities: ["text"],
        defaultParams: { maxTokens: 4096, temperature: 0.7 },
      },
    ],
  },

  // Fireworks AI
  fireworks: {
    name: "Fireworks AI",
    format: "openai" as ApiFormat,
    baseUrl: "https://api.fireworks.ai/inference/v1",
    models: [
      {
        id: "accounts/fireworks/models/llama-v3-70b-instruct",
        name: "Llama 3 70B Instruct",
        capabilities: ["text"],
        defaultParams: { maxTokens: 4096, temperature: 0.7 },
      },
      {
        id: "accounts/fireworks/models/mixtral-8x7b-instruct",
        name: "Mixtral 8x7B Instruct",
        capabilities: ["text"],
        defaultParams: { maxTokens: 4096, temperature: 0.7 },
      },
    ],
  },
};

// 创建提供商配置（从模板）
export function createProviderFromTemplate(
  templateId: string,
  apiKey: string,
  customId?: string,
): ProviderConfig | null {
  const template = getTemplateWithPlugins(templateId);
  if (!template) return null;

  return {
    id: customId || `${templateId}-${Date.now()}`,
    templateId,
    name: template.name,
    format: template.format,
    baseUrl: template.baseUrl,
    apiKey,
    models: template.models.map((m) => JSON.parse(JSON.stringify(m))),
    isCustom: false,
  };
}
