import { useState, useEffect, useRef, useCallback } from "react";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { errorLogger } from "@/shared/error-logger";
import { t } from "@/shared/constants";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import {
  Plus,
  CheckCircle,
  XCircle,
  Loader2,
  Key,
  Bot,
  Image as ImageIcon,
  Video,
  Eye,
} from "lucide-react";
import PluginManager from "./plugin-manager";
import { confirm } from "@/shared/utils/confirm";
import {
  type ApiConfig,
  type ApiCapability,
  loadConfig,
  saveConfig,
  getDefaultConfig,
  addProvider,
  removeProvider,
  setCapabilityMapping,
  type ProviderConfig,
  type ModelConfig,
  createProviderFromTemplate,
  detectProvider,
  validateApiKey,
  loadPluginDetectionRules,
  loadPluginTemplates,
  getTemplateWithPlugins,
  checkConfigStatus,
  type ConfigStatus,
} from "@/infrastructure/api-config-facade";
import { testConnection } from "@/infrastructure/ai-providers";
import { loadModelProfilesFromServer } from "@/shared/model-capabilities";
import { ProviderCard } from "./ProviderCard";
import { ProviderForm } from "./ProviderForm";
import { ModelMappingSection } from "./ModelMappingSection";

const capabilities: {
  id: ApiCapability;
  name: string;
  icon: React.ReactNode;
}[] = [
  { id: "text", name: t("capability.text"), icon: <Bot className="w-4 h-4" /> },
  { id: "image", name: t("capability.image"), icon: <ImageIcon className="w-4 h-4" /> },
  { id: "vision", name: t("capability.vision"), icon: <Eye className="w-4 h-4" /> },
  { id: "video", name: t("capability.video"), icon: <Video className="w-4 h-4" /> },
];

