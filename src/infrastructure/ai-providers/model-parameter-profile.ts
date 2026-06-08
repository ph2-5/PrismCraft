import { errorLogger } from "@/shared/error-logger";
import { apiClient } from "@/infrastructure/api";
import { isElectron } from "@/shared/utils/platform";
import type { ModelParameterProfile, ModelCapabilities } from "./model-capabilities-types";

export let modelProfilesCache: Record<string, ModelParameterProfile> = {};

export function setModelProfiles(profiles: Record<string, ModelParameterProfile>): void {
  modelProfilesCache = profiles;
}

export function getModelParameterProfile(modelId: string): ModelParameterProfile | undefined {
  return modelProfilesCache[modelId];
}

export function getAllModelProfiles(): Record<string, ModelParameterProfile> {
  return modelProfilesCache;
}

interface ServerModelProfile {
  modelId: string;
  displayName?: string;
  providerId?: string;
  isUserPlugin?: boolean;
  isCodePlugin?: boolean;
  capabilities: ModelCapabilities;
  parameters: ModelParameterProfile["parameters"];
}

interface PluginsListData {
  modelProfiles?: Record<string, ServerModelProfile>;
  plugins?: Array<unknown>;
}

export async function loadModelProfilesFromServer(): Promise<void> {
  if (!isElectron()) return;

  try {
    const response = await apiClient.get<{ success?: boolean; data?: PluginsListData }>("/plugins/list");
    if (response.ok && response.value?.data?.modelProfiles) {
      const profiles = response.value.data.modelProfiles;
      const merged: Record<string, ModelParameterProfile> = { ...modelProfilesCache };
      for (const [modelId, profile] of Object.entries(profiles)) {
        merged[modelId] = {
          modelId: profile.modelId,
          displayName: profile.displayName,
          providerId: profile.providerId,
          isUserPlugin: profile.isUserPlugin,
          isCodePlugin: profile.isCodePlugin,
          capabilities: profile.capabilities,
          parameters: profile.parameters,
        };
      }
      setModelProfiles(merged);
    }
  } catch (e) {
    errorLogger.warn("[ModelCapabilities] 获取远程模型配置失败，使用内置配置", e);
  }
}
