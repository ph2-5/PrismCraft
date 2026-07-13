import { type ApiConfig, type ProviderConfig, type ModelConfig } from "@/shared/api-config";
import {
  type CapabilityItem,
  getCapabilityBadges,
  maskApiKeyForDisplay,
  validateBaseUrl,
  ProviderCardHeader,
  ProviderConfigSection,
  ModelList,
  useApiKeyVerify,
} from "./ProviderCardParts";

interface ProviderCardProps {
  provider: ApiConfig["providers"][0];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdateProvider: (providerId: string, updates: Partial<ProviderConfig>) => void;
  onRemoveProvider: (providerId: string) => void;
  onAddCustomModel: (providerId: string) => void;
  onUpdateModel: (providerId: string, modelIndex: number, updates: Partial<ModelConfig>) => void;
  onRemoveModel: (providerId: string, modelIndex: number) => void;
  onUpdateProviderModels: (providerId: string) => void;
  capabilities: CapabilityItem[];
}

export function ProviderCard({
  provider,
  isExpanded,
  onToggleExpand,
  onUpdateProvider,
  onRemoveProvider,
  onAddCustomModel,
  onUpdateModel,
  onRemoveModel,
  onUpdateProviderModels,
  capabilities,
}: ProviderCardProps) {
  const caps = getCapabilityBadges(provider);
  const isConfigured = !!provider.apiKey && !provider.apiKey.startsWith("$secure:");
  const baseUrlValidation = validateBaseUrl(provider.baseUrl);
  const apiKeyNeedsUpdate = !provider.apiKey || provider.apiKey.startsWith("$secure:");
  const apiKeyDisplay = maskApiKeyForDisplay(provider.apiKey);
  const { apiKeyState, setApiKeyState, handleVerifyApiKey } = useApiKeyVerify(caps, provider);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <ProviderCardHeader
        provider={provider}
        isConfigured={isConfigured}
        isExpanded={isExpanded}
        apiKeyDisplay={apiKeyDisplay}
        caps={caps}
        capabilities={capabilities}
        onToggleExpand={onToggleExpand}
        onUpdateProviderModels={() => onUpdateProviderModels(provider.id)}
        onRemoveProvider={() => onRemoveProvider(provider.id)}
      />

      {isExpanded && (
        <div className="p-4 border-t border-border bg-card2 flex flex-col gap-4">
          <ProviderConfigSection
            provider={provider}
            baseUrlValidation={baseUrlValidation}
            apiKeyState={apiKeyState}
            apiKeyNeedsUpdate={apiKeyNeedsUpdate}
            apiKeyDisplay={apiKeyDisplay}
            onVerifyApiKey={handleVerifyApiKey}
            onUpdateProvider={(updates) => onUpdateProvider(provider.id, updates)}
            onApiKeyChange={(value) => {
              onUpdateProvider(provider.id, { apiKey: value });
              setApiKeyState({ kind: "idle" });
            }}
          />

          <div className="h-px bg-border my-2" />

          <ModelList
            models={provider.models}
            capabilities={capabilities}
            onAddCustomModel={() => onAddCustomModel(provider.id)}
            onUpdateModel={(index, updates) => onUpdateModel(provider.id, index, updates)}
            onRemoveModel={(index) => onRemoveModel(provider.id, index)}
          />
        </div>
      )}
    </div>
  );
}
