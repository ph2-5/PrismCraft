/**
 * API 配置系统 - 服务端配置加载
 * 用于 API 路由中读取配置
 */

import { ApiConfig, ApiCapability, ProviderConfig } from "./types";
import fs from "fs";
import path from "path";
import { homedir } from "os";
import crypto from "crypto";
import { getServerEncryptionKey } from "./server-key";
import { errorLogger } from "@/shared/error-logger";

const CONFIG_DIR = path.join(homedir(), ".ai-animation-studio");
const CONFIG_FILE = path.join(CONFIG_DIR, "api-config.json");
const IV_LENGTH = 16;

function encryptField(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    getServerEncryptionKey(),
    iv,
  );
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `srv:${iv.toString("hex")}:${encrypted}`;
}

function decryptField(encrypted: string): string | null {
  if (!encrypted.startsWith("srv:")) return null;
  try {
    const parts = encrypted.split(":");
    if (parts.length !== 3) return null;
    const iv = Buffer.from(parts[1], "hex");
    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      getServerEncryptionKey(),
      iv,
    );
    let decrypted = decipher.update(parts[2], "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (e) {
    errorLogger.warn("[ApiConfig] Failed to decrypt API key", e as Error);
    return null;
  }
}

function encryptConfig(config: ApiConfig): ApiConfig {
  return {
    ...config,
    providers: config.providers.map((p) => ({
      ...p,
      apiKey: p.apiKey ? encryptField(p.apiKey) : "",
    })),
  };
}

function decryptConfig(config: ApiConfig): ApiConfig {
  return {
    ...config,
    providers: config.providers.map((p) => {
      if (p.apiKey && p.apiKey.startsWith("srv:")) {
        const decrypted = decryptField(p.apiKey);
        return { ...p, apiKey: decrypted || p.apiKey };
      }
      return p;
    }),
  };
}

// 缓存配置
let cachedConfig: ApiConfig | null = null;
let lastCacheTime = 0;
const CACHE_MAX_AGE = 5 * 60 * 1000; // 5分钟

// 服务端配置存储（仅在服务端进程内存，临时存储）
let serverSideConfig: ApiConfig | null = null;

/**
 * 从文件加载配置
 */
async function loadConfigFromFile(): Promise<ApiConfig | null> {
  try {
    const fsPromises = fs.promises;
    try {
      await fsPromises.access(CONFIG_FILE);
      const content = await fsPromises.readFile(CONFIG_FILE, "utf8");
      const config = JSON.parse(content);
      const decrypted = decryptConfig(config);
      errorLogger.info("[API Config] 从 api-config.json 加载配置成功");
      return decrypted;
    } catch (error) {
      errorLogger.debug("[API Config] api-config.json 不存在或无法解析:", error instanceof Error ? error.message : error);
    }

    const ipcConfigFile = path.join(CONFIG_DIR, "config.json");
    try {
      await fsPromises.access(ipcConfigFile);
      const content = await fsPromises.readFile(ipcConfigFile, "utf8");
      const config = JSON.parse(content);
      if (config.providers || config.mapping) {
        errorLogger.info("[API Config] 从 config.json (IPC) 回退加载配置成功");
        await saveConfigToFile(config);
        return config;
      }
    } catch (error) {
      errorLogger.debug("[API Config] config.json 不存在或无法解析:", error instanceof Error ? error.message : error);
    }

    errorLogger.warn("[API Config] 没有找到配置文件");
  } catch (error) {
    errorLogger.error("[API Config] 从文件加载配置失败:", error);
  }
  return null;
}

async function saveConfigToFile(config: ApiConfig): Promise<void> {
  try {
    const fsPromises = fs.promises;
    await fsPromises.mkdir(CONFIG_DIR, { recursive: true });
    const encrypted = encryptConfig(config);
    const tempPath = `${CONFIG_FILE}.tmp`;
    await fsPromises.writeFile(tempPath, JSON.stringify(encrypted, null, 2));
    await fsPromises.rename(tempPath, CONFIG_FILE);
    try {
      await fsPromises.chmod(CONFIG_FILE, 0o600);
    } catch (error) {
      errorLogger.debug("[API Config] chmod 失败 (非关键):", error instanceof Error ? error.message : error);
    }
    errorLogger.info("[API Config] 配置已加密保存到文件");
  } catch (error) {
    errorLogger.error("[API Config] 保存配置到文件失败:", error);
  }
}

/**
 * 清除配置缓存（当配置更新后调用）
 */
export function clearConfigCache(): void {
  cachedConfig = null;
  lastCacheTime = 0;
  serverSideConfig = null;
  errorLogger.info("[API Config] 服务端配置缓存已清除");
}

/**
 * 手动刷新配置缓存
 */
