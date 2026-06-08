import { type ApiConfig, type ApiCapability, type ProviderConfig } from "./types";
import { errorLogger } from "@/shared/error-logger";
import { t } from "@/shared/constants";
import { loadConfigFromFile, saveConfigToFile } from "./server-encryption";

let cachedConfig: ApiConfig | null = null;
let lastCacheTime = 0;
const CACHE_MAX_AGE = 5 * 60 * 1000;

let serverSideConfig: ApiConfig | null = null;

export function clearConfigCache(): void {
  cachedConfig = null;
  lastCacheTime = 0;
  serverSideConfig = null;
  errorLogger.info("[API Config] 服务端配置缓存已清除");
}

export async function refreshConfigCache(): Promise<void> {
  clearConfigCache();
  await loadServerConfig();
}

export async function saveServerConfig(config: ApiConfig): Promise<void> {
  await saveConfigToFile(config);
  serverSideConfig = config;
  cachedConfig = config;
  lastCacheTime = Date.now();
  errorLogger.info("[API Config] 服务端配置已更新并保存到文件");
}

export async function loadServerConfig(): Promise<ApiConfig> {
  if (serverSideConfig) {
    return serverSideConfig;
  }

  if (cachedConfig && Date.now() - lastCacheTime < CACHE_MAX_AGE) {
    return cachedConfig;
  }

  const fileConfig = await loadConfigFromFile();
  if (fileConfig) {
    cachedConfig = fileConfig;
    lastCacheTime = Date.now();
    return fileConfig;
  }

  const config: ApiConfig = {
    version: 1,
    providers: [],
    mapping: {},
    fallback: {
      enabled: true,
      order: ["text", "image", "vision", "video"],
    },
  };

  const env = process.env;

  const textApiKey =
    env.AI_TEXT_API_KEY ||
    env.OPENAI_API_KEY ||
    env.MOONSHOT_API_KEY ||
    env.VOLCENGINE_API_KEY;
  const textApiUrl =
    env.AI_TEXT_API_URL || env.OPENAI_API_URL || "https://api.openai.com/v1";
  const textModel = env.AI_TEXT_MODEL || "gpt-4o";

  if (textApiKey) {
    config.providers.push({
      id: "env-text",
      name: t("api.envText"),
      format: "openai",
      baseUrl: textApiUrl,
      apiKey: textApiKey,
      models: [
        {
          id: textModel,
          name: textModel,
          capabilities: ["text"],
        },
      ],
    });
    config.mapping.text = `env-text/${textModel}`;
  }

  const imageApiKey =
    env.AI_IMAGE_API_KEY || env.VOLCENGINE_API_KEY || env.OPENAI_API_KEY;
  const imageApiUrl = env.AI_IMAGE_API_URL || "https://api.openai.com/v1";
  const imageModel = env.AI_IMAGE_MODEL || "dall-e-3";

  if (imageApiKey) {
    const existingProvider = config.providers.find(
      (p) => p.apiKey === imageApiKey && p.baseUrl === imageApiUrl,
    );
    if (existingProvider) {
      existingProvider.models.push({
        id: imageModel,
        name: imageModel,
        capabilities: ["image"],
      });
      config.mapping.image = `${existingProvider.id}/${imageModel}`;
    } else {
      config.providers.push({
        id: "env-image",
        name: t("api.envImage"),
        format: "openai",
        baseUrl: imageApiUrl,
        apiKey: imageApiKey,
        models: [
          {
            id: imageModel,
            name: imageModel,
            capabilities: ["image"],
          },
        ],
      });
      config.mapping.image = `env-image/${imageModel}`;
    }
  }

  const videoApiKey =
    env.AI_VIDEO_API_KEY || env.SEEDANCE_API_KEY || env.ZHIPU_API_KEY;
  const videoApiUrl =
    env.AI_VIDEO_API_URL || "https://open.bigmodel.cn/api/paas/v4";
  const videoModel = env.AI_VIDEO_MODEL || "cogvideox-3";

  if (videoApiKey) {
    config.providers.push({
      id: "env-video",
      name: t("api.envVideo"),
      format: "zhipu",
      baseUrl: videoApiUrl,
      apiKey: videoApiKey,
      models: [
        {
          id: videoModel,
          name: videoModel,
          capabilities: ["video"],
        },
      ],
    });
    config.mapping.video = `env-video/${videoModel}`;
  }

  const visionApiKey = env.AI_VISION_API_KEY || textApiKey;
  const visionApiUrl = env.AI_VISION_API_URL || textApiUrl;
  const visionModel = env.AI_VISION_MODEL || "gpt-4o";

  if (visionApiKey) {
    const existingProvider = config.providers.find(
      (p) => p.apiKey === visionApiKey && p.baseUrl === visionApiUrl,
    );
    if (existingProvider) {
      const existingModel = existingProvider.models.find(
        (m) => m.id === visionModel,
      );
      if (existingModel) {
        if (!existingModel.capabilities.includes("vision")) {
          existingModel.capabilities.push("vision");
        }
      } else {
        existingProvider.models.push({
          id: visionModel,
          name: visionModel,
          capabilities: ["vision"],
        });
      }
      config.mapping.vision = `${existingProvider.id}/${visionModel}`;
    } else {
      config.providers.push({
        id: "env-vision",
        name: t("api.envVision"),
        format: "openai",
        baseUrl: visionApiUrl,
        apiKey: visionApiKey,
        models: [
          {
            id: visionModel,
            name: visionModel,
            capabilities: ["vision"],
          },
        ],
      });
      config.mapping.vision = `env-vision/${visionModel}`;
    }
  }

  const isPackagedApp =
    process.env.ELECTRON_IS_PACKAGED === "1" ||
    (process.execPath &&
      !process.execPath.includes("node") &&
      !process.execPath.includes("electron") &&
      process.execPath.includes("AI Animation"));
  if (config.providers.length > 0 && !isPackagedApp) {
    await saveConfigToFile(config);
  }

  cachedConfig = config;
  lastCacheTime = Date.now();
  return config;
}

