/* eslint-disable no-restricted-imports */
export { loadConfig, saveConfig } from "@/infrastructure/ai-providers/api-config/storage";
export { checkConfigStatus, initConfig } from "@/infrastructure/ai-providers/api-config/init";
export { getAllTemplatesAsync, loadPluginTemplates } from "@/infrastructure/ai-providers/api-config/templates";
export { testConnection } from "@/infrastructure/ai-providers/multi-api";
export type { ProviderTemplate } from "@/infrastructure/ai-providers/api-config/templates";