export async function refreshConfigCache(): Promise<void> {
  clearConfigCache();
  await loadServerConfig();
}

/**
 * 在服务端保存配置
 */
export async function saveServerConfig(config: ApiConfig): Promise<void> {
  await saveConfigToFile(config);
  serverSideConfig = config;
  cachedConfig = config;
  lastCacheTime = Date.now();

  errorLogger.info("[API Config] 服务端配置已更新并保存到文件");
}

/**
 * 从环境变量加载配置
 */
export async function loadServerConfig(): Promise<ApiConfig> {
  // 优先检查服务端保存的配置
  if (serverSideConfig) {
    return serverSideConfig;
  }

  // 检查缓存是否有效
  if (cachedConfig && Date.now() - lastCacheTime < CACHE_MAX_AGE) {
    return cachedConfig;
  }

  // 尝试从文件加载配置
  const fileConfig = await loadConfigFromFile();
  if (fileConfig) {
    // 更新缓存
    cachedConfig = fileConfig;
    lastCacheTime = Date.now();
    return fileConfig;
  }

  // 如果文件不存在，创建默认配置
  const config: ApiConfig = {
    version: 1,
    providers: [],
    mapping: {},
    fallback: {
      enabled: true,
      order: ["text", "image", "vision", "video"],
    },
  };

  // 从环境变量读取配置（支持多种命名方式）
  const env = process.env;

  // 文本生成配置
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
      name: "环境变量-文本",
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

  // 图像生成配置
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
        name: "环境变量-图像",
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

  // 视频生成配置
  const videoApiKey =
    env.AI_VIDEO_API_KEY || env.SEEDANCE_API_KEY || env.ZHIPU_API_KEY;
  const videoApiUrl =
    env.AI_VIDEO_API_URL || "https://open.bigmodel.cn/api/paas/v4";
  const videoModel = env.AI_VIDEO_MODEL || "cogvideox-3";

  if (videoApiKey) {
    config.providers.push({
      id: "env-video",
      name: "环境变量-视频",
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

  // 视觉/图像识别配置（通常与文本共用）
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
        name: "环境变量-视觉",
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

  // 保存配置到文件（如果有环境变量配置且非打包模式）
  const isPackagedApp =
    process.env.ELECTRON_IS_PACKAGED === "1" ||
    (process.execPath &&
      !process.execPath.includes("node") &&
      !process.execPath.includes("electron") &&
      process.execPath.includes("AI Animation"));
  if (config.providers.length > 0 && !isPackagedApp) {
    await saveConfigToFile(config);
  }

  // 更新缓存
  cachedConfig = config;
  lastCacheTime = Date.now();
  return config;
}

/**
 * 检查服务端是否有指定功能的配置
 */
export async function hasServerCapability(
  capability: ApiCapability,
): Promise<boolean> {
  const config = await loadServerConfig();
  return !!config.mapping[capability];
}

/**
 * 获取指定功能的配置（用于服务端）
 */
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

  const firstSlashIndex = mappingValue.indexOf("/");
  if (firstSlashIndex === -1) {
    return { provider: null, modelId: null };
  }
  const providerId = mappingValue.substring(0, firstSlashIndex);
  const modelId = mappingValue.substring(firstSlashIndex + 1);
  const provider = config.providers.find((p) => p.id === providerId);

  return { provider: provider || null, modelId: modelId || null };
}

/**
 * 验证客户端配置
 */
function validateClientConfig(config: Partial<ApiConfig>): boolean {
  // 验证providers
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

  // 验证mapping
  if (config.mapping) {
    if (typeof config.mapping !== "object" || config.mapping === null)
      return false;
  }

  // 验证fallback
  if (config.fallback) {
    if (typeof config.fallback !== "object" || config.fallback === null)
      return false;
    if (typeof config.fallback.enabled !== "boolean") return false;
    if (config.fallback.order && !Array.isArray(config.fallback.order))
      return false;
  }

  return true;
}

/**
 * 合并客户端配置（从请求中传入）
 */
export async function mergeWithServerConfig(
  clientConfig: Partial<ApiConfig>,
): Promise<ApiConfig> {
  const serverConfig = await loadServerConfig();

  // 验证客户端配置
  if (!validateClientConfig(clientConfig)) {
    errorLogger.warn("[API Config] 客户端配置验证失败，使用服务端配置");
    return serverConfig;
  }

  // 合并providers，避免重复
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

  // 合并mapping，服务端mapping优先
  const mergedMapping = {
    ...clientConfig.mapping,
    ...serverConfig.mapping, // 服务端mapping优先覆盖
  };

  return {
    ...serverConfig,
    ...clientConfig,
    providers: mergedProviders,
    mapping: mergedMapping,
  };
}
