import {
  Plus,
  Key,
  Bot,
  Image as ImageIcon,
  Video,
  Eye,
} from "lucide-react";
import PluginManager from "./plugin-manager";
import {
  type ApiCapability,
} from "@/infrastructure/api-config-facade";
import { ProviderCard } from "./ProviderCard";
import { ProviderForm } from "./ProviderForm";
import { ModelMappingSection } from "./ModelMappingSection";
import { PageLoader } from "@/shared/presentation/PageLoader";
import { useApiConfigHandlers } from "./use-api-config-handlers";
import { TestResultsList, BottomActionBar, EncryptedStorageHint } from "./ApiConfigPanelParts";
import { t } from "@/shared/constants";

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
  const {
    state: {
      config,
      isLoading,
      showAddForm,
      newProviderKey,
      newProviderName,
      selectedTemplate,
      isAdding,
      expandedProvider,
      useCustomVision,
      testResults,
      testingCapability,
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
      handleAddProvider,
      handleRemoveProvider,
      handleUpdateProvider,
      handleAddCustomModel,
      handleUpdateModel,
      handleRemoveModel,
      handleUpdateProviderModels,
      handleSetMapping,
      handleTestCapability,
      handleTestAllConnections,
      handleSaveConfig,
    },
  } = useApiConfigHandlers(capabilities);

  if (isLoading) {
    return <PageLoader size="lg" />;
  }

  return (
    <div className="flex flex-col gap-3">
      <EncryptedStorageHint />

      <div className="card">
        <div className="section-label !mb-2.5"><Key size={14} /> {t("provider.configuredProviders")}</div>
        <div className="flex flex-col gap-3">
          {config.providers.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed border-border rounded-lg text-muted-foreground">
              <Key size={48} className="mx-auto mb-4 opacity-50" />
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
              className="btn btn-outline btn-sm !border-dashed justify-center gap-1.5"
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

      <TestResultsList
        testResults={testResults}
        capabilities={capabilities}
      />

      <BottomActionBar
        testingCapability={testingCapability}
        onTestAllConnections={handleTestAllConnections}
        onSaveConfig={handleSaveConfig}
      />
    </div>
  );
}
