/**
 * 云端 API 网关配置（P3.6：云端化接口预研）。
 *
 * 将 API 客户端的 baseUrl 从硬编码的 `http://localhost:<port>` 抽象为
 * 可配置的网关模式：
 * - local（默认）：请求发送到 Electron 本地 API 服务器
 * - remote：请求发送到远程 SaaS 网关（baseUrl + Bearer token 鉴权）
 *
 * 设计约束：
 * - 纯函数（resolveApiBaseUrl / buildGatewayHeaders）零副作用，便于测试
 * - 运行时配置通过 setGatewayConfig 注入（UI 设置页调用），内存缓存
 * - 持久化通过 @/shared/file-http 的 getConfig/setConfig（"cloud.gateway" key）
 * - 未配置远程网关时始终回退本地模式，保证向后兼容
 */

import { getConfig, setConfig } from "@/shared/file-http";

export type GatewayMode = "local" | "remote";

export interface CloudGatewayConfig {
  mode: GatewayMode;
  /** 远程网关 base URL（mode=remote 时必填），如 https://api.example.com */
  baseUrl?: string;
  /** 远程网关鉴权 token（mode=remote 时可选） */
  token?: string;
}

/** 本地模式的默认网关配置 */
export const DEFAULT_GATEWAY_CONFIG: CloudGatewayConfig = { mode: "local" };

/** 云端网关配置持久化 key */
const GATEWAY_CONFIG_KEY = "cloud.gateway";

let currentGatewayConfig: CloudGatewayConfig = { ...DEFAULT_GATEWAY_CONFIG };

/** 设置运行时网关配置（不持久化，仅内存生效） */
export function setGatewayConfig(config: CloudGatewayConfig): void {
  currentGatewayConfig = {
    ...DEFAULT_GATEWAY_CONFIG,
    ...config,
  };
}

/** 读取当前运行时网关配置 */
export function getGatewayConfig(): CloudGatewayConfig {
  return { ...currentGatewayConfig };
}

/** 重置为本地模式（测试/登出用） */
export function resetGatewayConfig(): void {
  currentGatewayConfig = { ...DEFAULT_GATEWAY_CONFIG };
}

/**
 * 从持久化配置加载网关配置（失败或未配置时保持默认本地模式）。
 * 幂等，可在应用启动时调用。
 */
export async function loadGatewayConfig(): Promise<CloudGatewayConfig> {
  try {
    const stored = await getConfig(GATEWAY_CONFIG_KEY);
    if (stored && typeof stored === "object" && "mode" in stored) {
      const parsed = stored as Partial<CloudGatewayConfig>;
      if (parsed.mode === "remote" && typeof parsed.baseUrl === "string") {
        currentGatewayConfig = {
          mode: "remote",
          baseUrl: parsed.baseUrl,
          token: typeof parsed.token === "string" ? parsed.token : undefined,
        };
        return getGatewayConfig();
      }
    }
    currentGatewayConfig = { ...DEFAULT_GATEWAY_CONFIG };
  } catch {
    // 读取失败不阻塞应用，回退本地模式
    currentGatewayConfig = { ...DEFAULT_GATEWAY_CONFIG };
  }
  return getGatewayConfig();
}

/** 持久化网关配置 */
export async function saveGatewayConfig(
  config: CloudGatewayConfig,
): Promise<boolean> {
  setGatewayConfig(config);
  try {
    return await setConfig(GATEWAY_CONFIG_KEY, getGatewayConfig());
  } catch {
    return false;
  }
}

/**
 * 解析 API 请求的 base URL（纯函数）。
 *
 * @param config 当前网关配置
 * @param localPort Electron 本地 API 服务器端口
 * @returns 请求前缀（不含 /api）
 */
export function resolveApiBaseUrl(
  config: CloudGatewayConfig,
  localPort: number,
): string {
  if (config.mode === "remote" && config.baseUrl) {
    return config.baseUrl.replace(/\/+$/, "");
  }
  return `http://localhost:${localPort}`;
}

/**
 * 为请求构建网关相关 headers（纯函数）。
 *
 * - remote 模式且配置了 token 时追加 `Authorization: Bearer <token>`
 * - local 模式不追加任何鉴权头（保持现状）
 *
 * @param config 当前网关配置
 * @param headers 现有请求头
 * @returns 合并后的请求头（不修改入参）
 */
export function buildGatewayHeaders(
  config: CloudGatewayConfig,
  headers: Record<string, string>,
): Record<string, string> {
  if (config.mode !== "remote" || !config.token) {
    return { ...headers };
  }
  return {
    ...headers,
    Authorization: `Bearer ${config.token}`,
  };
}
