/* eslint-disable max-lines */
import { useState } from "react";
import { t } from "@/shared/constants";
import {
  Plus,
  Trash2,
  ChevronDown,
  Sparkles,
  Settings2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import {
  type ApiCapability,
  type ProviderConfig,
  type ModelConfig,
} from "@/infrastructure/api-config-facade";
import { getModelParameterProfile } from "@/shared/model-capabilities";
import { IconButton } from "@/shared/presentation/IconButton";
import { testConnection } from "@/shared/api-config";

type ApiKeyVerifyState =
  | { kind: "idle" }
  | { kind: "verifying" }
  | { kind: "valid" }
  | { kind: "invalid"; message: string };

export interface CapabilityItem {
  id: ApiCapability;
  name: string;
  icon: React.ReactNode;
}

export function getCapabilityBadges(provider: { models: Array<{ capabilities: ApiCapability[] }> }): ApiCapability[] {
  const caps = new Set<ApiCapability>();
  provider.models.forEach((m) => m.capabilities.forEach((c) => caps.add(c)));
  return Array.from(caps);
}

export function maskApiKeyForDisplay(apiKey: string): string {
  if (!apiKey) return t("provider.keyNotConfigured");
  if (apiKey.startsWith("$secure:")) {
    return t("provider.apiKeyStatusPlaceholder");
  }
  if (apiKey.length < 8) return t("provider.apiKeyStatusInvalid");
  return "••••••••";
}

export type BaseUrlValidation = {
  status: "empty" | "ok" | "invalid-scheme" | "private-range";
  message: string;
};

export function validateBaseUrl(url: string): BaseUrlValidation {
  const trimmed = url.trim();
  if (!trimmed) return { status: "empty", message: "" };
  if (!/^https?:\/\//i.test(trimmed)) {
    return { status: "invalid-scheme", message: t("provider.baseUrlInvalidScheme") };
  }
  try {
    const u = new URL(trimmed);
    const host = u.hostname;
    const privatePatterns = [
      /^10\./,
      /^172\.(1[6-9]|2\d|3[01])\./,
      /^192\.168\./,
      /^127\./,
      /^0\./,
      /^169\.254\./,
      /^::1$/,
      /^fc00:/i,
      /^fe80:/i,
    ];
    if (privatePatterns.some((p) => p.test(host))) {
      return { status: "private-range", message: t("provider.baseUrlPrivateRange") };
    }
    return { status: "ok", message: t("provider.baseUrlLooksGood") };
  } catch {
    return { status: "invalid-scheme", message: t("provider.baseUrlInvalidScheme") };
  }
}

interface ProviderCardHeaderProps {
  provider: ProviderConfig;
  isConfigured: boolean;
  isExpanded: boolean;
  apiKeyDisplay: string;
  caps: ApiCapability[];
  capabilities: CapabilityItem[];
  onToggleExpand: () => void;
  onUpdateProviderModels: () => void;
  onRemoveProvider: () => void;
}

export function ProviderCardHeader({
  provider,
  isConfigured,
  isExpanded,
  apiKeyDisplay,
  caps,
  capabilities,
  onToggleExpand,
  onUpdateProviderModels,
  onRemoveProvider,
}: ProviderCardHeaderProps) {
  return (
    <div
      className="flex items-center justify-between p-3 cursor-pointer"
      style={{
        background: isConfigured
          ? "rgba(var(--success-rgb), 0.2)"
          : "rgba(var(--warning-rgb), 0.2)",
      }}
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      onClick={onToggleExpand}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggleExpand();
        }
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-2 h-2 rounded-full"
          style={{ background: isConfigured ? "var(--success)" : "var(--warning)" }}
        />
        <div>
          <div className="font-medium">{provider.name}</div>
          <div className="text-[11px] font-mono text-muted-foreground">
            {apiKeyDisplay}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          {caps.map((cap) => {
            const capConfig = capabilities.find((c) => c.id === cap);
            return (
              <span key={cap} className="badge badge-muted text-[11px]">
                {capConfig?.icon}
                <span className="ml-1">{capConfig?.name}</span>
              </span>
            );
          })}
        </div>
        <IconButton
          variant="ghost"
          className="btn-sm"
          onClick={(e) => {
            e.stopPropagation();
            onUpdateProviderModels();
          }}
          aria-label={t("aria.refreshProviderModels")}
        >
          <Sparkles size={16} className="text-primary" />
        </IconButton>
        <IconButton
          variant="ghost"
          className="btn-sm"
          onClick={(e) => {
            e.stopPropagation();
            onRemoveProvider();
          }}
          aria-label={t("aria.removeProvider")}
        >
          <Trash2 size={16} className="text-destructive" />
        </IconButton>
        <ChevronDown
          size={16}
          style={{ transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "none" }}
        />
      </div>
    </div>
  );
}

