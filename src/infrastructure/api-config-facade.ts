export { loadConfig, saveConfig, getDefaultConfig, addProvider, removeProvider, setCapabilityMapping, type ApiConfig, type ApiCapability } from "./ai-providers/api-config";
export type { ProviderConfig, ModelConfig } from "./ai-providers/api-config/types";
export { PROVIDER_TEMPLATES, createProviderFromTemplate, getAllTemplates, loadPluginTemplates, getTemplateWithPlugins } from "./ai-providers/api-config/templates";
export type { PluginProviderTemplate } from "./ai-providers/api-config/templates";
export { detectProvider, validateApiKey, loadPluginDetectionRules } from "./ai-providers/api-config/detect";
export { checkConfigStatus, type ConfigStatus } from "./ai-providers/api-config/init";
