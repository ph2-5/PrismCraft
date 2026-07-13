import { useState, useEffect, useRef, useCallback } from "react";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { errorLogger } from "@/shared/error-logger";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import { t } from "@/shared/constants";
import {
  type ApiConfig,
  type ApiCapability,
  type ProviderConfig,
  type ModelConfig,
  loadConfig,
  saveConfig,
  getDefaultConfig,
  detectAllProviders,
  validateApiKey,
  loadPluginDetectionRules,
  loadPluginTemplates,
  checkConfigStatus,
  type ConfigStatus,
} from "@/shared/api-config";
import { loadModelProfilesFromServer } from "@/shared/model-capabilities";
import { useInvalidateModelCapabilities } from "@/shared/hooks/use-model-capabilities";
import { useInvalidateProviderTemplates } from "@/shared/hooks/use-provider-templates";
import {
  addProviderAction,
  removeProviderAction,
  updateProviderAction,
  addCustomModelAction,
  updateModelAction,
  removeModelAction,
  updateProviderModelsAction,
  setMappingAction,
  testCapabilityAction,
  testAllConnectionsAction,
  saveConfigAction,
} from "./apiConfigActions";

interface ApiCapabilityMeta {
  id: ApiCapability;
  name: string;
  icon: React.ReactNode;
}

export function useApiConfigHandlers(capabilities: ApiCapabilityMeta[]) {
  const { error: showError, success: showSuccess } = useToastHelpers();
  const invalidateModelCapabilities = useInvalidateModelCapabilities();
  const invalidateProviderTemplates = useInvalidateProviderTemplates();

  const [config, setConfig] = useState<ApiConfig>(getDefaultConfig());
  const [status, setStatus] = useState<ConfigStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newProviderKey, setNewProviderKey] = useState("");
  const [newProviderName, setNewProviderName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const [enableCustomBaseUrl, setEnableCustomBaseUrl] = useState(false);
  const [customBaseUrl, setCustomBaseUrl] = useState("");

  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [useCustomVision, setUseCustomVision] = useState(false);

  const saveConfigDebounced = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestConfigRef = useRef<ApiConfig | null>(null);
  latestConfigRef.current = config;

  const refreshPluginCaches = useCallback(async () => {
    await Promise.allSettled([
      loadPluginDetectionRules(),
      loadPluginTemplates(),
      loadModelProfilesFromServer(),
    ]);
    await Promise.allSettled([
      invalidateModelCapabilities(),
      invalidateProviderTemplates(),
    ]);
  }, [invalidateModelCapabilities, invalidateProviderTemplates]);

  useInitConfig({
    setConfig,
    setStatus,
    setIsLoading,
  });

  useEffect(() => {
    return () => {
      if (saveConfigDebounced.current) {
        clearTimeout(saveConfigDebounced.current);
        saveConfigDebounced.current = null;
        // 卸载时若有未完成的 debounce 保存，立即执行最后一次保存（不显示 toast 避免卸载后 setState 警告）
        const pendingConfig = latestConfigRef.current;
        if (pendingConfig) {
          saveConfig(pendingConfig).catch((e) => {
            errorLogger.warn("[ApiConfig] 卸载时 flush 保存失败", e);
          });
        }
      }
    };
  }, []);

  const detectedAll = newProviderKey ? detectAllProviders(newProviderKey) : null;
  const detectedInfo = detectedAll?.recommended ?? null;
  const hasMultipleSources =
    (detectedAll?.builtinMatches.length ?? 0) > 0 &&
    (detectedAll?.pluginMatches.length ?? 0) > 0;
  const keyValidation = newProviderKey
    ? validateApiKey(newProviderKey)
    : { valid: false };

  const providerHandlers = useProviderHandlers({
    config,
    setConfig,
    setStatus,
    newProviderKey,
    newProviderName,
    selectedTemplate,
    enableCustomBaseUrl,
    customBaseUrl,
    detectedInfo,
    keyValidation,
    expandedProvider,
    showError,
    showSuccess,
    refreshPluginCaches,
    setIsAdding,
    setNewProviderKey,
    setNewProviderName,
    setSelectedTemplate,
    setEnableCustomBaseUrl,
    setCustomBaseUrl,
    setShowAddForm,
    setExpandedProvider,
    saveConfigDebounced,
  });

  const handleSetMapping = async (
    capability: ApiCapability,
    value: string | null | undefined,
  ) => {
    const updatedConfig = await setMappingAction({
      config,
      capability,
      value,
      capabilities,
      showSuccess,
    });
    setConfig(updatedConfig);
    setStatus(await checkConfigStatus());
  };

  const testHandlers = useTestHandlers({
    config,
    capabilities,
  });

  const handleSaveConfig = useCallback(async () => {
    await saveConfigAction({ config, showError, showSuccess });
    setStatus(await checkConfigStatus());
  }, [config, showError, showSuccess]);

  return {
    state: {
      config,
      status,
      isLoading,
      showAddForm,
      newProviderKey,
      newProviderName,
      selectedTemplate,
      isAdding,
      enableCustomBaseUrl,
      customBaseUrl,
      expandedProvider,
      useCustomVision,
      testResults: testHandlers.testResults,
      testingCapability: testHandlers.testingCapability,
      detectedAll,
      detectedInfo,
      hasMultipleSources,
      keyValidation,
    },
    setters: {
      setShowAddForm,
      setNewProviderKey,
      setNewProviderName,
      setSelectedTemplate,
      setEnableCustomBaseUrl,
      setCustomBaseUrl,
      setExpandedProvider,
      setUseCustomVision,
    },
    handlers: {
      handleAddProvider: providerHandlers.handleAddProvider,
      handleRemoveProvider: providerHandlers.handleRemoveProvider,
      handleUpdateProvider: providerHandlers.handleUpdateProvider,
      handleAddCustomModel: providerHandlers.handleAddCustomModel,
      handleUpdateModel: providerHandlers.handleUpdateModel,
      handleRemoveModel: providerHandlers.handleRemoveModel,
      handleUpdateProviderModels: providerHandlers.handleUpdateProviderModels,
      handleSetMapping,
      handleTestCapability: testHandlers.handleTestCapability,
      handleTestAllConnections: testHandlers.handleTestAllConnections,
      handleSaveConfig,
    },
  };
}

