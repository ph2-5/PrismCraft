import { t } from "@/shared/constants";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import { confirm } from "@/shared/utils/confirm";
import {
  type ApiConfig,
  type ApiCapability,
  type ProviderConfig,
  type ModelConfig,
  addProvider,
  removeProvider,
  setCapabilityMapping,
  createProviderFromTemplate,
  getTemplateWithPlugins,
  checkConfigStatus,
} from "@/infrastructure/api-config-facade";
import { saveConfig } from "@/infrastructure/api-config-facade";
import { testConnection } from "@/infrastructure/ai-providers";

interface ApiCapabilityMeta {
  id: ApiCapability;
  name: string;
  icon: React.ReactNode;
}

export async function addProviderAction(args: {
  config: ApiConfig;
  newProviderKey: string;
  newProviderName: string;
  selectedTemplate: string;
  enableCustomBaseUrl: boolean;
  customBaseUrl: string;
  detectedInfo: { templateId?: string; suggestedName?: string } | null;
  showError: (msg: string, title?: string) => void;
  showSuccess: (msg: string, title?: string) => void;
  onRefreshCaches: () => Promise<void>;
}): Promise<{
  config: ApiConfig | null;
  resetFields: Record<string, unknown>;
}> {
  const {
    config,
    newProviderKey,
    newProviderName,
    selectedTemplate,
    enableCustomBaseUrl,
    customBaseUrl,
    detectedInfo,
    showError,
    showSuccess,
    onRefreshCaches,
  } = args;

  const templateId =
    detectedInfo?.templateId || selectedTemplate || "openai";
  const providerName =
    newProviderName ||
    detectedInfo?.suggestedName ||
    `${templateId}-${Date.now()}`;

  const newProvider = createProviderFromTemplate(templateId, newProviderKey);
  if (!newProvider) {
    showError(t("error.createFailed"), t("provider.createFailed"));
    return { config: null, resetFields: {} };
  }

  newProvider.name = providerName;
  if (enableCustomBaseUrl && customBaseUrl.trim()) {
    newProvider.baseUrl = customBaseUrl.trim();
  }

  const updatedConfig = addProvider(config, newProvider);
  await saveConfig(updatedConfig);
  await checkConfigStatus();

  showSuccess(
    t("success.added"),
    t("provider.addedWithName", { name: providerName }),
  );
  onRefreshCaches();

  return {
    config: updatedConfig,
    resetFields: {
      newProviderKey: "",
      newProviderName: "",
      selectedTemplate: "",
      enableCustomBaseUrl: false,
      customBaseUrl: "",
      showAddForm: false,
    },
  };
}

export async function removeProviderAction(args: {
  config: ApiConfig;
  providerId: string;
  expandedProvider: string | null;
  showSuccess: (msg: string, title?: string) => void;
  onRefreshCaches: () => Promise<void>;
}): Promise<{
  config: ApiConfig;
  expandedProvider: string | null;
} | null> {
  const { config, providerId, expandedProvider, showSuccess, onRefreshCaches } = args;
  const provider = config.providers.find((p) => p.id === providerId);
  if (!provider) return null;

  const hasActiveTasks = provider.models?.some((m) =>
    m.capabilities?.includes("video"),
  );
  const warningSuffix = hasActiveTasks ? t("provider.videoModelWarning") : "";
  if (
    !(await confirm(
      t("provider.deleteConfirm", {
        name: provider.name,
        suffix: warningSuffix,
      }),
      t("provider.deleteConfirmTitle"),
    ))
  )
    return null;

  const updatedConfig = removeProvider(config, providerId);
  await saveConfig(updatedConfig);
  await checkConfigStatus();
  showSuccess(
    t("success.deleted"),
    t("provider.deletedWithName", { name: provider.name }),
  );
  onRefreshCaches();

  return {
    config: updatedConfig,
    expandedProvider:
      expandedProvider === providerId ? null : expandedProvider,
  };
}

export function updateProviderAction(
  config: ApiConfig,
  providerId: string,
  updates: Partial<ProviderConfig>,
): ApiConfig {
  return {
    ...config,
    providers: config.providers.map((p) =>
      p.id === providerId ? { ...p, ...updates } : p,
    ),
  };
}

export function addCustomModelAction(
  config: ApiConfig,
  providerId: string,
): ApiConfig | null {
  const provider = config.providers.find((p) => p.id === providerId);
  if (!provider) return null;
  const newModel = {
    id: "user-model-" + Date.now(),
    name: t("provider.userModel"),
    capabilities: ["text"] as ApiCapability[],
    defaultParams: { maxTokens: 4096, temperature: 0.7 },
  };
  return updateProviderAction(config, providerId, {
    models: [...provider.models, newModel],
  });
}

