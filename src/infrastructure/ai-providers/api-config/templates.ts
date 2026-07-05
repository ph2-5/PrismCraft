import { type ProviderConfig, type ApiFormat, type ModelConfig } from "./types";
import { isElectron } from "@/shared/utils/platform";
import { API_SERVER_PORT, ELECTRON_APP_HEADERS } from "@/config/constants";
import { errorLogger } from "@/shared/error-logger";
import { PROVIDER_TEMPLATES, type ProviderTemplate } from "./provider-templates-data";

export type { ProviderTemplate } from "./provider-templates-data";
export { PROVIDER_TEMPLATES } from "./provider-templates-data";

export interface PluginProviderTemplate extends ProviderTemplate {
  pluginId: string;
  isUserPlugin: boolean;
  isCodePlugin: boolean;
  deprecated?: boolean;
  deprecatedReason?: string;
}

const FORMAT_MAP: Record<string, ApiFormat> = {
  volcengine: "openai",
  zhipu: "zhipu",
  seedance: "seedance",
  kuaishou: "kuaishou",
  pixverse: "pixverse",
  anthropic: "anthropic",
  google: "google",
};

function resolveFormat(pluginId: string): ApiFormat {
  return FORMAT_MAP[pluginId] ?? "openai";
}

interface PluginListItem {
  id: string;
  displayName: string;
  isUserPlugin: boolean;
  capabilities?: { video: boolean; image: boolean; text: boolean; vision: boolean };
  videoCapabilities?: { defaultModel?: string; maxDuration?: number; supportsLastFrame?: boolean };
  imageCapabilities?: { defaultModel?: string };
  modelProfiles?: Array<{
    modelId: string;
    displayName?: string;
    capabilities?: Record<string, unknown>;
    parameters?: Record<string, unknown>;
  }>;
  apiKeyDetection?: { baseUrl?: string };
}

interface PluginModelProfile {
  modelId: string;
  displayName?: string;
  capabilities?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
  providerId?: string;
}

interface PluginsListResponse {
  success: boolean;
  data?: {
    plugins: PluginListItem[];
    modelProfiles?: Record<string, PluginModelProfile>;
  };
}

let pluginTemplates: Record<string, PluginProviderTemplate> = {};
let pluginTemplatesLoaded = false;
let pluginTemplatesLoading: Promise<void> | null = null;

export function isPluginTemplatesLoaded(): boolean {
  return pluginTemplatesLoaded;
}

export function getPluginTemplates(): Record<string, PluginProviderTemplate> {
  return pluginTemplates;
}

export async function ensurePluginTemplatesLoaded(): Promise<void> {
  if (pluginTemplatesLoaded) return;
  if (pluginTemplatesLoading) {
    await pluginTemplatesLoading;
    return;
  }
  await loadPluginTemplates();
}

export async function getAllTemplatesAsync(): Promise<Record<string, ProviderTemplate>> {
  await ensurePluginTemplatesLoaded();
  return getAllTemplates();
}

export async function loadPluginTemplates(): Promise<void> {
  if (!isElectron()) {
    pluginTemplatesLoaded = true;
    return;
  }

  if (pluginTemplatesLoading) {
    await pluginTemplatesLoading;
    return;
  }

  const loadPromise = (async () => {
    try {
      const result = await fetchPluginsListResponse();
      if (!result) {
        pluginTemplatesLoaded = false;
        pluginTemplatesLoading = null;
        return;
      }

      pluginTemplates = buildPluginTemplates(result);
      pluginTemplatesLoaded = true;
    } catch (e) {
      errorLogger.warn("[Templates] 加载插件模板失败", e);
      pluginTemplatesLoaded = false;
      pluginTemplatesLoading = null;
    }
  })();

  pluginTemplatesLoading = loadPromise;

  try {
    await loadPromise;
  } finally {
    if (pluginTemplatesLoading === loadPromise) {
      pluginTemplatesLoading = null;
    }
  }
}

async function fetchPluginsListResponse(): Promise<PluginsListResponse | null> {
  const baseUrl = `http://localhost:${API_SERVER_PORT}`;
  const response = await fetch(`${baseUrl}/api/plugins/list`, {
    headers: { ...ELECTRON_APP_HEADERS, "Content-Type": "application/json" },
  });

  if (!response.ok) return null;

  const result: PluginsListResponse = await response.json();
  if (!result.success || !result.data?.plugins) return null;

  return result;
}

function collectBuiltinModels(builtinTemplate: ProviderTemplate | undefined): ModelConfig[] {
  if (!builtinTemplate) return [];
  return builtinTemplate.models.map((m) => ({ ...m }));
}