interface InitConfigArgs {
  setConfig: React.Dispatch<React.SetStateAction<ApiConfig>>;
  setStatus: React.Dispatch<React.SetStateAction<ConfigStatus | null>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
}

function useInitConfig({ setConfig, setStatus, setIsLoading }: InitConfigArgs) {
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        await loadPluginDetectionRules();
        await loadPluginTemplates();
        const loaded = await loadConfig();
        if (!cancelled) {
          setConfig(loaded);
          setStatus(await checkConfigStatus());
        }
      } catch (e) {
        if (!cancelled) errorLogger.error("[Settings] 初始化失败:", e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    init();
    return () => { cancelled = true; };
  }, []);
}

interface ProviderHandlersArgs {
  config: ApiConfig;
  setConfig: React.Dispatch<React.SetStateAction<ApiConfig>>;
  setStatus: React.Dispatch<React.SetStateAction<ConfigStatus | null>>;
  newProviderKey: string;
  newProviderName: string;
  selectedTemplate: string;
  enableCustomBaseUrl: boolean;
  customBaseUrl: string;
  detectedInfo: { templateId?: string; suggestedName?: string } | null;
  keyValidation: { valid: boolean };
  expandedProvider: string | null;
  showError: (msg: string, title?: string) => void;
  showSuccess: (msg: string, title?: string) => void;
  refreshPluginCaches: () => Promise<void>;
  setIsAdding: React.Dispatch<React.SetStateAction<boolean>>;
  setNewProviderKey: React.Dispatch<React.SetStateAction<string>>;
  setNewProviderName: React.Dispatch<React.SetStateAction<string>>;
  setSelectedTemplate: React.Dispatch<React.SetStateAction<string>>;
  setEnableCustomBaseUrl: React.Dispatch<React.SetStateAction<boolean>>;
  setCustomBaseUrl: React.Dispatch<React.SetStateAction<string>>;
  setShowAddForm: React.Dispatch<React.SetStateAction<boolean>>;
  setExpandedProvider: React.Dispatch<React.SetStateAction<string | null>>;
  saveConfigDebounced: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
}

