import { useState, useEffect, useRef, useCallback } from "react";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { errorLogger } from "@/shared/error-logger";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import { t } from "@/shared/constants";
import {
  Plus,
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
  detectAllProviders,
  validateApiKey,
  loadPluginDetectionRules,
  loadPluginTemplates,
  getTemplateWithPlugins,
  checkConfigStatus,
  type ConfigStatus,
} from "@/infrastructure/api-config-facade";
import { testConnection } from "@/infrastructure/ai-providers";
import { loadModelProfilesFromServer } from "@/shared/model-capabilities";
import { useInvalidateModelCapabilities } from "@/shared/hooks/use-model-capabilities";
import { useInvalidateProviderTemplates } from "@/shared/hooks/use-provider-templates";
import { ProviderCard } from "./ProviderCard";
import { ProviderForm } from "./ProviderForm";
import { ModelMappingSection } from "./ModelMappingSection";

const capabilities: {
  id: ApiCapability;
  name: string;
  icon: React.ReactNode;
}[] = [
  { id: "text", name: t("capability.text"), icon: <Bot size={16} /> },
  { id: "image", name: t("capability.image"), icon: <ImageIcon size={16} /> },
  { id: "vision", name: t("capability.vision"), icon: <Eye size={16} /> },
  { id: "video", name: t("capability.video"), icon: <Video size={16} /> },
];

export function ApiConfigPanel() {
  const { error: showError, success: showSuccess } = useToastHelpers();
  const invalidateModelCapabilities = useInvalidateModelCapabilities();
  const invalidateProviderTemplates = useInvalidateProviderTemplates();
  const [config, setConfig] = useState<ApiConfig>(getDefaultConfig());
  const [_status, setStatus] = useState<ConfigStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newProviderKey, setNewProviderKey] = useState("");
  const [newProviderName, setNewProviderName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  // Base URL 自定义状态（默认关闭，对齐用户需求）
  const [enableCustomBaseUrl, setEnableCustomBaseUrl] = useState(false);
  const [customBaseUrl, setCustomBaseUrl] = useState("");

  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);

  const [useCustomVision, setUseCustomVision] = useState(false);

  const [testResults, setTestResults] = useState<
    Record<string, { success: boolean; message: string }>
  >({});
  const [testingCapability, setTestingCapability] =
    useState<ApiCapability | null>(null);

  const detectedAll = newProviderKey ? detectAllProviders(newProviderKey) : null;
  const detectedInfo = detectedAll?.recommended ?? null;
  const hasMultipleSources = (detectedAll?.builtinMatches.length ?? 0) > 0 && (detectedAll?.pluginMatches.length ?? 0) > 0;
  const keyValidation = newProviderKey
    ? validateApiKey(newProviderKey)
    : { valid: false };

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

      // 应用自定义 Base URL（如果启用）
      if (enableCustomBaseUrl && customBaseUrl.trim()) {
        newProvider.baseUrl = customBaseUrl.trim();
      }

      const updatedConfig = addProvider(config, newProvider);
      setConfig(updatedConfig);
      saveConfig(updatedConfig);
      setStatus(await checkConfigStatus());

      setNewProviderKey("");
      setNewProviderName("");
      setSelectedTemplate("");
      setEnableCustomBaseUrl(false);
      setCustomBaseUrl("");
      setShowAddForm(false);
      showSuccess(t("success.added"), t("provider.addedWithName", { name: providerName }));
      refreshPluginCaches();
    } catch (e) {
      showError(t("provider.addFailed"), mapUserFacingError(e));
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

  const handleTestAllConnections = useCallback(async () => {
    // 顺序测试所有已配置的能力
    for (const cap of capabilities) {
      if (config.mapping[cap.id]) {
        await handleTestCapability(cap.id);
      }
    }
  }, [config.mapping]);

  const handleSaveConfig = useCallback(async () => {
    try {
      await saveConfig(config);
      showSuccess(t("success.saved"), t("success.saved"));
    } catch (e) {
      showError(t("error.saveFailed"), mapUserFacingError(e));
    }
  }, [config, showError]);

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 256 }}>
        <Loader2 size={32} className="animate-spin" />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* 顶部提示：对齐预览页面 Alert */}
      <div style={{ padding: 12, background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 8, fontSize: 11, color: "var(--muted-fg)" }}>
        💡 {t("config.encryptedStorageHint")}
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div className="section-label" style={{ marginBottom: 10 }}>🔑 {t("provider.configuredProviders")}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {config.providers.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", border: "2px dashed var(--border)", borderRadius: 8, color: "var(--muted-fg)" }}>
              <Key size={48} style={{ margin: "0 auto 16px", opacity: 0.5 }} />
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
            <button
              type="button"
              className="btn btn-outline btn-sm"
              style={{ borderStyle: "dashed", justifyContent: "center", gap: 6 }}
              onClick={() => setShowAddForm(true)}
            >
              <Plus size={14} />
              {t("provider.addProvider")}
            </button>
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
              detectedAll={detectedAll}
              hasMultipleSources={hasMultipleSources}
              onAdd={handleAddProvider}
              onCancel={() => setShowAddForm(false)}
              capabilities={capabilities}
              onBaseUrlEnable={setEnableCustomBaseUrl}
              onBaseUrlChange={setCustomBaseUrl}
            />
          )}
        </div>
      </div>

      <ModelMappingSection
        config={config}
        useCustomVision={useCustomVision}
        testingCapability={testingCapability}
        onSetMapping={handleSetMapping}
        onTestCapability={handleTestCapability}
        onSetCustomVision={setUseCustomVision}
        capabilities={capabilities}
      />

      <PluginManager />

      {/* 测试结果显示：对齐预览页面，轻量级 inline alert，非独立 card */}
      {Object.entries(testResults).map(
        ([cap, result]) =>
          result && (
            <div
              key={cap}
              style={{
                padding: 12,
                borderRadius: 8,
                background: result.success
                  ? "rgba(var(--success-rgb, 16, 185, 129), 0.1)"
                  : "rgba(var(--destructive-rgb, 239, 68, 68), 0.1)",
                border: `1px solid ${result.success ? "var(--success)" : "var(--destructive)"}`,
                fontSize: 12,
                color: "var(--muted-fg)",
              }}
            >
              <div style={result.success ? { color: "var(--success)" } : undefined}>
                {capabilities.find((c) => c.id === cap)?.name}: {result.message}
              </div>
            </div>
          ),
      )}

      {/* 底部按钮：对齐预览页面 */}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={handleTestAllConnections}
          disabled={testingCapability !== null}
        >
          {testingCapability !== null ? (
            <Loader2 size={14} className="animate-spin" style={{ marginRight: 6 }} />
          ) : (
            <span style={{ marginRight: 6 }}>🧪</span>
          )}
          {t("connection.testAll")}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={handleSaveConfig}
        >
          <span style={{ marginRight: 6 }}>💾</span>
          {t("connection.save")}
        </button>
      </div>
    </div>
  );
}
