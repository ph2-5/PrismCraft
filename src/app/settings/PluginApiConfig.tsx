import { Settings2 } from "lucide-react";
import { t } from "@/shared/constants";
import type { WizardState } from "./plugin-creator-types";

interface PluginApiConfigProps {
  state: WizardState;
  updateField: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
}

export function PluginApiConfig({ state, updateField }: PluginApiConfigProps) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ paddingBottom: 12 }}>
        <div style={{ fontSize: 18, display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
          <Settings2 size={20} />
          {t("plugin.apiConfig")}
        </div>
        <div style={{ fontSize: 14, color: "var(--muted-fg)" }}>{t("plugin.apiConfigDesc")}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label>{t("plugin.authType")}</label>
          <select
            className="select"
            value={state.authType}
            onChange={(e) => updateField("authType", e.target.value as WizardState["authType"])}
          >
            <option value="bearer">{t("plugin.authBearer")}</option>
            <option value="api-key-header">{t("plugin.authApiKeyHeader")}</option>
            <option value="api-key-query">{t("plugin.authApiKeyQuery")}</option>
            <option value="custom">{t("plugin.authCustom")}</option>
          </select>
        </div>
        {state.authType === "api-key-header" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label>{t("plugin.authHeaderName")}</label>
            <input
              className="input"
              style={{ fontSize: 12, padding: "6px 10px", fontFamily: "monospace" }}
              value={state.authHeader}
              onChange={(e) => updateField("authHeader", e.target.value)}
              placeholder="X-API-Key"
            />
          </div>
        )}
        {state.authType === "api-key-query" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label>{t("plugin.authQueryName")}</label>
            <input
              className="input"
              style={{ fontSize: 12, padding: "6px 10px", fontFamily: "monospace" }}
              value={state.authQueryName}
              onChange={(e) => updateField("authQueryName", e.target.value)}
              placeholder="api_key"
            />
          </div>
        )}

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <h4 style={{ fontSize: 14, fontWeight: 500 }}>{t("plugin.videoCapabilities")}</h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 12 }}>{t("plugin.defaultVideoModel")} <span style={{ color: "var(--destructive)" }}>*</span></label>
              <input
                className="input"
                style={{ fontSize: 12, padding: "6px 10px", fontFamily: "monospace" }}
                value={state.defaultVideoModel}
                onChange={(e) => updateField("defaultVideoModel", e.target.value)}
                placeholder="model-v1"
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 12 }}>{t("plugin.maxDurationSeconds")}</label>
              <input
                className="input"
                style={{ fontSize: 12, padding: "6px 10px", fontFamily: "monospace" }}
                type="number"
                value={state.maxDuration}
                onChange={(e) => updateField("maxDuration", Number(e.target.value) || 10)}
              />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={state.supportsLastFrame} onChange={(e) => updateField("supportsLastFrame", e.target.checked)} />
              <label style={{ fontSize: 12 }}>{t("plugin.supportsLastFrame")}</label>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={state.supportsReferenceVideo} onChange={(e) => updateField("supportsReferenceVideo", e.target.checked)} />
              <label style={{ fontSize: 12 }}>{t("plugin.supportsReferenceVideo")}</label>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={state.supportsMimicryLevel} onChange={(e) => updateField("supportsMimicryLevel", e.target.checked)} />
              <label style={{ fontSize: 12 }}>{t("plugin.supportsMimicryLevel")}</label>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={state.supportsCharacterRef} onChange={(e) => updateField("supportsCharacterRef", e.target.checked)} />
              <label style={{ fontSize: 12 }}>{t("plugin.supportsCharacterRef")}</label>
            </div>
            {state.supportsCharacterRef && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <label style={{ fontSize: 12 }}>{t("plugin.characterRefMode")}</label>
                  <select
                    className="select"
                    style={{ fontSize: 12, padding: "4px 8px" }}
                    value={state.characterRefMode}
                    onChange={(e) => updateField("characterRefMode", e.target.value as "native_field" | "multimodal" | "ref_field" | "text_append" | "none")}
                  >
                    <option value="native_field">native_field</option>
                    <option value="multimodal">multimodal</option>
                    <option value="ref_field">ref_field</option>
                    <option value="text_append">text_append</option>
                  </select>
                </div>
                {state.characterRefMode === "native_field" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ fontSize: 12 }}>{t("plugin.characterRefField")}</label>
                    <input
                      className="input"
                      style={{ fontSize: 12, padding: "6px 10px", fontFamily: "monospace", width: 192 }}
                      value={state.characterRefField}
                      onChange={(e) => updateField("characterRefField", e.target.value)}
                      placeholder="subject_reference"
                    />
                  </div>
                )}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={state.supportsSceneRef} onChange={(e) => updateField("supportsSceneRef", e.target.checked)} />
              <label style={{ fontSize: 12 }}>{t("plugin.supportsSceneRef")}</label>
            </div>
            {state.supportsSceneRef && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <label style={{ fontSize: 12 }}>{t("plugin.sceneRefMode")}</label>
                  <select
                    className="select"
                    style={{ fontSize: 12, padding: "4px 8px" }}
                    value={state.sceneRefMode}
                    onChange={(e) => updateField("sceneRefMode", e.target.value as "native_field" | "multimodal" | "ref_field" | "text_append" | "none")}
                  >
                    <option value="native_field">native_field</option>
                    <option value="multimodal">multimodal</option>
                    <option value="ref_field">ref_field</option>
                    <option value="text_append">text_append</option>
                  </select>
                </div>
                {state.sceneRefMode === "native_field" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ fontSize: 12 }}>{t("plugin.sceneRefField")}</label>
                    <input
                      className="input"
                      style={{ fontSize: 12, padding: "6px 10px", fontFamily: "monospace", width: 192 }}
                      value={state.sceneRefField}
                      onChange={(e) => updateField("sceneRefField", e.target.value)}
                      placeholder="scene_reference"
                    />
                  </div>
                )}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ fontSize: 12 }}>{t("plugin.imageUploadMode")}</label>
              <select
                className="select"
                style={{ fontSize: 12, padding: "4px 8px" }}
                value={state.imageUploadMode}
                onChange={(e) => updateField("imageUploadMode", e.target.value as "base64" | "url" | "upload")}
              >
                <option value="base64">base64</option>
                <option value="url">url</option>
                <option value="upload">upload</option>
              </select>
            </div>
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <h4 style={{ fontSize: 14, fontWeight: 500 }}>{t("plugin.imageCapabilities")}</h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 12 }}>{t("plugin.defaultImageModel")} <span style={{ color: "var(--destructive)" }}>*</span></label>
              <input
                className="input"
                style={{ fontSize: 12, padding: "6px 10px", fontFamily: "monospace" }}
                value={state.defaultImageModel}
                onChange={(e) => updateField("defaultImageModel", e.target.value)}
                placeholder="image-v1"
              />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={state.supportsReferenceImage} onChange={(e) => updateField("supportsReferenceImage", e.target.checked)} />
              <label style={{ fontSize: 12 }}>{t("plugin.supportsReferenceImage")}</label>
            </div>
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <h4 style={{ fontSize: 14, fontWeight: 500 }}>{t("plugin.transportConfig")}</h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 12 }}>{t("plugin.imageTransportMode")}</label>
              <select
                className="select"
                value={state.imageMode}
                onChange={(e) => updateField("imageMode", e.target.value as WizardState["imageMode"])}
              >
                <option value="base64">{t("plugin.transportBase64")}</option>
                <option value="url">{t("plugin.transportUrl")}</option>
                <option value="upload">{t("plugin.uploadMode")}</option>
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 12 }}>{t("plugin.videoTransportMode")}</label>
              <select
                className="select"
                value={state.videoMode}
                onChange={(e) => updateField("videoMode", e.target.value as WizardState["videoMode"])}
              >
                <option value="base64">{t("plugin.transportBase64")}</option>
                <option value="url">{t("plugin.transportUrl")}</option>
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 20 }}>
              <input type="checkbox" checked={state.preferLocalData} onChange={(e) => updateField("preferLocalData", e.target.checked)} />
              <label style={{ fontSize: 12 }}>{t("plugin.preferLocalData")}</label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