function useProviderHandlers({
  config,
  setConfig,
  setStatus,
  newProviderKey,
  newProviderName,
  selectedTemplate,
  enableCustomBaseUrl,
  customBaseUrl,
  detectedInfo,
  keyValidation,
  expandedProvider,
  showError,
  showSuccess,
  refreshPluginCaches,
  setIsAdding,
  setNewProviderKey,
  setNewProviderName,
  setSelectedTemplate,
  setEnableCustomBaseUrl,
  setCustomBaseUrl,
  setShowAddForm,
  setExpandedProvider,
  saveConfigDebounced,
}: ProviderHandlersArgs) {
  const handleAddProvider = async () => {
    if (!keyValidation.valid) return;
    setIsAdding(true);
    try {
      const result = await addProviderAction({
        config,
        newProviderKey,
        newProviderName,
        selectedTemplate,
        enableCustomBaseUrl,
        customBaseUrl,
        detectedInfo,
        showError,
        showSuccess,
        onRefreshCaches: refreshPluginCaches,
      });
      if (!result.config) return;
      setConfig(result.config);
      setStatus(await checkConfigStatus());
      setNewProviderKey("");
      setNewProviderName("");
      setSelectedTemplate("");
      setEnableCustomBaseUrl(false);
      setCustomBaseUrl("");
      setShowAddForm(false);
    } catch (e) {
      showError(t("provider.addFailed"), mapUserFacingError(e));
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveProvider = async (providerId: string) => {
    const result = await removeProviderAction({
      config,
      providerId,
      expandedProvider,
      showSuccess,
      onRefreshCaches: refreshPluginCaches,
    });
    if (!result) return;
    setConfig(result.config);
    setStatus(await checkConfigStatus());
    setExpandedProvider(result.expandedProvider);
  };

  const handleUpdateProvider = async (
    providerId: string,
    updates: Partial<ProviderConfig>,
  ) => {
    const updatedConfig = updateProviderAction(config, providerId, updates);
    setConfig(updatedConfig);
    if (saveConfigDebounced.current) clearTimeout(saveConfigDebounced.current);
    saveConfigDebounced.current = setTimeout(async () => {
      try {
        await saveConfig(updatedConfig);
        setStatus(await checkConfigStatus());
      } catch (e) {
        showError(t("error.saveFailed"), mapUserFacingError(e));
      }
    }, 500);
  };

  const modelHandlers = useModelHandlers({
    config,
    setConfig,
    onUpdateProvider: handleUpdateProvider,
  });

  return {
    handleAddProvider,
    handleRemoveProvider,
    handleUpdateProvider,
    handleAddCustomModel: modelHandlers.handleAddCustomModel,
    handleUpdateModel: modelHandlers.handleUpdateModel,
    handleRemoveModel: modelHandlers.handleRemoveModel,
    handleUpdateProviderModels: modelHandlers.handleUpdateProviderModels,
  };
}

interface ModelHandlersArgs {
  config: ApiConfig;
  setConfig: React.Dispatch<React.SetStateAction<ApiConfig>>;
  onUpdateProvider: (
    providerId: string,
    updates: Partial<ProviderConfig>,
  ) => Promise<void>;
}

function useModelHandlers({
  config,
  setConfig,
  onUpdateProvider,
}: ModelHandlersArgs) {
  const applyModelUpdate = (updated: ApiConfig | null, providerId: string) => {
    if (!updated) return;
    setConfig(updated);
    onUpdateProvider(providerId, {
      models: updated.providers.find((p) => p.id === providerId)?.models,
    });
  };

  const handleAddCustomModel = async (providerId: string) => {
    applyModelUpdate(addCustomModelAction(config, providerId), providerId);
  };

  const handleUpdateModel = (
    providerId: string,
    modelIndex: number,
    updates: Partial<ModelConfig>,
  ) => {
    applyModelUpdate(
      updateModelAction(config, providerId, modelIndex, updates),
      providerId,
    );
  };

  const handleRemoveModel = (providerId: string, modelIndex: number) => {
    applyModelUpdate(removeModelAction(config, providerId, modelIndex), providerId);
  };

  const handleUpdateProviderModels = (providerId: string) => {
    applyModelUpdate(updateProviderModelsAction(config, providerId), providerId);
  };

  return {
    handleAddCustomModel,
    handleUpdateModel,
    handleRemoveModel,
    handleUpdateProviderModels,
  };
}

interface TestHandlersArgs {
  config: ApiConfig;
  capabilities: ApiCapabilityMeta[];
}

function useTestHandlers({ config, capabilities }: TestHandlersArgs) {
  const [testResults, setTestResults] = useState<
    Record<string, { success: boolean; message: string }>
  >({});
  const [testingCapability, setTestingCapability] =
    useState<ApiCapability | null>(null);

  const handleTestCapability = useCallback(
    async (capability: ApiCapability) => {
      setTestingCapability(capability);
      try {
        const { result } = await testCapabilityAction({
          capability,
          mappingValue: config.mapping[capability],
        });
        setTestResults((prev) => ({ ...prev, [capability]: result }));
      } finally {
        setTestingCapability(null);
      }
    },
    [config.mapping],
  );

  const handleTestAllConnections = useCallback(async () => {
    setTestingCapability("all" as ApiCapability);
    try {
      const newResults = await testAllConnectionsAction({
        config,
        capabilities,
      });
      setTestResults((prev) => ({ ...prev, ...newResults }));
    } finally {
      setTestingCapability(null);
    }
  }, [config, capabilities]);

  return {
    testResults,
    testingCapability,
    handleTestCapability,
    handleTestAllConnections,
  };
}
