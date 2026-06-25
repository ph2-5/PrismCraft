import { Plus, Trash2, FileCode } from "lucide-react";
import { t } from "@/shared/constants";
import type { WizardState } from "./plugin-creator-types";

interface PluginRequestFormatProps {
  state: WizardState;
  updateField: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
}

export function PluginRequestFormat({ state, updateField }: PluginRequestFormatProps) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ paddingBottom: 12 }}>
        <div style={{ fontSize: 18, display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
          <FileCode size={20} />
          {t("plugin.requestFormat")}
        </div>
        <div style={{ fontSize: 14, color: "var(--muted-fg)" }}>{t("plugin.requestFormatDesc")}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <h4 style={{ fontSize: 14, fontWeight: 500 }}>{t("plugin.apiEndpoints")}</h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 12 }}>{t("plugin.videoGenerate")} <span style={{ color: "var(--destructive)" }}>*</span></label>
              <input
                className="input"
                style={{ fontSize: 12, padding: "6px 10px", fontFamily: "monospace" }}
                value={state.videoGenerateEndpoint}
                onChange={(e) => updateField("videoGenerateEndpoint", e.target.value)}
                placeholder="/v1/videos/generations"
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 12 }}>{t("plugin.videoStatusQuery")} <span style={{ color: "var(--destructive)" }}>*</span></label>
              <input
                className="input"
                style={{ fontSize: 12, padding: "6px 10px", fontFamily: "monospace" }}
                value={state.videoStatusEndpoint}
                onChange={(e) => updateField("videoStatusEndpoint", e.target.value)}
                placeholder="/v1/videos/{taskId}"
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 12 }}>{t("plugin.imageGenerate")}</label>
              <input
                className="input"
                style={{ fontSize: 12, padding: "6px 10px", fontFamily: "monospace" }}
                value={state.imageGenerateEndpoint}
                onChange={(e) => updateField("imageGenerateEndpoint", e.target.value)}
                placeholder="/v1/images/generations"
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 12 }}>{t("plugin.textGenerate")}</label>
              <input
                className="input"
                style={{ fontSize: 12, padding: "6px 10px", fontFamily: "monospace" }}
                value={state.textGenerateEndpoint}
                onChange={(e) => updateField("textGenerateEndpoint", e.target.value)}
                placeholder="/v1/chat/completions"
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 12 }}>{t("plugin.visionAnalyze")}</label>
              <input
                className="input"
                style={{ fontSize: 12, padding: "6px 10px", fontFamily: "monospace" }}
                value={state.visionGenerateEndpoint}
                onChange={(e) => updateField("visionGenerateEndpoint", e.target.value)}
                placeholder="/v1/chat/completions"
              />
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label>{t("plugin.bodyFormat")}</label>
          <select
            className="select"
            value={state.bodyFormat}
            onChange={(e) => updateField("bodyFormat", e.target.value as WizardState["bodyFormat"])}
          >
            <option value="openai-content">{t("plugin.bodyFormatOpenai")}</option>
            <option value="flat">{t("plugin.bodyFormatFlat")}</option>
            <option value="dashscope">{t("plugin.bodyFormatDashscope")}</option>
            <option value="custom">{t("plugin.authCustom")}</option>
          </select>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label>{t("plugin.promptFieldName")}</label>
            <input
              className="input"
              style={{ fontSize: 12, padding: "6px 10px", fontFamily: "monospace" }}
              value={state.promptField}
              onChange={(e) => updateField("promptField", e.target.value)}
              placeholder="prompt"
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label>{t("plugin.modelFieldName")}</label>
            <input
              className="input"
              style={{ fontSize: 12, padding: "6px 10px", fontFamily: "monospace" }}
              value={state.modelField}
              onChange={(e) => updateField("modelField", e.target.value)}
              placeholder="model"
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label>{t("plugin.durationFieldName")}</label>
            <input
              className="input"
              style={{ fontSize: 12, padding: "6px 10px", fontFamily: "monospace" }}
              value={state.durationField}
              onChange={(e) => updateField("durationField", e.target.value)}
              placeholder="duration"
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label>{t("plugin.firstFrameFieldName")}</label>
            <input
              className="input"
              style={{ fontSize: 12, padding: "6px 10px", fontFamily: "monospace" }}
              value={state.firstFrameField}
              onChange={(e) => updateField("firstFrameField", e.target.value)}
              placeholder="image_url"
            />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label>{t("plugin.extraFields")}</label>
          {state.extraFields.map((field) => (
            <div key={field._uid} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                className="input"
                style={{ fontSize: 12, padding: "6px 10px", fontFamily: "monospace", height: 36 }}
                value={field.key}
                onChange={(e) => {
                  const extraFields = state.extraFields.map((f) =>
                    f._uid === field._uid ? { ...f, key: e.target.value } : f
                  );
                  updateField("extraFields", extraFields);
                }}
                placeholder={t("plugin.fieldNamePlaceholder")}
              />
              <input
                className="input"
                style={{ fontSize: 12, padding: "6px 10px", height: 36 }}
                value={field.value}
                onChange={(e) => {
                  const extraFields = state.extraFields.map((f) =>
                    f._uid === field._uid ? { ...f, value: e.target.value } : f
                  );
                  updateField("extraFields", extraFields);
                }}
                placeholder={t("plugin.fieldValuePlaceholder")}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ color: "var(--destructive)", flexShrink: 0 }}
                onClick={() => {
                  updateField("extraFields", state.extraFields.filter((f) => f._uid !== field._uid));
                }}
                aria-label={t("aria.removeField")}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => {
              updateField("extraFields", [...state.extraFields, { _uid: crypto.randomUUID(), key: "", value: "" }]);
            }}
          >
            <Plus size={16} style={{ marginRight: 4 }} />
            {t("plugin.addField")}
          </button>
        </div>
      </div>
    </div>
  );
}
