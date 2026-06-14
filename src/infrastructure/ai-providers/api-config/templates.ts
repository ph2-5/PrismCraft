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

interface PluginsListResponse {
  success: boolean;
  data?: {
    plugins: PluginListItem[];
    modelProfiles?: Record<string, { modelId: string; displayName?: string; capabilities?: Record<string, unknown>; parameters?: Record<string, unknown>; providerId?: string }>;
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
      const baseUrl = `http://localhost:${API_SERVER_PORT}`;
      const response = await fetch(`${baseUrl}/api/plugins/list`, {
        headers: { ...ELECTRON_APP_HEADERS, "Content-Type": "application/json" },
      });

      if (!response.ok) {
        pluginTemplatesLoaded = false;
        pluginTemplatesLoading = null;
        return;
      }

      const result: PluginsListResponse = await response.json();
      if (!result.success || !result.data?.plugins) {
        pluginTemplatesLoaded = false;
        pluginTemplatesLoading = null;
        return;
      }

      const newTemplates: Record<string, PluginProviderTemplate> = {};

      for (const plugin of result.data.plugins) {
        const templateId = plugin.id;
        const baseUrlFromDetection = plugin.apiKeyDetection?.baseUrl ?? "";
        const format = resolveFormat(plugin.id);

        const builtinTemplate = PROVIDER_TEMPLATES[templateId];
        const models: ModelConfig[] = [];

        if (builtinTemplate) {
          for (const m of builtinTemplate.models) {
            models.push({ ...m });
          }
        }

        if (plugin.videoCapabilities?.defaultModel) {
          const defaultModel = plugin.videoCapabilities.defaultModel;
          if (!models.some((m) => m.id === defaultModel)) {
            const defaultProfile = result.data.modelProfiles?.[defaultModel];
            models.push({
              id: defaultModel,
              name: defaultProfile?.displayName ?? defaultModel,
              capabilities: ["video"],
              defaultParams: { duration: plugin.videoCapabilities.maxDuration ?? 5 },
            });
          }
        }

        if (plugin.imageCapabilities?.defaultModel) {
          const defaultModel = plugin.imageCapabilities.defaultModel;
          if (!models.some((m) => m.id === defaultModel)) {
            const defaultProfile = result.data.modelProfiles?.[defaultModel];
            models.push({
              id: defaultModel,
              name: defaultProfile?.displayName ?? defaultModel,
              capabilities: ["image"],
              defaultParams: {},
            });
          }
        }

        if (result.data.modelProfiles) {
          const pluginProfiles = Object.values(result.data.modelProfiles).filter(
            (p) => p.providerId === plugin.id,
          );
          for (const profile of pluginProfiles) {
            if (models.some((m) => m.id === profile.modelId)) continue;
            const caps: string[] = [];
            if (profile.parameters) {
              if ("durations" in profile.parameters) caps.push("video");
              if ("resolutions" in profile.parameters && !caps.includes("video")) caps.push("image");
            }
            if (caps.length === 0) caps.push("video");
            models.push({
              id: profile.modelId,
              name: profile.displayName ?? profile.modelId,
              capabilities: caps as ModelConfig["capabilities"],
              defaultParams: {},
            });
          }
        }

        const isDeprecated = plugin.id === "openai-sora";
        newTemplates[templateId] = {
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

      pluginTemplates = newTemplates;
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
    models: template.models.map((m) => JSON.parse(JSON.stringify(m))),
    isCustom: false,
  };
}
