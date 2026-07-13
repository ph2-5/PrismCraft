import { useState } from "react";
import { t } from "@/shared/constants";
import {
  Plus,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  Puzzle,
} from "lucide-react";
import { getAllTemplates, type PluginProviderTemplate, type ApiCapability, type DetectResult } from "@/shared/api-config";

export interface CapabilityItem {
  id: ApiCapability;
  name: string;
  icon: React.ReactNode;
}

function isPluginTemplate(template: unknown): template is PluginProviderTemplate {
  return typeof template === "object" && template !== null && "pluginId" in template;
}

export interface TemplateGroups {
  builtin: { id: string; name: string }[];
  pluginDeclarative: { id: string; name: string }[];
  pluginCode: { id: string; name: string }[];
}

export function buildTemplateGroups(): TemplateGroups {
  const all = getAllTemplates();
  const builtin: { id: string; name: string }[] = [];
  const pluginDeclarative: { id: string; name: string }[] = [];
  const pluginCode: { id: string; name: string }[] = [];
  for (const [id, template] of Object.entries(all)) {
    if (isPluginTemplate(template)) {
      if (template.isCodePlugin) {
        pluginCode.push({ id, name: template.name });
      } else {
        pluginDeclarative.push({ id, name: template.name });
      }
    } else {
      builtin.push({ id, name: template.name });
    }
  }
  return { builtin, pluginDeclarative, pluginCode };
}

export function ProviderFormSteps() {
  return (
    <div className="p-3 rounded-lg border border-primary bg-[rgba(var(--primary-rgb),0.2)]">
      <h4 className="font-medium mb-2 text-primary">
        {t("provider.addProviderSteps")}
      </h4>
      <ol className="list-decimal list-inside text-xs flex flex-col gap-1 text-primary">
        <li>{t("provider.step1")}</li>
        <li>{t("provider.step2")}</li>
        <li>{t("provider.step3")}</li>
        <li>{t("provider.step4")}</li>
        <li>{t("provider.step5")}</li>
      </ol>
    </div>
  );
}

interface ApiKeyValidationState {
  valid: boolean;
  errorKey?: string;
}

interface ApiKeyInputSectionProps {
  apiKey: string;
  onKeyChange: (value: string) => void;
  keyValidation: ApiKeyValidationState;
  detectedInfo: DetectResult | null;
  detectedAll?: { builtinMatches: DetectResult[]; pluginMatches: DetectResult[] } | null;
  hasMultipleSources?: boolean;
}

export function ApiKeyInputSection({
  apiKey,
  onKeyChange,
  keyValidation,
  detectedInfo,
  detectedAll,
  hasMultipleSources,
}: ApiKeyInputSectionProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="apiKey">
        {t("provider.apiKey")} <span className="text-destructive">*</span>
      </label>
      <input
        className="input text-xs !px-2.5 !py-1.5"
        id="apiKey"
        data-testid="provider-api-key-input"
        type="password"
        placeholder={t("provider.apiKeyPlaceholder")}
        value={apiKey}
        onChange={(e) => onKeyChange(e.target.value)}
      />
      {apiKey && (
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <ApiKeyValidationBadge
            keyValidation={keyValidation}
            detectedInfo={detectedInfo}
            detectedAll={detectedAll}
            hasMultipleSources={hasMultipleSources}
          />
        </div>
      )}
    </div>
  );
}

interface ApiKeyValidationBadgeProps {
  keyValidation: ApiKeyValidationState;
  detectedInfo: DetectResult | null;
  detectedAll?: { builtinMatches: DetectResult[]; pluginMatches: DetectResult[] } | null;
  hasMultipleSources?: boolean;
}

function ApiKeyValidationBadge({
  keyValidation,
  detectedInfo,
  detectedAll,
  hasMultipleSources,
}: ApiKeyValidationBadgeProps) {
  if (!keyValidation.valid) {
    return (
      <>
        <XCircle size={16} className="text-destructive" />
        <span className="text-destructive">
          {keyValidation.errorKey ? t(keyValidation.errorKey) : null}
        </span>
      </>
    );
  }
  if (!detectedInfo) {
    return (
      <>
        <AlertCircle size={16} className="text-warning" />
        <span className="text-warning">{t("provider.cannotAutoDetect")}</span>
      </>
    );
  }
  return (
    <>
      <CheckCircle size={16} className="text-success" />
      <span>{t("provider.detected", { name: detectedInfo.suggestedName })}</span>
      <span className={`badge ${detectedInfo.confidence === "high" ? "badge-info" : "badge-muted"}`}>
        {detectedInfo.confidence === "high" ? t("provider.highConfidence") : t("provider.mediumConfidence")}
      </span>
      <span className="badge badge-muted text-[11px] !border-primary !text-primary">
        {detectedInfo.source === "plugin" ? <Puzzle size={12} className="mr-1" /> : null}
        {detectedInfo.source === "plugin"
          ? t("plugin.detectedAsPlugin", { name: detectedInfo.suggestedName })
          : t("provider.sourceBuiltin")}
      </span>
      {hasMultipleSources && detectedAll && (
        <span className="badge badge-muted text-[11px] !border-warning !text-warning">
          <AlertCircle size={12} className="mr-1" />
          {t("provider.multipleSources", {
            builtin: detectedAll.builtinMatches.length,
            plugin: detectedAll.pluginMatches.length,
          })}
        </span>
      )}
    </>
  );
}

