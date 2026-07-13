import { Settings2 } from "lucide-react";
import { t } from "@/shared/constants";
import type { WizardState } from "./plugin-creator-types";

interface PluginApiConfigProps {
  state: WizardState;
  updateField: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
}

export function PluginApiConfig({ state, updateField }: PluginApiConfigProps) {
  return (
    <div className="card">
      <div className="pb-3">
        <div className="text-lg flex items-center gap-2 font-semibold">
          <Settings2 size={20} />
          {t("plugin.apiConfig")}
        </div>
        <div className="text-sm text-muted-foreground">{t("plugin.apiConfigDesc")}</div>
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
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
          <div className="flex flex-col gap-2">
            <label>{t("plugin.authHeaderName")}</label>
            <input
              className="input !text-xs !py-1.5 !px-2.5 !font-mono"
              value={state.authHeader}
              onChange={(e) => updateField("authHeader", e.target.value)}
              placeholder="X-API-Key"
            />
          </div>
        )}
        {state.authType === "api-key-query" && (
          <div className="flex flex-col gap-2">
            <label>{t("plugin.authQueryName")}</label>
            <input
              className="input !text-xs !py-1.5 !px-2.5 !font-mono"
              value={state.authQueryName}
              onChange={(e) => updateField("authQueryName", e.target.value)}
              placeholder="api_key"
            />
          </div>
        )}

        <div className="border-t border-border pt-4 flex flex-col gap-3">
          <h4 className="text-sm font-medium">{t("plugin.videoCapabilities")}</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-xs">{t("plugin.defaultVideoModel")} <span className="text-destructive">*</span></label>
              <input
                className="input !text-xs !py-1.5 !px-2.5 !font-mono"
                value={state.defaultVideoModel}
                onChange={(e) => updateField("defaultVideoModel", e.target.value)}
                placeholder="model-v1"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs">{t("plugin.maxDurationSeconds")}</label>
              <input
                className="input !text-xs !py-1.5 !px-2.5 !font-mono"
                type="number"
                value={state.maxDuration}
                onChange={(e) => updateField("maxDuration", Number(e.target.value) || 10)}
              />
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={state.supportsLastFrame} onChange={(e) => updateField("supportsLastFrame", e.target.checked)} />
              <label className="text-xs">{t("plugin.supportsLastFrame")}</label>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={state.supportsReferenceVideo} onChange={(e) => updateField("supportsReferenceVideo", e.target.checked)} />
              <label className="text-xs">{t("plugin.supportsReferenceVideo")}</label>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={state.supportsMimicryLevel} onChange={(e) => updateField("supportsMimicryLevel", e.target.checked)} />
              <label className="text-xs">{t("plugin.supportsMimicryLevel")}</label>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={state.supportsCharacterRef} onChange={(e) => updateField("supportsCharacterRef", e.target.checked)} />
              <label className="text-xs">{t("plugin.supportsCharacterRef")}</label>
            </div>
            {state.supportsCharacterRef && (
              <div className="flex flex-col gap-2 pl-4">
                <div className="flex items-center gap-2">
                  <label className="text-xs">{t("plugin.characterRefMode")}</label>
                  <select
                    className="select !text-xs !py-1 !px-2"
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
                  <div className="flex items-center gap-2">
                    <label className="text-xs">{t("plugin.characterRefField")}</label>
                    <input
                      className="input !text-xs !py-1.5 !px-2.5 !font-mono w-48"
                      value={state.characterRefField}
                      onChange={(e) => updateField("characterRefField", e.target.value)}
                      placeholder="subject_reference"
                    />
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={state.supportsSceneRef} onChange={(e) => updateField("supportsSceneRef", e.target.checked)} />
              <label className="text-xs">{t("plugin.supportsSceneRef")}</label>
            </div>
            {state.supportsSceneRef && (
              <div className="flex flex-col gap-2 pl-4">
                <div className="flex items-center gap-2">
                  <label className="text-xs">{t("plugin.sceneRefMode")}</label>
                  <select
                    className="select !text-xs !py-1 !px-2"
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
                  <div className="flex items-center gap-2">
                    <label className="text-xs">{t("plugin.sceneRefField")}</label>
                    <input
                      className="input !text-xs !py-1.5 !px-2.5 !font-mono w-48"
                      value={state.sceneRefField}
                      onChange={(e) => updateField("sceneRefField", e.target.value)}
                      placeholder="scene_reference"
                    />
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              <label className="text-xs">{t("plugin.imageUploadMode")}</label>
              <select
                className="select !text-xs !py-1 !px-2"
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

        <div className="border-t border-border pt-4 flex flex-col gap-3">
          <h4 className="text-sm font-medium">{t("plugin.imageCapabilities")}</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-xs">{t("plugin.defaultImageModel")} <span className="text-destructive">*</span></label>
              <input
                className="input !text-xs !py-1.5 !px-2.5 !font-mono"
                value={state.defaultImageModel}
                onChange={(e) => updateField("defaultImageModel", e.target.value)}
                placeholder="image-v1"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={state.supportsReferenceImage} onChange={(e) => updateField("supportsReferenceImage", e.target.checked)} />
              <label className="text-xs">{t("plugin.supportsReferenceImage")}</label>
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-4 flex flex-col gap-3">
          <h4 className="text-sm font-medium">{t("plugin.transportConfig")}</h4>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-xs">{t("plugin.imageTransportMode")}</label>
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
            <div className="flex flex-col gap-2">
              <label className="text-xs">{t("plugin.videoTransportMode")}</label>
              <select
                className="select"
                value={state.videoMode}
                onChange={(e) => updateField("videoMode", e.target.value as WizardState["videoMode"])}
              >
                <option value="base64">{t("plugin.transportBase64")}</option>
                <option value="url">{t("plugin.transportUrl")}</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input type="checkbox" checked={state.preferLocalData} onChange={(e) => updateField("preferLocalData", e.target.checked)} />
              <label className="text-xs">{t("plugin.preferLocalData")}</label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
