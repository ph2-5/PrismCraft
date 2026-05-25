export { loadConfig, saveConfig, getDefaultConfig, addProvider, removeProvider, setCapabilityMapping, type ApiConfig, type ApiCapability } from "./ai-providers/api-config";
export type { ProviderConfig, ModelConfig } from "./ai-providers/api-config/types";
export { PROVIDER_TEMPLATES, createProviderFromTemplate, getTemplateList } from "./ai-providers/api-config/templates";
export { detectProvider, validateApiKey } from "./ai-providers/api-config/detect";
export { checkConfigStatus, type ConfigStatus } from "./ai-providers/api-config/init";

