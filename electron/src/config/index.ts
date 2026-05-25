/**
 * config/index.ts
 *
 * 配置模块 - 统一导出
 */

export { configManager, maskApiKey } from "./config-manager";
export type {
  AppConfig,
  ProviderConfig,
  ConfigManagerOptions,
  ConfigChangeListener,
} from "./config-manager";