interface TemplateSelectSectionProps {
  visible: boolean;
  selectedTemplate: string;
  onTemplateChange: (value: string) => void;
  templateGroups: TemplateGroups;
}

export function TemplateSelectSection({
  visible,
  selectedTemplate,
  onTemplateChange,
  templateGroups,
}: TemplateSelectSectionProps) {
  if (!visible) return null;
  return (
    <div className="flex flex-col gap-2">
      <label>
        {t("provider.selectProvider")} <span className="text-destructive">*</span>
      </label>
      <select
        className="select text-xs !px-2.5 !py-1.5"
        data-testid="provider-select-template"
        value={selectedTemplate}
        onChange={(e) => onTemplateChange(e.target.value || "")}
      >
        <option value="">{t("provider.selectProviderPlaceholder")}</option>
        {templateGroups.builtin.length > 0 && (
          <optgroup label={t("plugin.builtin")}>
            {templateGroups.builtin.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
            ))}
          </optgroup>
        )}
        {templateGroups.pluginDeclarative.length > 0 && (
          <optgroup label={t("plugin.declarative")}>
            {templateGroups.pluginDeclarative.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
            ))}
          </optgroup>
        )}
        {templateGroups.pluginCode.length > 0 && (
          <optgroup label={t("plugin.codePlugin")}>
            {templateGroups.pluginCode.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  );
}

interface ProviderNameInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function ProviderNameInput({ value, onChange, placeholder }: ProviderNameInputProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="providerName">{t("provider.displayNameOptional")}</label>
      <input
        className="input text-xs !px-2.5 !py-1.5"
        id="providerName"
        data-testid="provider-name-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="text-[11px] text-muted-foreground">{t("provider.displayNameHint")}</p>
    </div>
  );
}

interface BaseUrlSectionProps {
  onBaseUrlEnable?: (enabled: boolean) => void;
  onBaseUrlChange?: (value: string) => void;
}

export function BaseUrlSection({ onBaseUrlEnable, onBaseUrlChange }: BaseUrlSectionProps) {
  const [enableBaseUrl, setEnableBaseUrl] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");

  const handleToggle = () => {
    const next = !enableBaseUrl;
    setEnableBaseUrl(next);
    onBaseUrlEnable?.(next);
    if (!next) {
      setBaseUrl("");
      onBaseUrlChange?.("");
    }
  };

  const handleUrlChange = (value: string) => {
    setBaseUrl(value);
    onBaseUrlChange?.(value);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label htmlFor="enableBaseUrl">{t("provider.customBaseUrl")}</label>
        <button
          type="button"
          className={`toggle ${enableBaseUrl ? "on" : ""}`}
          onClick={handleToggle}
          aria-label={t("provider.enableCustomBaseUrl")}
        />
      </div>
      {enableBaseUrl && (
        <>
          <input
            className="input text-xs !px-2.5 !py-1.5"
            id="baseUrl"
            data-testid="provider-base-url-input"
            placeholder={t("provider.baseUrlPlaceholder")}
            value={baseUrl}
            onChange={(e) => handleUrlChange(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">{t("provider.baseUrlHint")}</p>
        </>
      )}
    </div>
  );
}

interface SupportedFeaturesProps {
  capabilities: CapabilityItem[];
}

export function SupportedFeatures({ capabilities }: SupportedFeaturesProps) {
  return (
    <div className="bg-card2 p-3 rounded-lg">
      <h4 className="font-medium mb-2 text-muted-foreground">
        {t("provider.supportedFeatures")}
      </h4>
      <div className="flex flex-wrap gap-2">
        {capabilities.map((cap) => (
          <span key={cap.id} className="badge badge-muted text-[11px]">
            {cap.icon}
            <span className="ml-1">{cap.name}</span>
          </span>
        ))}
      </div>
      <p className="text-[11px] mt-2 text-muted-foreground">{t("provider.afterAddHint")}</p>
    </div>
  );
}

interface FormActionsProps {
  isAdding: boolean;
  canSubmit: boolean;
  onAdd: () => void;
  onCancel: () => void;
}

export function FormActions({ isAdding, canSubmit, onAdd, onCancel }: FormActionsProps) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        className="btn btn-primary flex-1"
        onClick={onAdd}
        disabled={!canSubmit || isAdding}
      >
        {isAdding ? (
          <Loader2 size={16} className="animate-spin mr-2" />
        ) : (
          <Plus size={16} className="mr-2" />
        )}
        {t("provider.addProvider")}
      </button>
      <button type="button" className="btn btn-outline" onClick={onCancel}>
        {t("common.cancel")}
      </button>
    </div>
  );
}
