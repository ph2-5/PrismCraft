export { loadConfig, saveConfig, getDefaultConfig, addProvider, removeProvider, setCapabilityMapping, type ApiConfig, type ApiCapability } from "./ai-providers/api-config";
export type { ProviderConfig, ModelConfig } from "./ai-providers/api-config/types";
export { PROVIDER_TEMPLATES, createProviderFromTemplate, getAllTemplates, getAllTemplatesAsync, loadPluginTemplates, ensurePluginTemplatesLoaded, isPluginTemplatesLoaded, getTemplateWithPlugins } from "./ai-providers/api-config/templates";
export type { PluginProviderTemplate } from "./ai-providers/api-config/templates";
export { detectProvider, detectAllProviders, validateApiKey, loadPluginDetectionRules } from "./ai-providers/api-config/detect";
export type { DetectResult, DetectAllResult } from "./ai-providers/api-config/detect";
export { checkConfigStatus, type ConfigStatus } from "./ai-providers/api-config/init";