export function ApiConfigPanel() {
  const { error: showError, success: showSuccess } = useToastHelpers();
  const [config, setConfig] = useState<ApiConfig>(getDefaultConfig());
  const [_status, setStatus] = useState<ConfigStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newProviderKey, setNewProviderKey] = useState("");
  const [newProviderName, setNewProviderName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);

  const [useFreeImageBackup, setUseFreeImageBackup] = useState(false);

  const [useCustomVision, setUseCustomVision] = useState(false);

  const [testResults, setTestResults] = useState<
    Record<string, { success: boolean; message: string }>
  >({});
  const [testingCapability, setTestingCapability] =
    useState<ApiCapability | null>(null);

  const detectedInfo = newProviderKey ? detectProvider(newProviderKey) : null;
  const keyValidation = newProviderKey
    ? validateApiKey(newProviderKey)
    : { valid: false };

  const refreshPluginCaches = useCallback(async () => {
    await Promise.allSettled([
      loadPluginDetectionRules(),
      loadPluginTemplates(),
      loadModelProfilesFromServer(),
    ]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        await loadPluginDetectionRules();
        await loadPluginTemplates();
        const loaded = await loadConfig();
        if (!cancelled) {
          setConfig(loaded);
          setUseFreeImageBackup(loaded.freeImageBackup ?? false);
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

  const saveConfigDebounced = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    return () => {
      if (saveConfigDebounced.current) {
        clearTimeout(saveConfigDebounced.current);
      }
    };
  }, []);

  const handleAddProvider = async () => {
    if (!keyValidation.valid) return;

    setIsAdding(true);
    try {
      const templateId =
        detectedInfo?.templateId || selectedTemplate || "openai";
      const providerName =
        newProviderName ||
        detectedInfo?.suggestedName ||
        `${templateId}-${Date.now()}`;

      const newProvider = createProviderFromTemplate(
        templateId,
        newProviderKey,
      );

      if (!newProvider) {
        showError(t("error.createFailed"), t("provider.createFailed"));
        return;
      }

      newProvider.name = providerName;

      const updatedConfig = addProvider(config, newProvider);
      setConfig(updatedConfig);
      saveConfig(updatedConfig);
      setStatus(await checkConfigStatus());

      setNewProviderKey("");
      setNewProviderName("");
      setSelectedTemplate("");
      setShowAddForm(false);
      showSuccess(t("success.added"), t("provider.addedWithName", { name: providerName }));
      refreshPluginCaches();
    } catch (e) {
      showError(t("provider.addFailed"), (e as Error).message || t("provider.addError"));
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveProvider = async (providerId: string) => {
    const provider = config.providers.find((p) => p.id === providerId);
    if (!provider) return;
    const hasActiveTasks = provider.models?.some((m) =>
      m.capabilities?.includes("video"),
    );
    const warningSuffix = hasActiveTasks
      ? t("provider.videoModelWarning")
      : "";
    if (
      !(await confirm(
        t("provider.deleteConfirm", { name: provider.name, suffix: warningSuffix }),
        t("provider.deleteConfirmTitle"),
      ))
    )
      return;
    const updatedConfig = removeProvider(config, providerId);
    setConfig(updatedConfig);
    saveConfig(updatedConfig);
    setStatus(await checkConfigStatus());
    showSuccess(t("success.deleted"), t("provider.deletedWithName", { name: provider.name }));
    refreshPluginCaches();
    if (expandedProvider === providerId) {
      setExpandedProvider(null);
    }
  };

  const handleUpdateProvider = async (
    providerId: string,
    updates: Partial<ProviderConfig>,
  ) => {
    const updatedConfig = {
      ...config,
      providers: config.providers.map((p) =>
        p.id === providerId ? { ...p, ...updates } : p,
      ),
    };
    setConfig(updatedConfig);
    setStatus(await checkConfigStatus());

    if (saveConfigDebounced.current) {
      clearTimeout(saveConfigDebounced.current);
    }
    saveConfigDebounced.current = setTimeout(() => {
      saveConfig(updatedConfig);
    }, 500);
  };

  const handleAddCustomModel = async (providerId: string) => {
    const provider = config.providers.find((p) => p.id === providerId);
    if (!provider) return;

    const newModel = {
      id: "user-model-" + Date.now(),
      name: t("provider.userModel"),
      capabilities: ["text"] as ApiCapability[],
      defaultParams: { maxTokens: 4096, temperature: 0.7 },
    };

    handleUpdateProvider(providerId, {
      models: [...provider.models, newModel],
    });
  };

  const handleUpdateModel = (
    providerId: string,
    modelIndex: number,
    updates: Partial<ModelConfig>,
  ) => {
    const provider = config.providers.find((p) => p.id === providerId);
    if (!provider) return;

    const updatedModels = [...provider.models];
    updatedModels[modelIndex] = { ...updatedModels[modelIndex]!, ...updates };

    handleUpdateProvider(providerId, { models: updatedModels });
  };

  const handleRemoveModel = (providerId: string, modelIndex: number) => {
    const provider = config.providers.find((p) => p.id === providerId);
    if (!provider) return;

    const updatedModels = provider.models.filter(
      (_, index) => index !== modelIndex,
    );
    handleUpdateProvider(providerId, { models: updatedModels });
  };

  const handleUpdateProviderModels = (providerId: string) => {
    const provider = config.providers.find((p) => p.id === providerId);
    if (!provider) return;

    const templateId = provider.templateId;
    if (!templateId) return;
    const template = getTemplateWithPlugins(templateId);
    if (!template) return;

    handleUpdateProvider(providerId, { models: template.models });
  };

  const handleSetMapping = async (
    capability: ApiCapability,
    value: string | null | undefined,
  ) => {
    const updatedConfig = setCapabilityMapping(
      config,
      capability,
      value === "_none" ? undefined : value || undefined,
    );
    setConfig(updatedConfig);
    saveConfig(updatedConfig);
    setStatus(await checkConfigStatus());
    const capName = capabilities.find((c) => c.id === capability)?.name || capability;
    showSuccess(t("success.saved"), t("provider.capabilityMappingUpdated", { name: capName }));
  };

  const handleTestCapability = async (capability: ApiCapability) => {
    setTestingCapability(capability);

    try {
      const mappingValue = config.mapping[capability];
      let providerId: string | undefined;
      let modelId: string | undefined;

      if (mappingValue) {
        const lastSlashIndex = mappingValue.lastIndexOf("/");
        if (lastSlashIndex !== -1) {
          providerId = mappingValue.substring(0, lastSlashIndex);
          modelId = mappingValue.substring(lastSlashIndex + 1);
        }
      }

      const result = await testConnection(capability, providerId, modelId);
      setTestResults((prev) => ({
        ...prev,
        [capability]: {
          success: result.success,
          message: result.success ? t("connection.success") : result.message,
        },
      }));
    } catch (error) {
      setTestResults((prev) => ({
        ...prev,
        [capability]: {
          success: false,
          message: t("connection.testFailed", { message: (error as Error).message }),
        },
      }));
    } finally {
      setTestingCapability(null);
    }
  };

  const handleSetFreeImageBackup = (val: boolean) => {
    setUseFreeImageBackup(val);
    const updatedConfig = {
      ...config,
      freeImageBackup: val,
    };
    setConfig(updatedConfig);
    saveConfig(updatedConfig);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{t("provider.configuredProviders")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {config.providers.length === 0 ? (
            <div className="text-center py-8 text-gray-500 border-2 border-dashed rounded-lg">
              <Key className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{t("provider.noConfig")}</p>
            </div>
          ) : (
            config.providers.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                isExpanded={expandedProvider === provider.id}
                onToggleExpand={() =>
                  setExpandedProvider(
                    expandedProvider === provider.id ? null : provider.id,
                  )
                }
                onUpdateProvider={handleUpdateProvider}
                onRemoveProvider={handleRemoveProvider}
                onAddCustomModel={handleAddCustomModel}
                onUpdateModel={handleUpdateModel}
                onRemoveModel={handleRemoveModel}
                onUpdateProviderModels={handleUpdateProviderModels}
                capabilities={capabilities}
              />
            ))
          )}

          {!showAddForm ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowAddForm(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              {t("provider.addProvider")}
            </Button>
          ) : (
            <ProviderForm
              newProviderKey={newProviderKey}
              onKeyChange={setNewProviderKey}
              newProviderName={newProviderName}
              onNameChange={setNewProviderName}
              selectedTemplate={selectedTemplate}
              onTemplateChange={setSelectedTemplate}
              isAdding={isAdding}
              keyValidation={keyValidation}
              detectedInfo={detectedInfo}
              onAdd={handleAddProvider}
              onCancel={() => setShowAddForm(false)}
              capabilities={capabilities}
            />
          )}
        </CardContent>
      </Card>

      <ModelMappingSection
        config={config}
        useFreeImageBackup={useFreeImageBackup}
        useCustomVision={useCustomVision}
        testingCapability={testingCapability}
        onSetMapping={handleSetMapping}
        onTestCapability={handleTestCapability}
        onSetFreeImageBackup={handleSetFreeImageBackup}
        onSetCustomVision={setUseCustomVision}
        capabilities={capabilities}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{t("connection.title")}</CardTitle>
          <CardDescription>{t("connection.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {capabilities.map((cap) => {
              const result = testResults[cap.id];
              return (
                <Button
                  key={cap.id}
                  variant={result?.success ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleTestCapability(cap.id)}
                  disabled={
                    !config.mapping[cap.id] || testingCapability === cap.id
                  }
                  className={
                    result?.success ? "bg-green-600 hover:bg-green-700" : ""
                  }
                >
                  {testingCapability === cap.id ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : result?.success ? (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  ) : (
                    cap.icon
                  )}
                  {t("connection.testName", { name: cap.name })}
                  {result && !result.success && (
                    <XCircle className="h-4 w-4 ml-2 text-red-500" />
                  )}
                </Button>
              );
            })}
          </div>

          {Object.entries(testResults).map(
            ([cap, result]) =>
              result && (
                <Alert
                  key={cap}
                  variant={result.success ? "default" : "destructive"}
                  className={`mt-4 ${result.success ? "bg-green-900/20 border-green-800" : ""}`}
                >
                  <AlertDescription
                    className={result.success ? "text-green-700" : ""}
                  >
                    {capabilities.find((c) => c.id === cap)?.name}:{" "}
                    {result.message}
                  </AlertDescription>
                </Alert>
              ),
          )}
        </CardContent>
      </Card>

      <PluginManager />
    </div>
  );
}
