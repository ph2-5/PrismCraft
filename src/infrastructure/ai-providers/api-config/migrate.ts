/**
 * 配置迁移工具
 * 支持从旧版配置迁移到新版
 */

import { type ApiConfig, type ProviderConfig } from "./types";
import { getDefaultConfig, saveConfig } from "./storage";
import { PROVIDER_TEMPLATES } from "./templates";
import { detectProvider } from "./detect";
import { errorLogger } from "@/shared/error-logger";
import { t } from "@/shared/constants";

// 旧版配置类型
interface OldApiConfig {
  textApiKey?: string;
  textApiUrl?: string;
  textModel?: string;
  imageApiKey?: string;
  imageApiUrl?: string;
  imageModel?: string;
  videoApiKey?: string;
  videoApiUrl?: string;
  videoModel?: string;
  visionApiKey?: string;
  visionApiUrl?: string;
  visionModel?: string;
}

/**
 * 从旧版配置迁移
 */
export function migrateFromOldConfig(
  oldConfig: OldApiConfig | string,
): ApiConfig {
  const config = getDefaultConfig();

  // 如果是字符串，尝试解析
  let parsedConfig: OldApiConfig;
  if (typeof oldConfig === "string") {
    try {
      parsedConfig = JSON.parse(oldConfig);
    } catch (e) {
      errorLogger.warn("[API Config] 旧版配置 JSON 解析失败", e);
      return config;
    }
  } else {
    parsedConfig = oldConfig;
  }

  // 迁移文本生成配置
  if (parsedConfig.textApiKey) {
    const detected = detectProvider(parsedConfig.textApiKey);
    const templateId = detected?.templateId || "openai";
    const template = PROVIDER_TEMPLATES[templateId];

    const provider: ProviderConfig = {
      id: `migrated-text-${crypto.randomUUID()}`,
      name: `${template?.name || t("api.textApi")}`,
      format: template?.format || "openai",
      baseUrl:
        parsedConfig.textApiUrl ||
        template?.baseUrl ||
        "https://api.openai.com/v1",
      apiKey: parsedConfig.textApiKey,
      models: [
        {
          id: parsedConfig.textModel || "gpt-4o",
          name: parsedConfig.textModel || "GPT-4o",
          capabilities: ["text"],
        },
      ],
    };

    config.providers.push(provider);
    const firstModel = provider.models[0];
    if (firstModel) {
      config.mapping.text = `${provider.id}/${firstModel.id}`;
    }
  }

  // 迁移图像生成配置
  if (parsedConfig.imageApiKey) {
    const detected = detectProvider(parsedConfig.imageApiKey);
    const templateId = detected?.templateId || "openai";
    const template = PROVIDER_TEMPLATES[templateId];

    // 检查是否可以和文本共用同一个 provider
    const existingProvider = config.providers.find(
      (p) =>
        p.apiKey === parsedConfig.imageApiKey &&
        p.baseUrl === (parsedConfig.imageApiUrl || template?.baseUrl),
    );

    if (existingProvider) {
      existingProvider.models.push({
        id: parsedConfig.imageModel || "dall-e-3",
        name: parsedConfig.imageModel || "DALL-E 3",
        capabilities: ["image"],
      });
      config.mapping.image = `${existingProvider.id}/${parsedConfig.imageModel || "dall-e-3"}`;
    } else {
      const provider: ProviderConfig = {
        id: `migrated-image-${crypto.randomUUID()}`,
        name: `${template?.name || t("api.imageApi")}`,
        format: template?.format || "openai",
        baseUrl:
          parsedConfig.imageApiUrl ||
          template?.baseUrl ||
          "https://api.openai.com/v1",
        apiKey: parsedConfig.imageApiKey,
        models: [
          {
            id: parsedConfig.imageModel || "dall-e-3",
            name: parsedConfig.imageModel || "DALL-E 3",
            capabilities: ["image"],
          },
        ],
      };

      config.providers.push(provider);
      const firstModel = provider.models[0];
      if (firstModel) {
        config.mapping.image = `${provider.id}/${firstModel.id}`;
      }
    }
  }

  // 迁移视频生成配置
  if (parsedConfig.videoApiKey) {
    const detected = detectProvider(parsedConfig.videoApiKey);
    const templateId = detected?.templateId || "zhipu";
    const template = PROVIDER_TEMPLATES[templateId];

    const provider: ProviderConfig = {
      id: `migrated-video-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      name: `${template?.name || t("api.videoApi")}`,
      format: template?.format || "zhipu",
      baseUrl:
        parsedConfig.videoApiUrl ||
        template?.baseUrl ||
        "https://open.bigmodel.cn/api/paas/v4",
      apiKey: parsedConfig.videoApiKey,
      models: [
        {
          id: parsedConfig.videoModel || "cogvideox-3",
          name: parsedConfig.videoModel || "CogVideoX-3",
          capabilities: ["video"],
        },
      ],
    };

    config.providers.push(provider);
    const firstModel = provider.models[0];
    if (firstModel) {
      config.mapping.video = `${provider.id}/${firstModel.id}`;
    }
  }

  // 迁移视觉配置
  if (parsedConfig.visionApiKey) {
    const detected = detectProvider(parsedConfig.visionApiKey);
    const templateId = detected?.templateId || "openai";
    const template = PROVIDER_TEMPLATES[templateId];

    // 检查是否可以和文本共用
    const existingProvider = config.providers.find(
      (p) =>
        p.apiKey === parsedConfig.visionApiKey &&
        p.baseUrl === (parsedConfig.visionApiUrl || template?.baseUrl),
    );

    if (existingProvider) {
      const existingModel = existingProvider.models.find(
        (m) => m.id === (parsedConfig.visionModel || "gpt-4o"),
      );
      if (existingModel) {
        if (!existingModel.capabilities.includes("vision")) {
          existingModel.capabilities.push("vision");
        }
      } else {
        existingProvider.models.push({
          id: parsedConfig.visionModel || "gpt-4o",
          name: parsedConfig.visionModel || "GPT-4o",
          capabilities: ["vision"],
        });
      }
      config.mapping.vision = `${existingProvider.id}/${parsedConfig.visionModel || "gpt-4o"}`;
    } else {
      const provider: ProviderConfig = {
        id: `migrated-vision-${crypto.randomUUID()}`,
        name: `${template?.name || t("api.visionApi")}`,
        format: template?.format || "openai",
        baseUrl:
          parsedConfig.visionApiUrl ||
          template?.baseUrl ||
          "https://api.openai.com/v1",
        apiKey: parsedConfig.visionApiKey,
        models: [
          {
            id: parsedConfig.visionModel || "gpt-4o",
            name: parsedConfig.visionModel || "GPT-4o",
            capabilities: ["vision"],
          },
        ],
      };

      config.providers.push(provider);
      const firstModel = provider.models[0];
      if (firstModel) {
        config.mapping.vision = `${provider.id}/${firstModel.id}`;
      }
    }
  }

  return config;
}

/**
 * 检查是否需要迁移
 */
export function needsMigration(): boolean {
  if (typeof window === "undefined") return false;

  // 检查是否存在旧版配置
  const oldConfig = localStorage.getItem("ai-animation-config");
  const newConfig = localStorage.getItem("ai_animation_studio_api_config");

  return !!oldConfig && !newConfig;
}

/**
 * 执行迁移
 */
export async function runMigration(): Promise<ApiConfig | null> {
  if (typeof window === "undefined") return null;

  const oldConfig = localStorage.getItem("ai-animation-config");
  if (!oldConfig) return null;

  try {
    const parsed = JSON.parse(oldConfig);
    const migrated = migrateFromOldConfig(parsed);

    if (migrated) {
      await saveConfig(migrated);
      localStorage.removeItem("ai-animation-config");
    }

    return migrated;
  } catch (error) {
    errorLogger.error("[API Config] 迁移失败:", error);
    return null;
  }
}
