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

/**
 * 配置状态
 *
 * `capabilities` 用 Record<ApiCapability, ConfigStatusItem> 表示，
 * 新增能力类型时无需修改此接口。
 *
 * `allConfigured` 仅检查**核心能力**（text/image/vision/video），
 * embedding/audio 为可选能力，不强制要求配置。
 */
export interface ConfigStatus {
  /** 各能力的配置状态（包含所有 ApiCapability） */
  capabilities: Record<ApiCapability, ConfigStatusItem>;
  // 用于UI的便捷属性
  /** 核心能力是否全部配置（不含 embedding/audio） */
  allConfigured: boolean;
  configuredCount: number;
  totalCount: number;
  missing: string[];
}

/**
 * 核心能力（必须配置才能正常运行）
 *
 * embedding/audio 为可选能力，缺失时仅影响相关功能（记忆向量检索/音频生成），
 * 不阻塞主流程。
 */
const CORE_CAPABILITIES: ApiCapability[] = ["text", "image", "vision", "video"];

/**
 * 全部能力（用于遍历显示）
 */
const ALL_CAPABILITIES: ApiCapability[] = ["text", "image", "vision", "video", "embedding", "audio"];

/**
 * 能力的本地化名称映射
 */
function getCapabilityNames(): Record<ApiCapability, string> {
  return {
    text: t("api.textGeneration"),
    image: t("api.imageGeneration"),
    vision: t("api.visionAnalysis"),
    video: t("api.videoGeneration"),
    embedding: t("api.embeddingGeneration"),
    audio: t("api.audioGeneration"),
  };
}

/**
 * 检查配置状态
 */
export async function checkConfigStatus(): Promise<ConfigStatus> {
  const config = await loadConfig();

  const capabilities = {} as Record<ApiCapability, ConfigStatusItem>;
  for (const cap of ALL_CAPABILITIES) {
    capabilities[cap] = checkCapabilityStatus(config, cap);
  }

  const capabilityNames = getCapabilityNames();

  // 仅统计核心能力的配置情况
  const coreItems = CORE_CAPABILITIES.map((cap) => capabilities[cap]);
  const configuredCount = coreItems.filter((i) => i.configured).length;
  const totalCount = coreItems.length;
  const missing: string[] = [];

  CORE_CAPABILITIES.forEach((cap) => {
    if (!capabilities[cap].configured) {
      missing.push(capabilityNames[cap]);
    }
  });

  return {
    capabilities,
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
 * 获取缺失的配置项（仅核心能力）
 */
export async function getMissingCapabilities(): Promise<string[]> {
  const status = await checkConfigStatus();
  return status.missing;
}

/**
 * 检查是否所有核心功能都已配置
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
