/**
 * API 配置初始化与状态检查
 */

import { type ApiConfig, type ApiCapability } from "./types";
import { loadConfig, getCapabilityConfig } from "./storage";
import { t } from "@/shared/constants";

export interface ConfigStatusItem {
  configured: boolean;
  provider: string;
  available: boolean;
  model?: string;
}

export interface ConfigStatus {
  text: ConfigStatusItem;
  image: ConfigStatusItem;
  vision: ConfigStatusItem;
  video: ConfigStatusItem;
  // 用于UI的便捷属性
  allConfigured: boolean;
  configuredCount: number;
  totalCount: number;
  missing: string[];
}

/**
 * 检查配置状态
 */
export async function checkConfigStatus(): Promise<ConfigStatus> {
  const config = await loadConfig();

  const text = checkCapabilityStatus(config, "text");
  const image = checkCapabilityStatus(config, "image");
  const vision = checkCapabilityStatus(config, "vision");
  const video = checkCapabilityStatus(config, "video");

  const capabilityNames: Record<ApiCapability, string> = {
    text: t("api.textGeneration"),
    image: t("api.imageGeneration"),
    vision: t("api.visionAnalysis"),
    video: t("api.videoGeneration"),
  };

  const items = [text, image, vision, video];
  const configuredCount = items.filter((i) => i.configured).length;
  const totalCount = items.length;
  const missing: string[] = [];

  (["text", "image", "vision", "video"] as ApiCapability[]).forEach((cap) => {
    if (!items[["text", "image", "vision", "video"].indexOf(cap)]!.configured) {
      missing.push(capabilityNames[cap]);
    }
  });

  return {
    text,
    image,
    vision,
    video,
    allConfigured: configuredCount === totalCount,
    configuredCount,
    totalCount,
    missing,
  };
}

/**
 * 检查单个功能的配置状态
 */
function checkCapabilityStatus(
  config: ApiConfig,
  capability: ApiCapability,
): ConfigStatusItem {
  const { provider, modelId } = getCapabilityConfig(config, capability);

  if (!provider || !modelId) {
    return {
      configured: false,
      provider: t("api.notConfigured"),
      available: false,
    };
  }

  return {
    configured: true,
    provider: provider.name,
    available: true,
    model: modelId,
  };
}

/**
 * 获取缺失的配置项
 */
export async function getMissingCapabilities(): Promise<string[]> {
  const status = await checkConfigStatus();
  const missing: string[] = [];

  const capabilityNames: Record<ApiCapability, string> = {
    text: t("api.textGeneration"),
    image: t("api.imageGeneration"),
    vision: t("api.visionAnalysis"),
    video: t("api.videoGeneration"),
  };

  (["text", "image", "vision", "video"] as ApiCapability[]).forEach((cap) => {
    if (!status[cap].configured) {
      missing.push(capabilityNames[cap]);
    }
  });

  return missing;
}

/**
 * 检查是否所有功能都已配置
 */
export async function isFullyConfigured(): Promise<boolean> {
  return (await getMissingCapabilities()).length === 0;
}

/**
 * 初始化配置（首次使用）
 */
import { errorLogger } from "@/shared/error-logger";

export function initConfig(): void {
  // 可以在这里添加首次使用的引导逻辑
  errorLogger.info("[API Config] 初始化配置系统");
}
