/* eslint-disable no-restricted-imports */
// 存储层
export { loadConfig, saveConfig, addProvider, removeProvider, setCapabilityMapping, getDefaultConfig } from "@/infrastructure/ai-providers/api-config/storage";
// 初始化层
export { checkConfigStatus, initConfig } from "@/infrastructure/ai-providers/api-config/init";
// 模板层
export { getAllTemplatesAsync, loadPluginTemplates, createProviderFromTemplate, getTemplateWithPlugins, getAllTemplates } from "@/infrastructure/ai-providers/api-config/templates";
// 检测层
export { loadPluginDetectionRules, detectAllProviders, validateApiKey } from "@/infrastructure/ai-providers/api-config/detect";
// 多 API 调用
export { testConnection } from "@/infrastructure/ai-providers/multi-api";

// 类型 re-export
export type { ProviderTemplate, PluginProviderTemplate } from "@/infrastructure/ai-providers/api-config/templates";
export type { ApiConfig, ApiCapability, ProviderConfig, ModelConfig } from "@/infrastructure/ai-providers/api-config/types";
export type { ConfigStatus } from "@/infrastructure/ai-providers/api-config/init";
export type { DetectResult, DetectAllResult } from "@/infrastructure/ai-providers/api-config/detect";
