import { useMemo, useState } from "react";
import { t } from "@/shared/constants";
import {
  Plus,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  Puzzle,
} from "lucide-react";
import {
  type ApiCapability,
  getAllTemplates,
  type PluginProviderTemplate,
  type DetectResult,
} from "@/infrastructure/api-config-facade";

interface CapabilityItem {
  id: ApiCapability;
  name: string;
  icon: React.ReactNode;
}

interface ProviderFormProps {
  newProviderKey: string;
  onKeyChange: (value: string) => void;
  newProviderName: string;
  onNameChange: (value: string) => void;
  selectedTemplate: string;
  onTemplateChange: (value: string) => void;
  isAdding: boolean;
  keyValidation: { valid: boolean; error?: string };
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

function isPluginTemplate(template: unknown): template is PluginProviderTemplate {
  return typeof template === "object" && template !== null && "pluginId" in template;
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
  const [enableBaseUrl, setEnableBaseUrl] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");

  const templateGroups = useMemo(() => {
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
  }, []);

  return (
    <div style={{ padding: 16, border: "1px solid var(--border)", borderRadius: 8, background: "var(--card2)", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ padding: 12, borderRadius: 8, border: "1px solid var(--primary)", background: "rgba(var(--primary-rgb), 0.2)" }}>
        <h4 style={{ fontWeight: 500, marginBottom: 8, color: "var(--primary)" }}>
          {t("provider.addProviderSteps")}
        </h4>
        <ol style={{ listStyleType: "decimal", listStylePosition: "inside", fontSize: 12, display: "flex", flexDirection: "column", gap: 4, color: "var(--primary)" }}>
          <li>{t("provider.step1")}</li>
          <li>{t("provider.step2")}</li>
          <li>{t("provider.step3")}</li>
          <li>{t("provider.step4")}</li>
          <li>{t("provider.step5")}</li>
        </ol>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label htmlFor="apiKey">
          {t("provider.apiKey")} <span style={{ color: "var(--destructive)" }}>*</span>
        </label>
        <input
          className="input"
          style={{ fontSize: 12, padding: "6px 10px" }}
          id="apiKey"
          data-testid="provider-api-key-input"
          type="password"
          placeholder={t("provider.apiKeyPlaceholder")}
          value={newProviderKey}
          onChange={(e) => onKeyChange(e.target.value)}
        />
        {newProviderKey && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, flexWrap: "wrap" }}>
            {keyValidation.valid ? (
              <>
                {detectedInfo ? (
                  <>
                    <CheckCircle size={16} style={{ color: "var(--success)" }} />
                    <span>{t("provider.detected", { name: detectedInfo.suggestedName })}</span>
                    <span
                      className={`badge ${detectedInfo.confidence === "high" ? "badge-info" : "badge-muted"}`}
                    >
                      {detectedInfo.confidence === "high"
                        ? t("provider.highConfidence")
                        : t("provider.mediumConfidence")}
                    </span>
                    <span
                      className="badge badge-muted"
                      style={{ fontSize: 11, borderColor: "var(--primary)", color: "var(--primary)" }}
                    >
                      {detectedInfo.source === "plugin" ? (
                        <Puzzle size={12} style={{ marginRight: 4 }} />
                      ) : null}
                      {detectedInfo.source === "plugin"
                        ? t("plugin.detectedAsPlugin", { name: detectedInfo.suggestedName })
                        : t("provider.sourceBuiltin")}
                    </span>
                    {hasMultipleSources && detectedAll && (
                      <span className="badge badge-muted" style={{ fontSize: 11, borderColor: "var(--warning)", color: "var(--warning)" }}>
                        <AlertCircle size={12} style={{ marginRight: 4 }} />
                        {t("provider.multipleSources", {
                          builtin: detectedAll.builtinMatches.length,
                          plugin: detectedAll.pluginMatches.length,
                        })}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <AlertCircle size={16} style={{ color: "var(--warning)" }} />
                    <span style={{ color: "var(--warning)" }}>
                      {t("provider.cannotAutoDetect")}
                    </span>
                  </>
                )}
              </>
            ) : (
              <>
                <XCircle size={16} style={{ color: "var(--destructive)" }} />
                <span style={{ color: "var(--destructive)" }}>
                  {keyValidation.error}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {newProviderKey && !detectedInfo && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label>
            {t("provider.selectProvider")} <span style={{ color: "var(--destructive)" }}>*</span>
          </label>
          <select
            className="select"
            style={{ fontSize: 12, padding: "6px 10px" }}
            data-testid="provider-select-template"
            value={selectedTemplate}
            onChange={(e) => onTemplateChange(e.target.value || "")}
          >
            <option value="">{t("provider.selectProviderPlaceholder")}</option>
            {templateGroups.builtin.length > 0 && (
              <optgroup label={t("plugin.builtin")}>
                {templateGroups.builtin.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
              </optgroup>
            )}
            {templateGroups.pluginDeclarative.length > 0 && (
              <optgroup label={t("plugin.declarative")}>
                {templateGroups.pluginDeclarative.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
              </optgroup>
            )}
            {templateGroups.pluginCode.length > 0 && (
              <optgroup label={t("plugin.codePlugin")}>
                {templateGroups.pluginCode.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label htmlFor="providerName">{t("provider.displayNameOptional")}</label>
        <input
          className="input"
          style={{ fontSize: 12, padding: "6px 10px" }}
          id="providerName"
          data-testid="provider-name-input"
          placeholder={detectedInfo?.suggestedName || t("provider.displayNamePlaceholder")}
          value={newProviderName}
          onChange={(e) => onNameChange(e.target.value)}
        />
        <p style={{ fontSize: 11, color: "var(--muted-fg)" }}>
          {t("provider.displayNameHint")}
        </p>
      </div>

      {/* Base URL 启用选项 — 默认关闭，对齐用户需求 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <label htmlFor="enableBaseUrl">{t("provider.customBaseUrl")}</label>
          <button
            type="button"
            className={`toggle ${enableBaseUrl ? "on" : ""}`}
            onClick={() => {
              const next = !enableBaseUrl;
              setEnableBaseUrl(next);
              onBaseUrlEnable?.(next);
              if (!next) {
                setBaseUrl("");
                onBaseUrlChange?.("");
              }
            }}
            aria-label={t("provider.enableCustomBaseUrl")}
          />
        </div>
        {enableBaseUrl && (
          <>
            <input
              className="input"
              style={{ fontSize: 12, padding: "6px 10px" }}
              id="baseUrl"
              data-testid="provider-base-url-input"
              placeholder={t("provider.baseUrlPlaceholder")}
              value={baseUrl}
              onChange={(e) => {
                setBaseUrl(e.target.value);
                onBaseUrlChange?.(e.target.value);
              }}
            />
            <p style={{ fontSize: 11, color: "var(--muted-fg)" }}>
              {t("provider.baseUrlHint")}
            </p>
          </>
        )}
      </div>

      <div style={{ background: "var(--card2)", padding: 12, borderRadius: 8 }}>
        <h4 style={{ fontWeight: 500, marginBottom: 8, color: "var(--muted-fg)" }}>
          {t("provider.supportedFeatures")}
        </h4>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {capabilities.map((cap) => (
            <span
              key={cap.id}
              className="badge badge-muted"
              style={{ fontSize: 11 }}
            >
              {cap.icon}
              <span style={{ marginLeft: 4 }}>{cap.name}</span>
            </span>
          ))}
        </div>
        <p style={{ fontSize: 11, marginTop: 8, color: "var(--muted-fg)" }}>
          {t("provider.afterAddHint")}
        </p>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onAdd}
          disabled={!keyValidation.valid || isAdding}
          style={{ flex: 1 }}
        >
          {isAdding ? (
            <Loader2 size={16} className="animate-spin" style={{ marginRight: 8 }} />
          ) : (
            <Plus size={16} style={{ marginRight: 8 }} />
          )}
          {t("provider.addProvider")}
        </button>
        <button
          type="button"
          className="btn btn-outline"
          onClick={onCancel}
        >
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