export function ApiKeyStatusBadge({
  apiKeyState,
  apiKeyNeedsUpdate,
}: {
  apiKeyState: ApiKeyVerifyState;
  apiKeyNeedsUpdate: boolean;
}) {
  if (apiKeyState.kind === "verifying") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
        <Loader2 size={11} className="animate-spin" />
        {t("provider.apiKeyVerifying")}
      </span>
    );
  }
  if (apiKeyState.kind === "valid") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-success">
        <CheckCircle2 size={11} />
        {t("provider.apiKeyVerifySuccess")}
      </span>
    );
  }
  if (apiKeyState.kind === "invalid") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-destructive">
        <AlertCircle size={11} />
        {t("provider.apiKeyStatusInvalid")}
      </span>
    );
  }
  if (apiKeyNeedsUpdate) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-warning">
        <AlertTriangle size={11} />
        {t("provider.apiKeyStatusNeedsUpdate")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-success">
      <CheckCircle2 size={11} />
      {t("provider.apiKeyStatusConfigured")}
    </span>
  );
}

interface ProviderConfigSectionProps {
  provider: ProviderConfig;
  baseUrlValidation: BaseUrlValidation;
  apiKeyState: ApiKeyVerifyState;
  apiKeyNeedsUpdate: boolean;
  apiKeyDisplay: string;
  onVerifyApiKey: () => void;
  onUpdateProvider: (updates: Partial<ProviderConfig>) => void;
  onApiKeyChange: (value: string) => void;
}

