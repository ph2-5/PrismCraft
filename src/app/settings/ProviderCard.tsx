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
  type ApiConfig,
  type ProviderConfig,
  type ModelConfig,
} from "@/infrastructure/api-config-facade";
import { getModelParameterProfile } from "@/shared/model-capabilities";
import { IconButton } from "@/shared/presentation/IconButton";
import { testConnection } from "@/infrastructure/ai-providers";

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

// H3: 安全脱敏 apiKey 用于 header 显示（避免泄露 $secure: 引用或暴露内部结构）
function maskApiKeyForDisplay(apiKey: string): string {
  if (!apiKey) return t("provider.keyNotConfigured");
  // R182/H3: 检测 $secure: 引用、空字符串、或加载失败后的占位符
  if (apiKey.startsWith("$secure:")) {
    // keyStorage 解密失败或引用未解析，提示用户重新输入
    return t("provider.apiKeyStatusPlaceholder");
  }
  if (apiKey.length < 8) return t("provider.apiKeyStatusInvalid");
  // 不保留首尾字符（避免泄露 provider 类型，如 AIza 前缀）
  return "••••••••";
}

// H4: Base URL 协议白名单 + 内网段预校验
type BaseUrlValidation = {
  status: "empty" | "ok" | "invalid-scheme" | "private-range";
  message: string;
};

function validateBaseUrl(url: string): BaseUrlValidation {
  const trimmed = url.trim();
  if (!trimmed) return { status: "empty", message: "" };
  if (!/^https?:\/\//i.test(trimmed)) {
    return { status: "invalid-scheme", message: t("provider.baseUrlInvalidScheme") };
  }
  // 内网 IP 段检测（仅用于 UI 提示，实际拦截由后端 ssrfGuard 完成）
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

type ApiKeyVerifyState =
  | { kind: "idle" }
  | { kind: "verifying" }
  | { kind: "valid" }
  | { kind: "invalid"; message: string };

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
  const [apiKeyState, setApiKeyState] = useState<ApiKeyVerifyState>({ kind: "idle" });
  const baseUrlValidation = validateBaseUrl(provider.baseUrl);

  // 新增: API Key 自动检测存在性 + 是否需要更新
  // 当 apiKey 为空或为 $secure: 引用时，显示"需要更新"状态
  const apiKeyNeedsUpdate = !provider.apiKey || provider.apiKey.startsWith("$secure:");
  const apiKeyDisplay = maskApiKeyForDisplay(provider.apiKey);

  const handleVerifyApiKey = async () => {
    setApiKeyState({ kind: "verifying" });
    try {
      // 用第一个可用的 video 能力模型测试连接，如果没有就用 image
      const testCap: ApiCapability = caps.includes("video")
        ? "video"
        : caps.includes("image")
          ? "image"
          : caps.includes("text")
            ? "text"
            : "vision";
      // 找到该 provider 下支持 testCap 能力的第一个 model
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

  // API Key 状态指示器
  const apiKeyStatusBadge = (() => {
    if (apiKeyState.kind === "verifying") {
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--muted-fg)" }}>
          <Loader2 size={11} className="animate-spin" />
          {t("provider.apiKeyVerifying")}
        </span>
      );
    }
    if (apiKeyState.kind === "valid") {
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--success)" }}>
          <CheckCircle2 size={11} />
          {t("provider.apiKeyVerifySuccess")}
        </span>
      );
    }
    if (apiKeyState.kind === "invalid") {
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--destructive)" }}>
          <AlertCircle size={11} />
          {t("provider.apiKeyStatusInvalid")}
        </span>
      );
    }
    if (apiKeyNeedsUpdate) {
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--warning)" }}>
          <AlertTriangle size={11} />
          {t("provider.apiKeyStatusNeedsUpdate")}
        </span>
      );
    }
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--success)" }}>
        <CheckCircle2 size={11} />
        {t("provider.apiKeyStatusConfigured")}
      </span>
    );
  })();

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
              {apiKeyDisplay}
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
                  aria-invalid={baseUrlValidation.status === "invalid-scheme"}
                />
                {baseUrlValidation.status === "invalid-scheme" && (
                  <div style={{ fontSize: 10, color: "var(--destructive)", marginTop: 2 }}>
                    <AlertCircle size={10} style={{ verticalAlign: "middle", marginRight: 2 }} />
                    {baseUrlValidation.message}
                  </div>
                )}
                {baseUrlValidation.status === "private-range" && (
                  <div style={{ fontSize: 10, color: "var(--warning)", marginTop: 2 }}>
                    <AlertTriangle size={10} style={{ verticalAlign: "middle", marginRight: 2 }} />
                    {baseUrlValidation.message}
                  </div>
                )}
                {baseUrlValidation.status === "ok" && (
                  <div style={{ fontSize: 10, color: "var(--success)", marginTop: 2 }}>
                    <CheckCircle2 size={10} style={{ verticalAlign: "middle", marginRight: 2 }} />
                    {baseUrlValidation.message}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label
                  htmlFor={`apiKey-${provider.id}`}
                  style={{ fontSize: 11 }}
                >
                  {t("provider.apiKey")}
                </label>
                {apiKeyStatusBadge}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="input"
                  style={{ fontSize: 12, padding: "6px 10px", flex: 1 }}
                  id={`apiKey-${provider.id}`}
                  type="password"
                  value={provider.apiKey}
                  onChange={(e) => {
                    onUpdateProvider(provider.id, {
                      apiKey: e.target.value,
                    });
                    // 用户编辑 apiKey 时重置验证状态
                    setApiKeyState({ kind: "idle" });
                  }}
                  placeholder={apiKeyNeedsUpdate ? t("provider.apiKeyPlaceholder") : ""}
                />
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={handleVerifyApiKey}
                  disabled={apiKeyState.kind === "verifying" || !provider.apiKey || provider.apiKey.startsWith("$secure:")}
                  style={{ flexShrink: 0 }}
                >
                  {apiKeyState.kind === "verifying" ? (
                    <Loader2 size={12} className="animate-spin" style={{ marginRight: 4 }} />
                  ) : (
                    <CheckCircle2 size={12} style={{ marginRight: 4 }} />
                  )}
                  {t("provider.apiKeyVerifyButton")}
                </button>
              </div>
              {apiKeyState.kind === "invalid" && (
                <div style={{ fontSize: 10, color: "var(--destructive)", marginTop: 2 }}>
                  {t("provider.apiKeyVerifyFailed", { message: apiKeyState.message })}
                </div>
              )}
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
