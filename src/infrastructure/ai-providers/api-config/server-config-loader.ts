import { type ApiConfig, type ApiCapability, type ProviderConfig, type ApiFormat } from "./types";
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

function getCachedConfig(): ApiConfig | null {
  if (serverSideConfig) return serverSideConfig;
  if (cachedConfig && Date.now() - lastCacheTime < CACHE_MAX_AGE) return cachedConfig;
  return null;
}

function createEmptyConfig(): ApiConfig {
  return {
    version: 1,
    providers: [],
    mapping: {},
    fallback: { enabled: true, order: ["text", "image", "vision", "video"] },
  };
}

function findProviderByCredentials(
  config: ApiConfig,
  apiKey: string,
  baseUrl: string,
): ProviderConfig | undefined {
  return config.providers.find((p) => p.apiKey === apiKey && p.baseUrl === baseUrl);
}

function addNewProvider(
  config: ApiConfig,
  id: string,
  name: string,
  format: ApiFormat,
  baseUrl: string,
  apiKey: string,
  modelId: string,
  capability: ApiCapability,
): void {
  config.providers.push({
    id,
    name,
    format,
    baseUrl,
    apiKey,
    models: [{ id: modelId, name: modelId, capabilities: [capability] }],
  });
  config.mapping[capability] = `${id}/${modelId}`;
}

function addOrMergeProvider(
  config: ApiConfig,
  newId: string,
  name: string,
  format: ApiFormat,
  baseUrl: string,
  apiKey: string,
  modelId: string,
  capability: ApiCapability,
): void {
  if (!apiKey) return;
  const existing = findProviderByCredentials(config, apiKey, baseUrl);
  if (existing) {
    existing.models.push({ id: modelId, name: modelId, capabilities: [capability] });
    config.mapping[capability] = `${existing.id}/${modelId}`;
  } else {
    addNewProvider(config, newId, name, format, baseUrl, apiKey, modelId, capability);
  }
}

function addVisionProvider(
  config: ApiConfig,
  apiKey: string,
  baseUrl: string,
  modelId: string,
): void {
  if (!apiKey) return;
  const existing = findProviderByCredentials(config, apiKey, baseUrl);
  if (existing) {
    const existingModel = existing.models.find((m) => m.id === modelId);
    if (existingModel) {
      if (!existingModel.capabilities.includes("vision")) existingModel.capabilities.push("vision");
    } else {
      existing.models.push({ id: modelId, name: modelId, capabilities: ["vision"] });
    }
    config.mapping.vision = `${existing.id}/${modelId}`;
  } else {
    addNewProvider(config, "env-vision", t("api.envVision"), "openai", baseUrl, apiKey, modelId, "vision");
  }
}

function addTextProviderFromEnv(config: ApiConfig, env: NodeJS.ProcessEnv): void {
  const apiKey = env.AI_TEXT_API_KEY || env.OPENAI_API_KEY || env.MOONSHOT_API_KEY || env.VOLCENGINE_API_KEY;
  const apiUrl = env.AI_TEXT_API_URL || env.OPENAI_API_URL || "https://api.openai.com/v1";
  const model = env.AI_TEXT_MODEL || "gpt-4o";
  if (apiKey) {
    addNewProvider(config, "env-text", t("api.envText"), "openai", apiUrl, apiKey, model, "text");
  }
}

function addImageProviderFromEnv(config: ApiConfig, env: NodeJS.ProcessEnv): void {
  const apiKey = env.AI_IMAGE_API_KEY || env.VOLCENGINE_API_KEY || env.OPENAI_API_KEY;
  const apiUrl = env.AI_IMAGE_API_URL || "https://api.openai.com/v1";
  const model = env.AI_IMAGE_MODEL || "dall-e-3";
  if (apiKey) {
    addOrMergeProvider(config, "env-image", t("api.envImage"), "openai", apiUrl, apiKey, model, "image");
  }
}

function addVideoProviderFromEnv(config: ApiConfig, env: NodeJS.ProcessEnv): void {
  const apiKey = env.AI_VIDEO_API_KEY || env.SEEDANCE_API_KEY || env.ZHIPU_API_KEY;
  const apiUrl = env.AI_VIDEO_API_URL || "https://open.bigmodel.cn/api/paas/v4";
  const model = env.AI_VIDEO_MODEL || "cogvideox-3";
  if (apiKey) {
    addNewProvider(config, "env-video", t("api.envVideo"), "zhipu", apiUrl, apiKey, model, "video");
  }
}

function addVisionProviderFromEnv(config: ApiConfig, env: NodeJS.ProcessEnv, textApiKey: string | undefined): void {
  const apiKey = env.AI_VISION_API_KEY || textApiKey;
  const apiUrl = env.AI_VISION_API_URL || env.AI_TEXT_API_URL || env.OPENAI_API_URL || "https://api.openai.com/v1";
  const model = env.AI_VISION_MODEL || "gpt-4o";
  if (apiKey) {
    addVisionProvider(config, apiKey, apiUrl, model);
  }
}

function buildEnvConfig(env: NodeJS.ProcessEnv): ApiConfig {
  const config = createEmptyConfig();
  addTextProviderFromEnv(config, env);
  addImageProviderFromEnv(config, env);
  addVideoProviderFromEnv(config, env);
  const textApiKey = env.AI_TEXT_API_KEY || env.OPENAI_API_KEY || env.MOONSHOT_API_KEY || env.VOLCENGINE_API_KEY;
  addVisionProviderFromEnv(config, env, textApiKey);
  return config;
}

function isPackagedEnvironment(): boolean {
  if (process.env.ELECTRON_IS_PACKAGED === "1") return true;
  return Boolean(
    process.execPath &&
      !process.execPath.includes("node") &&
      !process.execPath.includes("electron") &&
      process.execPath.includes("AI Animation"),
  );
}

export async function loadServerConfig(): Promise<ApiConfig> {
  const cached = getCachedConfig();
  if (cached) return cached;

  const fileConfig = await loadConfigFromFile();
  if (fileConfig) {
    cachedConfig = fileConfig;
    lastCacheTime = Date.now();
    return fileConfig;
  }

  const config = buildEnvConfig(process.env);
  if (config.providers.length > 0 && !isPackagedEnvironment()) {
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

function validateProvider(provider: ProviderConfig): boolean {
  if (!provider.id || !provider.name || !provider.format || !provider.baseUrl || !provider.apiKey) return false;
  if (!Array.isArray(provider.models)) return false;
  return provider.models.every((m) => m.id && m.name && Array.isArray(m.capabilities));
}

function validateClientConfig(config: Partial<ApiConfig>): boolean {
  if (config.providers) {
    if (!Array.isArray(config.providers)) return false;
    if (!config.providers.every(validateProvider)) return false;
  }
  if (config.mapping && (typeof config.mapping !== "object" || config.mapping === null)) return false;
  if (config.fallback) {
    if (typeof config.fallback !== "object" || config.fallback === null) return false;
    if (typeof config.fallback.enabled !== "boolean") return false;
    if (config.fallback.order && !Array.isArray(config.fallback.order)) return false;
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