export function ProviderConfigSection({
  provider,
  baseUrlValidation,
  apiKeyState,
  apiKeyNeedsUpdate,
  onVerifyApiKey,
  onUpdateProvider,
  onApiKeyChange,
}: ProviderConfigSectionProps) {
  return (
    <div className="flex flex-col gap-3">
      <h4 className="font-medium text-xs">{t("provider.providerConfig")}</h4>

      <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
        <div className="flex flex-col gap-1">
          <label htmlFor={`name-${provider.id}`} className="text-[11px]">
            {t("provider.displayName")}
          </label>
          <input
            className="input text-xs !px-2.5 !py-1.5"
            id={`name-${provider.id}`}
            value={provider.name}
            onChange={(e) => onUpdateProvider({ name: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={`baseUrl-${provider.id}`} className="text-[11px]">
            {t("provider.baseUrl")}
          </label>
          <input
            className="input text-xs !px-2.5 !py-1.5"
            id={`baseUrl-${provider.id}`}
            value={provider.baseUrl}
            onChange={(e) => onUpdateProvider({ baseUrl: e.target.value })}
            aria-invalid={baseUrlValidation.status === "invalid-scheme"}
          />
          <BaseUrlValidationMessage validation={baseUrlValidation} />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label htmlFor={`apiKey-${provider.id}`} className="text-[11px]">
            {t("provider.apiKey")}
          </label>
          <ApiKeyStatusBadge apiKeyState={apiKeyState} apiKeyNeedsUpdate={apiKeyNeedsUpdate} />
        </div>
        <div className="flex gap-2">
          <input
            className="input text-xs !px-2.5 !py-1.5 flex-1"
            id={`apiKey-${provider.id}`}
            type="password"
            value={provider.apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder={apiKeyNeedsUpdate ? t("provider.apiKeyPlaceholder") : ""}
          />
          <button
            type="button"
            className="btn btn-outline btn-sm shrink-0"
            onClick={onVerifyApiKey}
            disabled={apiKeyState.kind === "verifying" || !provider.apiKey || provider.apiKey.startsWith("$secure:")}
            title={
              apiKeyState.kind !== "verifying" && (!provider.apiKey || provider.apiKey.startsWith("$secure:"))
                ? t("hint.verifyApiKey")
                : undefined
            }
          >
            {apiKeyState.kind === "verifying" ? (
              <Loader2 size={12} className="animate-spin mr-1" />
            ) : (
              <CheckCircle2 size={12} className="mr-1" />
            )}
            {t("provider.apiKeyVerifyButton")}
          </button>
        </div>
        {apiKeyState.kind === "invalid" && (
          <div className="text-[10px] text-destructive mt-0.5">
            {t("provider.apiKeyVerifyFailed", { message: apiKeyState.message })}
          </div>
        )}
      </div>
    </div>
  );
}

function BaseUrlValidationMessage({ validation }: { validation: BaseUrlValidation }) {
  if (validation.status === "invalid-scheme") {
    return (
      <div className="text-[10px] text-destructive mt-0.5">
        <AlertCircle size={10} className="align-middle mr-0.5" />
        {validation.message}
      </div>
    );
  }
  if (validation.status === "private-range") {
    return (
      <div className="text-[10px] text-warning mt-0.5">
        <AlertTriangle size={10} className="align-middle mr-0.5" />
        {validation.message}
      </div>
    );
  }
  if (validation.status === "ok") {
    return (
      <div className="text-[10px] text-success mt-0.5">
        <CheckCircle2 size={10} className="align-middle mr-0.5" />
        {validation.message}
      </div>
    );
  }
  return null;
}

export function useApiKeyVerify(caps: ApiCapability[], provider: ProviderConfig) {
  const [apiKeyState, setApiKeyState] = useState<ApiKeyVerifyState>({ kind: "idle" });

  const handleVerifyApiKey = async () => {
    setApiKeyState({ kind: "verifying" });
    try {
      const testCap: ApiCapability = caps.includes("video")
        ? "video"
        : caps.includes("image")
          ? "image"
          : caps.includes("text")
            ? "text"
            : "vision";
      const targetModel = provider.models.find((m) => m.capabilities.includes(testCap));
      const result = await testConnection(testCap, provider.id, targetModel?.id);
      if (result.success) {
        setApiKeyState({ kind: "valid" });
      } else {
        setApiKeyState({ kind: "invalid", message: result.message });
      }
    } catch (e) {
      setApiKeyState({ kind: "invalid", message: (e as Error).message });
    }
  };

  return { apiKeyState, setApiKeyState, handleVerifyApiKey };
}

interface ModelRowProps {
  model: ModelConfig;
  index: number;
  capabilities: CapabilityItem[];
  onUpdateModel: (index: number, updates: Partial<ModelConfig>) => void;
  onRemoveModel: (index: number) => void;
}

function ModelRow({ model, index, capabilities, onUpdateModel, onRemoveModel }: ModelRowProps) {
  return (
    <div
      key={model.id || index}
      className="p-3 border border-border rounded-lg bg-card2 flex flex-col gap-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 grid gap-2 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
          <div className="flex flex-col gap-1">
            <label className="text-[11px]">{t("provider.modelId")}</label>
            <input
              className="input text-xs !px-2.5 !py-1.5"
              value={model.id}
              onChange={(e) => onUpdateModel(index, { id: e.target.value })}
              placeholder={t("provider.modelIdPlaceholder")}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px]">{t("provider.displayName")}</label>
            <input
              className="input text-xs !px-2.5 !py-1.5"
              value={model.name}
              onChange={(e) => onUpdateModel(index, { name: e.target.value })}
            />
          </div>
        </div>
        <IconButton
          variant="ghost"
          className="btn-sm"
          onClick={() => onRemoveModel(index)}
          aria-label={t("aria.removeModel")}
        >
          <Trash2 size={12} className="text-destructive" />
        </IconButton>
      </div>

      <ModelCapabilityToggleGroup
        model={model}
        capabilities={capabilities}
        onToggle={(cap, enabled) => {
          const newCaps = enabled
            ? model.capabilities.filter((c) => c !== cap)
            : [...model.capabilities, cap];
          onUpdateModel(index, { capabilities: newCaps });
        }}
      />

      <ModelParameterProfile modelId={model.id} />
    </div>
  );
}

function ModelCapabilityToggleGroup({
  model,
  capabilities,
  onToggle,
}: {
  model: ModelConfig;
  capabilities: CapabilityItem[];
  onToggle: (cap: ApiCapability, enabled: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] text-muted-foreground">
        {t("provider.supportedCapabilities")}
      </span>
      {(["text", "image", "vision", "video"] as const).map((cap) => {
        const capConfig = capabilities.find((c) => c.id === cap);
        const isEnabled = model.capabilities.includes(cap);
        return (
          <div
            key={cap}
            role="switch"
            aria-checked={isEnabled}
            tabIndex={0}
            className="flex items-center gap-1 px-2 py-1 rounded-sm text-[11px] cursor-pointer transition-colors"
            style={{
              ...(isEnabled
                ? {
                    background: "rgba(var(--primary-rgb), 0.3)",
                    color: "var(--primary)",
                  }
                : {
                    background: "color-mix(in srgb, var(--muted-fg) 15%, transparent)",
                    color: "var(--muted-fg)",
                  }),
            }}
            onClick={() => onToggle(cap, isEnabled)}
            onKeyDown={(e) => {
              // R169: 可点击 div 必须支持键盘操作（Enter/Space 触发，与 button 一致）
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onToggle(cap, isEnabled);
              }
            }}
          >
            {capConfig?.icon}
            {capConfig?.name}
          </div>
        );
      })}
    </div>
  );
}

function ModelParameterProfile({ modelId }: { modelId: string }) {
  const profile = getModelParameterProfile(modelId);
  if (!profile) return null;
  return (
    <div className="mt-2 p-2 border border-border rounded-sm bg-card">
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground mb-1.5">
        <Settings2 size={12} />
        {t("plugin.modelParams")}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <ModelParameterProfileTags profile={profile} />
      </div>
    </div>
  );
}

function ModelParameterProfileTags({ profile }: { profile: NonNullable<ReturnType<typeof getModelParameterProfile>> }) {
  const tags: React.ReactNode[] = [];
  if (profile.parameters.durations?.length) {
    tags.push(
      <span key="dur" className="badge badge-muted text-[11px]">
        {t("plugin.durationOptions")}: {profile.parameters.durations.map((d) => d.label).join(", ")}
      </span>,
    );
  }
  if (profile.parameters.resolutions?.length) {
    tags.push(
      <span key="res" className="badge badge-muted text-[11px]">
        {t("plugin.resolutionOptions")}: {profile.parameters.resolutions.map((r) => r.label).join(", ")}
      </span>,
    );
  }
  if (profile.parameters.styles?.length) {
    tags.push(
      <span key="style" className="badge badge-muted text-[11px]">
        {t("plugin.styleOptions")}: {profile.parameters.styles.map((s) => s.label).join(", ")}
      </span>,
    );
  }
  if (profile.parameters.negativePrompt) {
    tags.push(<span key="neg" className="badge badge-muted text-[11px]">{t("plugin.negativePrompt")}</span>);
  }
  if (profile.parameters.seed) {
    tags.push(<span key="seed" className="badge badge-muted text-[11px]">{t("plugin.seedSupport")}</span>);
  }
  if (profile.parameters.cfgScale) {
    tags.push(
      <span key="cfg" className="badge badge-muted text-[11px]">
        {t("plugin.cfgScale")}: {profile.parameters.cfgScale.min}-{profile.parameters.cfgScale.max}
      </span>,
    );
  }
  if (profile.parameters.lora) {
    tags.push(<span key="lora" className="badge badge-muted text-[11px]">{t("plugin.loraSupport")}</span>);
  }
  return <>{tags}</>;
}

interface ModelListProps {
  models: ModelConfig[];
  capabilities: CapabilityItem[];
  onAddCustomModel: () => void;
  onUpdateModel: (index: number, updates: Partial<ModelConfig>) => void;
  onRemoveModel: (index: number) => void;
}

export function ModelList({ models, capabilities, onAddCustomModel, onUpdateModel, onRemoveModel }: ModelListProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-xs">{t("provider.modelList")}</h4>
        <button type="button" className="btn btn-outline btn-sm" onClick={onAddCustomModel}>
          <Plus size={12} className="mr-1" />
          {t("provider.addCustomModel")}
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {models.map((model, index) => (
          <ModelRow
            key={model.id || index}
            model={model}
            index={index}
            capabilities={capabilities}
            onUpdateModel={onUpdateModel}
            onRemoveModel={onRemoveModel}
          />
        ))}
      </div>
    </div>
  );
}