export function updateModelAction(
  config: ApiConfig,
  providerId: string,
  modelIndex: number,
  updates: Partial<ModelConfig>,
): ApiConfig | null {
  const provider = config.providers.find((p) => p.id === providerId);
  if (!provider) return null;
  const updatedModels = [...provider.models];
  updatedModels[modelIndex] = { ...updatedModels[modelIndex]!, ...updates };
  return updateProviderAction(config, providerId, { models: updatedModels });
}

export function removeModelAction(
  config: ApiConfig,
  providerId: string,
  modelIndex: number,
): ApiConfig | null {
  const provider = config.providers.find((p) => p.id === providerId);
  if (!provider) return null;
  const updatedModels = provider.models.filter(
    (_, index) => index !== modelIndex,
  );
  return updateProviderAction(config, providerId, { models: updatedModels });
}

export function updateProviderModelsAction(
  config: ApiConfig,
  providerId: string,
): ApiConfig | null {
  const provider = config.providers.find((p) => p.id === providerId);
  if (!provider || !provider.templateId) return null;
  const template = getTemplateWithPlugins(provider.templateId);
  if (!template) return null;
  return updateProviderAction(config, providerId, { models: template.models });
}

export async function setMappingAction(args: {
  config: ApiConfig;
  capability: ApiCapability;
  value: string | null | undefined;
  capabilities: ApiCapabilityMeta[];
  showSuccess: (msg: string, title?: string) => void;
}): Promise<ApiConfig> {
  const { config, capability, value, capabilities, showSuccess } = args;
  const updatedConfig = setCapabilityMapping(
    config,
    capability,
    value === "_none" ? undefined : value || undefined,
  );
  await saveConfig(updatedConfig);
  await checkConfigStatus();
  const capName =
    capabilities.find((c) => c.id === capability)?.name || capability;
  showSuccess(
    t("success.saved"),
    t("provider.capabilityMappingUpdated", { name: capName }),
  );
  return updatedConfig;
}

interface TestConnectionResult {
  success: boolean;
  message: string;
}

function resolveMappingIds(
  mappingValue: string | undefined,
): { providerId?: string; modelId?: string } {
  if (!mappingValue) return {};
  const lastSlashIndex = mappingValue.lastIndexOf("/");
  if (lastSlashIndex === -1) return {};
  return {
    providerId: mappingValue.substring(0, lastSlashIndex),
    modelId: mappingValue.substring(lastSlashIndex + 1),
  };
}

export async function testCapabilityAction(args: {
  capability: ApiCapability;
  mappingValue: string | undefined;
}): Promise<{ capability: ApiCapability; result: TestConnectionResult }> {
  const { capability, mappingValue } = args;
  const { providerId, modelId } = resolveMappingIds(mappingValue);
  try {
    const result = await testConnection(capability, providerId, modelId);
    return {
      capability,
      result: {
        success: result.success,
        message: result.success ? t("connection.success") : result.message,
      },
    };
  } catch (error) {
    return {
      capability,
      result: {
        success: false,
        message: t("connection.testFailed", {
          message: (error as Error).message,
        }),
      },
    };
  }
}

export async function testAllConnectionsAction(args: {
  config: ApiConfig;
  capabilities: ApiCapabilityMeta[];
}): Promise<Record<string, TestConnectionResult>> {
  const { config, capabilities } = args;
  const configuredCaps = capabilities.filter((cap) => config.mapping[cap.id]);

  const settled = await Promise.allSettled(
    configuredCaps.map(async (cap) => {
      const { providerId, modelId } = resolveMappingIds(
        config.mapping[cap.id],
      );
      const result = await testConnection(cap.id, providerId, modelId);
      return { cap: cap.id, result };
    }),
  );

  const newResults: Record<string, TestConnectionResult> = {};
  for (const [index, status] of settled.entries()) {
    const cap = configuredCaps[index];
    if (!cap) continue;
    if (status.status === "fulfilled") {
      const { result } = status.value;
      newResults[cap.id] = {
        success: result.success,
        message: result.success ? t("connection.success") : result.message,
      };
    } else {
      newResults[cap.id] = {
        success: false,
        message: t("connection.testFailed", {
          message: (status.reason as Error)?.message ?? "",
        }),
      };
    }
  }
  return newResults;
}

export async function saveConfigAction(args: {
  config: ApiConfig;
  showError: (msg: string, title?: string) => void;
  showSuccess: (msg: string, title?: string) => void;
}): Promise<void> {
  const { config, showError, showSuccess } = args;
  try {
    await saveConfig(config);
    await checkConfigStatus();
    showSuccess(t("success.saved"), t("success.saved"));
  } catch (e) {
    showError(t("error.saveFailed"), mapUserFacingError(e));
  }
}
