import { Plus, Trash2, Settings2 } from "lucide-react";
import { t } from "@/shared/constants";
import type { WizardState } from "./plugin-creator-types";

interface PluginResponseFormatProps {
  state: WizardState;
  updateField: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
}

export function PluginResponseFormat({ state, updateField }: PluginResponseFormatProps) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ paddingBottom: 12 }}>
        <div style={{ fontSize: 18, display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
          <Settings2 size={20} />
          {t("plugin.responseFormat")}
        </div>
        <div style={{ fontSize: 14, color: "var(--muted-fg)" }}>{t("plugin.responseFormatDesc")}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label>{t("plugin.taskIdPath")} <span style={{ color: "var(--destructive)" }}>*</span></label>
            <input
              className="input"
              style={{ fontSize: 12, padding: "6px 10px", fontFamily: "monospace" }}
              value={state.taskIdPath}
              onChange={(e) => updateField("taskIdPath", e.target.value)}
              placeholder="data.task_id"
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label>{t("plugin.statusPath")} <span style={{ color: "var(--destructive)" }}>*</span></label>
            <input
              className="input"
              style={{ fontSize: 12, padding: "6px 10px", fontFamily: "monospace" }}
              value={state.statusPath}
              onChange={(e) => updateField("statusPath", e.target.value)}
              placeholder="data.status"
            />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label>{t("plugin.videoUrlPath")}</label>
            <input
              className="input"
              style={{ fontSize: 12, padding: "6px 10px", fontFamily: "monospace" }}
              value={state.videoUrlPath}
              onChange={(e) => updateField("videoUrlPath", e.target.value)}
              placeholder="data.video_url"
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label>{t("plugin.imageUrlPath")}</label>
            <input
              className="input"
              style={{ fontSize: 12, padding: "6px 10px", fontFamily: "monospace" }}
              value={state.imageUrlPath}
              onChange={(e) => updateField("imageUrlPath", e.target.value)}
              placeholder="data.image_url"
            />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label>{t("plugin.statusMapping")}</label>
          <p style={{ fontSize: 12, color: "var(--muted-fg)" }}>{t("plugin.statusMappingHint")}</p>
          {state.statusMapping.map((mapping) => (
            <div key={mapping._uid} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                className="input"
                style={{ fontSize: 12, padding: "6px 10px", fontFamily: "monospace", height: 36 }}
                value={mapping.apiStatus}
                onChange={(e) => {
                  const statusMapping = state.statusMapping.map((m) =>
                    m._uid === mapping._uid ? { ...m, apiStatus: e.target.value } : m
                  );
                  updateField("statusMapping", statusMapping);
                }}
                placeholder={t("plugin.apiStatusPlaceholder")}
              />
              <span style={{ color: "var(--muted-fg)" }}>→</span>
              <select
                className="select"
                style={{ height: 36, width: 160, fontSize: 12 }}
                value={mapping.appStatus}
                onChange={(e) => {
                  const statusMapping = state.statusMapping.map((m) =>
                    m._uid === mapping._uid ? { ...m, appStatus: e.target.value || "pending" } : m
                  );
                  updateField("statusMapping", statusMapping);
                }}
              >
                <option value="pending">{t("plugin.statusPending")}</option>
                <option value="processing">{t("plugin.statusProcessing")}</option>
                <option value="completed">{t("plugin.statusCompleted")}</option>
                <option value="failed">{t("plugin.statusFailed")}</option>
              </select>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ color: "var(--destructive)", flexShrink: 0 }}
                onClick={() => {
                  updateField("statusMapping", state.statusMapping.filter((m) => m._uid !== mapping._uid));
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => {
              updateField("statusMapping", [...state.statusMapping, { _uid: crypto.randomUUID(), apiStatus: "", appStatus: "pending" }]);
            }}
          >
            <Plus size={16} style={{ marginRight: 4 }} />
            {t("plugin.addStatusMapping")}
          </button>
        </div>
      </div>
    </div>
  );
}
