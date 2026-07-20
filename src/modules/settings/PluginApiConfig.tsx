import { Settings2 } from "lucide-react";
import { t } from "@/shared/constants";
import type { WizardState } from "./plugin-creator-types";

interface PluginApiConfigProps {
  state: WizardState;
  updateField: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
}

type UpdateField = PluginApiConfigProps["updateField"];
type RefMode = "native_field" | "multimodal" | "ref_field" | "text_append" | "none";

const REF_MODE_OPTIONS: Array<{ value: Exclude<RefMode, "none">; label: string }> = [
  { value: "native_field", label: "native_field" },
  { value: "multimodal", label: "multimodal" },
  { value: "ref_field", label: "ref_field" },
  { value: "text_append", label: "text_append" },
];

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
        <AuthSection state={state} updateField={updateField} />
        <VideoCapabilitiesSection state={state} updateField={updateField} />
        <ImageCapabilitiesSection state={state} updateField={updateField} />
        <TransportConfigSection state={state} updateField={updateField} />
      </div>
    </div>
  );
}

// ============= Auth Section =============

function AuthSection({ state, updateField }: { state: WizardState; updateField: UpdateField }) {
  return (
    <>
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
    </>
  );
}

// ============= Video Capabilities Section =============

function VideoCapabilitiesSection({ state, updateField }: { state: WizardState; updateField: UpdateField }) {
  return (
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
        <CheckboxFlag
          checked={state.supportsLastFrame}
          onChange={(v) => updateField("supportsLastFrame", v)}
          label={t("plugin.supportsLastFrame")}
        />
        <CheckboxFlag
          checked={state.supportsReferenceVideo}
          onChange={(v) => updateField("supportsReferenceVideo", v)}
          label={t("plugin.supportsReferenceVideo")}
        />
        <CheckboxFlag
          checked={state.supportsMimicryLevel}
          onChange={(v) => updateField("supportsMimicryLevel", v)}
          label={t("plugin.supportsMimicryLevel")}
        />
        <CheckboxFlag
          checked={state.supportsCharacterRef}
          onChange={(v) => updateField("supportsCharacterRef", v)}
          label={t("plugin.supportsCharacterRef")}
        />
        {state.supportsCharacterRef && (
          <RefFieldConfig
            modeLabel={t("plugin.characterRefMode")}
            fieldLabel={t("plugin.characterRefField")}
            mode={state.characterRefMode}
            field={state.characterRefField}
            onModeChange={(v) => updateField("characterRefMode", v)}
            onFieldChange={(v) => updateField("characterRefField", v)}
            fieldPlaceholder="subject_reference"
          />
        )}
        <CheckboxFlag
          checked={state.supportsSceneRef}
          onChange={(v) => updateField("supportsSceneRef", v)}
          label={t("plugin.supportsSceneRef")}
        />
        {state.supportsSceneRef && (
          <RefFieldConfig
            modeLabel={t("plugin.sceneRefMode")}
            fieldLabel={t("plugin.sceneRefField")}
            mode={state.sceneRefMode}
            field={state.sceneRefField}
            onModeChange={(v) => updateField("sceneRefMode", v)}
            onFieldChange={(v) => updateField("sceneRefField", v)}
            fieldPlaceholder="scene_reference"
          />
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
  );
}

// ============= Image Capabilities Section =============

function ImageCapabilitiesSection({ state, updateField }: { state: WizardState; updateField: UpdateField }) {
  return (
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
        <CheckboxFlag
          checked={state.supportsReferenceImage}
          onChange={(v) => updateField("supportsReferenceImage", v)}
          label={t("plugin.supportsReferenceImage")}
        />
      </div>
    </div>
  );
}

// ============= Transport Config Section =============

function TransportConfigSection({ state, updateField }: { state: WizardState; updateField: UpdateField }) {
  return (
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
  );
}

// ============= Reusable Bits =============

function CheckboxFlag({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label className="text-xs">{label}</label>
    </div>
  );
}

interface RefFieldConfigProps {
  modeLabel: string;
  fieldLabel: string;
  mode: RefMode;
  field: string;
  onModeChange: (v: RefMode) => void;
  onFieldChange: (v: string) => void;
  fieldPlaceholder: string;
}

function RefFieldConfig({ modeLabel, fieldLabel, mode, field, onModeChange, onFieldChange, fieldPlaceholder }: RefFieldConfigProps) {
  return (
    <div className="flex flex-col gap-2 pl-4">
      <div className="flex items-center gap-2">
        <label className="text-xs">{modeLabel}</label>
        <select
          className="select !text-xs !py-1 !px-2"
          value={mode}
          onChange={(e) => onModeChange(e.target.value as RefMode)}
        >
          {REF_MODE_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>
      {mode === "native_field" && (
        <div className="flex items-center gap-2">
          <label className="text-xs">{fieldLabel}</label>
          <input
            className="input !text-xs !py-1.5 !px-2.5 !font-mono w-48"
            value={field}
            onChange={(e) => onFieldChange(e.target.value)}
            placeholder={fieldPlaceholder}
          />
        </div>
      )}
    </div>
  );
}