export async function hasServerCapability(
  capability: ApiCapability,
): Promise<boolean> {
  const config = await loadServerConfig();
  return !!config.mapping[capability];
}

export async function getCapabilityConfigForServer(
  capability: ApiCapability,
): Promise<{
  provider: ProviderConfig | null;
  modelId: string | null;
}> {
  const config = await loadServerConfig();
  const mappingValue = config.mapping[capability];

  if (!mappingValue) {
    return { provider: null, modelId: null };
  }

  const lastSlashIndex = mappingValue.lastIndexOf("/");
  if (lastSlashIndex === -1) {
    return { provider: null, modelId: null };
  }
  const providerId = mappingValue.substring(0, lastSlashIndex);
  const modelId = mappingValue.substring(lastSlashIndex + 1);
  const provider = config.providers.find((p) => p.id === providerId);

  return { provider: provider || null, modelId: modelId || null };
}

function validateClientConfig(config: Partial<ApiConfig>): boolean {
  if (config.providers) {
    if (!Array.isArray(config.providers)) return false;
    for (const provider of config.providers) {
      if (
        !provider.id ||
        !provider.name ||
        !provider.format ||
        !provider.baseUrl ||
        !provider.apiKey ||
        !Array.isArray(provider.models)
      ) {
        return false;
      }
      for (const model of provider.models) {
        if (!model.id || !model.name || !Array.isArray(model.capabilities)) {
          return false;
        }
      }
    }
  }

  if (config.mapping) {
    if (typeof config.mapping !== "object" || config.mapping === null)
      return false;
  }

  if (config.fallback) {
    if (typeof config.fallback !== "object" || config.fallback === null)
      return false;
    if (typeof config.fallback.enabled !== "boolean") return false;
    if (config.fallback.order && !Array.isArray(config.fallback.order))
      return false;
  }

  return true;
}

export async function mergeWithServerConfig(
  clientConfig: Partial<ApiConfig>,
): Promise<ApiConfig> {
  const serverConfig = await loadServerConfig();

  if (!validateClientConfig(clientConfig)) {
    errorLogger.warn("[API Config] 客户端配置验证失败，使用服务端配置");
    return serverConfig;
  }

  const mergedProviders = [...serverConfig.providers];
  const providerIds = new Set(serverConfig.providers.map((p) => p.id));

  if (clientConfig.providers) {
    for (const provider of clientConfig.providers) {
      if (!providerIds.has(provider.id)) {
        providerIds.add(provider.id);
        mergedProviders.push(provider);
      }
    }
  }

  const mergedMapping = {
    ...clientConfig.mapping,
    ...serverConfig.mapping,
  };

  return {
    ...serverConfig,
    ...clientConfig,
    providers: mergedProviders,
    mapping: mergedMapping,
  };
}
