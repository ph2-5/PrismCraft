import { t } from "@/shared/constants";
import {
  Plus,
  Trash2,
  ChevronDown,
  Sparkles,
  Settings2,
} from "lucide-react";
import {
  type ApiCapability,
  type ApiConfig,
  type ProviderConfig,
  type ModelConfig,
} from "@/infrastructure/api-config-facade";
import { getModelParameterProfile } from "@/shared/model-capabilities";
import { IconButton } from "@/shared/presentation/IconButton";

interface CapabilityItem {
  id: ApiCapability;
  name: string;
  icon: React.ReactNode;
}

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

function getCapabilityBadges(provider: ApiConfig["providers"][0]) {
  const caps = new Set<ApiCapability>();
  provider.models.forEach((m) => m.capabilities.forEach((c) => caps.add(c)));
  return Array.from(caps);
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
  const isConfigured = !!provider.apiKey;

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 12,
          cursor: "pointer",
          background: isConfigured
            ? "rgba(var(--success-rgb), 0.2)"
            : "rgba(var(--warning-rgb), 0.2)",
        }}
        onClick={onToggleExpand}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{ width: 8, height: 8, borderRadius: "50%", background: isConfigured ? "var(--success)" : "var(--warning)" }}
          />
          <div>
            <div style={{ fontWeight: 500 }}>{provider.name}</div>
            <div style={{ fontSize: 11, fontFamily: "monospace", color: "var(--muted-fg)" }}>
              {provider.apiKey
                ? `${provider.apiKey.slice(0, 4)}****${provider.apiKey.slice(-2)}`
                : t("provider.keyNotConfigured")}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", gap: 4 }}>
            {caps.map((cap) => {
              const capConfig = capabilities.find(
                (c) => c.id === cap,
              );
              return (
                <span
                  key={cap}
                  className="badge badge-muted"
                  style={{ fontSize: 11 }}
                >
                  {capConfig?.icon}
                  <span style={{ marginLeft: 4 }}>{capConfig?.name}</span>
                </span>
              );
            })}
          </div>
          <IconButton
            variant="ghost"
            className="btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              onUpdateProviderModels(provider.id);
            }}
            aria-label={t("aria.refreshProviderModels")}
          >
            <Sparkles size={16} style={{ color: "var(--primary)" }} />
          </IconButton>
          <IconButton
            variant="ghost"
            className="btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveProvider(provider.id);
            }}
            aria-label={t("aria.removeProvider")}
          >
            <Trash2 size={16} style={{ color: "var(--destructive)" }} />
          </IconButton>
          <ChevronDown
            size={16}
            style={{ transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "none" }}
          />
        </div>
      </div>

      {isExpanded && (
        <div style={{ padding: 16, borderTop: "1px solid var(--border)", background: "var(--card2)", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h4 style={{ fontWeight: 500, fontSize: 12 }}>{t("provider.providerConfig")}</h4>

            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label
                  htmlFor={`name-${provider.id}`}
                  style={{ fontSize: 11 }}
                >
                  {t("provider.displayName")}
                </label>
                <input
                  className="input"
                  style={{ fontSize: 12, padding: "6px 10px" }}
                  id={`name-${provider.id}`}
                  value={provider.name}
                  onChange={(e) =>
                    onUpdateProvider(provider.id, {
                      name: e.target.value,
                    })
                  }
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label
                  htmlFor={`baseUrl-${provider.id}`}
                  style={{ fontSize: 11 }}
                >
                  {t("provider.baseUrl")}
                </label>
                <input
                  className="input"
                  style={{ fontSize: 12, padding: "6px 10px" }}
                  id={`baseUrl-${provider.id}`}
                  value={provider.baseUrl}
                  onChange={(e) =>
                    onUpdateProvider(provider.id, {
                      baseUrl: e.target.value,
                    })
                  }
                />
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label
                htmlFor={`apiKey-${provider.id}`}
                style={{ fontSize: 11 }}
              >
                {t("provider.apiKey")}
              </label>
              <input
                className="input"
                style={{ fontSize: 12, padding: "6px 10px" }}
                id={`apiKey-${provider.id}`}
                type="password"
                value={provider.apiKey}
                onChange={(e) =>
                  onUpdateProvider(provider.id, {
                    apiKey: e.target.value,
                  })
                }
              />
            </div>
          </div>

          <div style={{ height: 1, background: "var(--border)", margin: "8px 0" }} />

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h4 style={{ fontWeight: 500, fontSize: 12 }}>{t("provider.modelList")}</h4>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => onAddCustomModel(provider.id)}
              >
                <Plus size={12} style={{ marginRight: 4 }} />
                {t("provider.addCustomModel")}
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {provider.models.map((model, index) => (
                <div
                  key={model.id || index}
                  style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 8, background: "var(--card2)", display: "flex", flexDirection: "column", gap: 8 }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ flex: 1, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <label style={{ fontSize: 11 }}>{t("provider.modelId")}</label>
                        <input
                          className="input"
                          style={{ fontSize: 12, padding: "6px 10px" }}
                          value={model.id}
                          onChange={(e) =>
                            onUpdateModel(
                              provider.id,
                              index,
                              {
                                id: e.target.value,
                              },
                            )
                          }
                          placeholder={t("provider.modelIdPlaceholder")}
                        />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <label style={{ fontSize: 11 }}>
                          {t("provider.displayName")}
                        </label>
                        <input
                          className="input"
                          style={{ fontSize: 12, padding: "6px 10px" }}
                          value={model.name}
                          onChange={(e) =>
                            onUpdateModel(
                              provider.id,
                              index,
                              {
                                name: e.target.value,
                              },
                            )
                          }
                        />
                      </div>
                    </div>
                    <IconButton
                      variant="ghost"
                      className="btn-sm"
                      onClick={() =>
                        onRemoveModel(provider.id, index)
                      }
                      aria-label={t("aria.removeModel")}
                    >
                      <Trash2 size={12} style={{ color: "var(--destructive)" }} />
                    </IconButton>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
                      {t("provider.supportedCapabilities")}
                    </span>
                    {["text", "image", "vision", "video"].map(
                      (cap) => {
                        const capConfig = capabilities.find(
                          (c) => c.id === (cap as ApiCapability),
                        );
                        const isEnabled =
                          model.capabilities.includes(
                            cap as ApiCapability,
                          );
                        return (
                          <div
                            key={cap}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              paddingLeft: 8,
                              paddingRight: 8,
                              paddingTop: 4,
                              paddingBottom: 4,
                              borderRadius: 4,
                              fontSize: 11,
                              cursor: "pointer",
                              transition: "background 0.2s, color 0.2s",
                              ...(isEnabled
                                ? {
                                    background: "rgba(var(--primary-rgb), 0.3)",
                                    color: "var(--primary)",
                                  }
                                : {
                                    background: "rgba(127, 127, 127, 0.15)",
                                    color: "var(--muted-fg)",
                                  }),
                            }}
                            onClick={() => {
                              const newCaps = isEnabled
                                ? model.capabilities.filter(
                                    (c) => c !== cap,
                                  )
                                : [
                                    ...model.capabilities,
                                    cap as ApiCapability,
                                  ];
                              onUpdateModel(
                                provider.id,
                                index,
                                { capabilities: newCaps },
                              );
                            }}
                          >
                            {capConfig?.icon}
                            {capConfig?.name}
                          </div>
                        );
                      },
                    )}
                  </div>

                  {getModelParameterProfile(model.id) && (
                    <div style={{ marginTop: 8, padding: 8, border: "1px solid var(--border)", borderRadius: 4, background: "var(--card)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--muted-fg)", marginBottom: 6 }}>
                        <Settings2 size={12} />
                        {t("plugin.modelParams")}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {(() => {
                          const profile = getModelParameterProfile(model.id);
                          if (!profile) return null;
                          const tags: React.ReactNode[] = [];
                          if (profile.parameters.durations?.length) {
                            tags.push(
                              <span key="dur" className="badge badge-muted" style={{ fontSize: 11 }}>
                                {t("plugin.durationOptions")}: {profile.parameters.durations.map((d) => d.label).join(", ")}
                              </span>,
                            );
                          }
                          if (profile.parameters.resolutions?.length) {
                            tags.push(
                              <span key="res" className="badge badge-muted" style={{ fontSize: 11 }}>
                                {t("plugin.resolutionOptions")}: {profile.parameters.resolutions.map((r) => r.label).join(", ")}
                              </span>,
                            );
                          }
                          if (profile.parameters.styles?.length) {
                            tags.push(
                              <span key="style" className="badge badge-muted" style={{ fontSize: 11 }}>
                                {t("plugin.styleOptions")}: {profile.parameters.styles.map((s) => s.label).join(", ")}
                              </span>,
                            );
                          }
                          if (profile.parameters.negativePrompt) {
                            tags.push(<span key="neg" className="badge badge-muted" style={{ fontSize: 11 }}>{t("plugin.negativePrompt")}</span>);
                          }
                          if (profile.parameters.seed) {
                            tags.push(<span key="seed" className="badge badge-muted" style={{ fontSize: 11 }}>{t("plugin.seedSupport")}</span>);
                          }
                          if (profile.parameters.cfgScale) {
                            tags.push(
                              <span key="cfg" className="badge badge-muted" style={{ fontSize: 11 }}>
                                {t("plugin.cfgScale")}: {profile.parameters.cfgScale.min}-{profile.parameters.cfgScale.max}
                              </span>,
                            );
                          }
                          if (profile.parameters.lora) {
                            tags.push(<span key="lora" className="badge badge-muted" style={{ fontSize: 11 }}>{t("plugin.loraSupport")}</span>);
                          }
                          return tags;
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