function ensureModelExists(
  models: ModelConfig[],
  modelId: string,
  displayName: string | undefined,
  capabilities: ModelConfig["capabilities"],
  defaultParams: ModelConfig["defaultParams"],
): void {
  if (models.some((m) => m.id === modelId)) return;
  models.push({
    id: modelId,
    name: displayName ?? modelId,
    capabilities,
    defaultParams,
  });
}

function collectProfileModels(
  models: ModelConfig[],
  plugin: PluginListItem,
  modelProfiles?: Record<string, PluginModelProfile>,
): void {
  if (!modelProfiles) return;
  const pluginProfiles = Object.values(modelProfiles).filter(
    (p) => p.providerId === plugin.id,
  );
  for (const profile of pluginProfiles) {
    if (models.some((m) => m.id === profile.modelId)) continue;
    const caps = resolveProfileCapabilities(profile.parameters);
    models.push({
      id: profile.modelId,
      name: profile.displayName ?? profile.modelId,
      capabilities: caps,
      defaultParams: {},
    });
  }
}

function resolveProfileCapabilities(parameters?: Record<string, unknown>): ModelConfig["capabilities"] {
  const caps: string[] = [];
  if (parameters) {
    if ("durations" in parameters) caps.push("video");
    if ("resolutions" in parameters && !caps.includes("video")) caps.push("image");
  }
  if (caps.length === 0) caps.push("video");
  return caps as ModelConfig["capabilities"];
}

function buildPluginTemplate(
  plugin: PluginListItem,
  models: ModelConfig[],
): PluginProviderTemplate {
  const baseUrlFromDetection = plugin.apiKeyDetection?.baseUrl ?? "";
  const format = resolveFormat(plugin.id);
  const isDeprecated = plugin.id === "openai-sora";

  return {
    name: plugin.displayName,
    format,
    baseUrl: baseUrlFromDetection,
    models,
    pluginId: plugin.id,
    isUserPlugin: plugin.isUserPlugin,
    isCodePlugin: false,
    deprecated: isDeprecated,
    deprecatedReason: isDeprecated ? "Sora API 已于 2026年3月24日关停" : undefined,
  };
}

function buildPluginTemplates(result: PluginsListResponse): Record<string, PluginProviderTemplate> {
  const newTemplates: Record<string, PluginProviderTemplate> = {};
  const modelProfiles = result.data?.modelProfiles;

  for (const plugin of result.data!.plugins) {
    const templateId = plugin.id;
    const builtinTemplate = PROVIDER_TEMPLATES[templateId];
    const models = collectBuiltinModels(builtinTemplate);

    if (plugin.videoCapabilities?.defaultModel) {
      const defaultModel = plugin.videoCapabilities.defaultModel;
      const defaultProfile = modelProfiles?.[defaultModel];
      ensureModelExists(
        models,
        defaultModel,
        defaultProfile?.displayName,
        ["video"],
        { duration: plugin.videoCapabilities.maxDuration ?? 5 },
      );
    }

    if (plugin.imageCapabilities?.defaultModel) {
      const defaultModel = plugin.imageCapabilities.defaultModel;
      const defaultProfile = modelProfiles?.[defaultModel];
      ensureModelExists(
        models,
        defaultModel,
        defaultProfile?.displayName,
        ["image"],
        {},
      );
    }

    collectProfileModels(models, plugin, modelProfiles);

    newTemplates[templateId] = buildPluginTemplate(plugin, models);
  }

  return newTemplates;
}

export function getAllTemplates(): Record<string, ProviderTemplate> {
  const all: Record<string, ProviderTemplate> = { ...PROVIDER_TEMPLATES, ...pluginTemplates };
  for (const [key, tmpl] of Object.entries(all)) {
    if ((tmpl as PluginProviderTemplate).deprecated) {
      delete all[key];
    }
  }
  return all;
}

export function getTemplateWithPlugins(id: string): ProviderTemplate | PluginProviderTemplate | undefined {
  if (pluginTemplates[id]) return pluginTemplates[id];
  return PROVIDER_TEMPLATES[id];
}

export function createProviderFromTemplate(
  templateId: string,
  apiKey: string,
  customId?: string,
): ProviderConfig | null {
  const template = getTemplateWithPlugins(templateId);
  if (!template) return null;

  return {
    id: customId || `${templateId}-${Date.now()}`,
    templateId,
    name: template.name,
    format: template.format,
    baseUrl: template.baseUrl,
    apiKey,
    models: template.models.map((m) => structuredClone(m)),
    isCustom: false,
  };
}
