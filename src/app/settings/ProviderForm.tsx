import { useMemo } from "react";
import {
  type DetectResult,
} from "@/infrastructure/api-config-facade";
import {
  ApiKeyInputSection,
  BaseUrlSection,
  FormActions,
  ProviderFormSteps,
  ProviderNameInput,
  SupportedFeatures,
  TemplateSelectSection,
  buildTemplateGroups,
  type CapabilityItem,
} from "./ProviderFormParts";

interface ProviderFormProps {
  newProviderKey: string;
  onKeyChange: (value: string) => void;
  newProviderName: string;
  onNameChange: (value: string) => void;
  selectedTemplate: string;
  onTemplateChange: (value: string) => void;
  isAdding: boolean;
  keyValidation: { valid: boolean; errorKey?: string };
  detectedInfo: DetectResult | null;
  detectedAll?: {
    builtinMatches: DetectResult[];
    pluginMatches: DetectResult[];
  } | null;
  hasMultipleSources?: boolean;
  onAdd: () => void;
  onCancel: () => void;
  capabilities: CapabilityItem[];
  onBaseUrlEnable?: (enabled: boolean) => void;
  onBaseUrlChange?: (value: string) => void;
}

export function ProviderForm({
  newProviderKey,
  onKeyChange,
  newProviderName,
  onNameChange,
  selectedTemplate,
  onTemplateChange,
  isAdding,
  keyValidation,
  detectedInfo,
  detectedAll,
  hasMultipleSources,
  onAdd,
  onCancel,
  capabilities,
  onBaseUrlEnable,
  onBaseUrlChange,
}: ProviderFormProps) {
  const templateGroups = useMemo(() => buildTemplateGroups(), []);
  const showTemplateSelect = !!(newProviderKey && !detectedInfo);

  return (
    <div className="p-4 border border-border rounded-lg bg-card2 flex flex-col gap-4">
      <ProviderFormSteps />
      <ApiKeyInputSection
        apiKey={newProviderKey}
        onKeyChange={onKeyChange}
        keyValidation={keyValidation}
        detectedInfo={detectedInfo}
        detectedAll={detectedAll}
        hasMultipleSources={hasMultipleSources}
      />
      <TemplateSelectSection
        visible={showTemplateSelect}
        selectedTemplate={selectedTemplate}
        onTemplateChange={onTemplateChange}
        templateGroups={templateGroups}
      />
      <ProviderNameInput
        value={newProviderName}
        onChange={onNameChange}
        placeholder={detectedInfo?.suggestedName}
      />
      <BaseUrlSection
        onBaseUrlEnable={onBaseUrlEnable}
        onBaseUrlChange={onBaseUrlChange}
      />
      <SupportedFeatures capabilities={capabilities} />
      <FormActions
        isAdding={isAdding}
        canSubmit={keyValidation.valid}
        onAdd={onAdd}
        onCancel={onCancel}
      />
    </div>
  );
}
