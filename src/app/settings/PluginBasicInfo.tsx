import { Wand2 } from "lucide-react";
import { t } from "@/shared/constants";
import type { WizardState } from "./plugin-creator-types";

interface PluginBasicInfoProps {
  state: WizardState;
  updateField: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
}

export function PluginBasicInfo({ state, updateField }: PluginBasicInfoProps) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ paddingBottom: 12 }}>
        <div style={{ fontSize: 18, display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
          <Wand2 size={20} />
          {t("plugin.basicInfo")}
        </div>
        <div style={{ fontSize: 14, color: "var(--muted-fg)" }}>{t("plugin.basicInfoDesc")}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label>{t("plugin.pluginId")} <span style={{ color: "var(--destructive)" }}>*</span></label>
          <input
            className="input"
            style={{ fontSize: 12, padding: "6px 10px", fontFamily: "monospace" }}
            value={state.id}
            onChange={(e) => updateField("id", e.target.value)}
            placeholder="my-provider"
          />
          <p style={{ fontSize: 12, color: "var(--muted-fg)" }}>{t("plugin.pluginIdHint")}</p>
          {state.id && !/^[a-z][a-z0-9-]*$/.test(state.id) && (
            <p style={{ fontSize: 12, color: "var(--destructive)" }}>{t("plugin.pluginIdInvalid")}</p>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label>{t("plugin.displayName")} <span style={{ color: "var(--destructive)" }}>*</span></label>
          <input
            className="input"
            style={{ fontSize: 12, padding: "6px 10px" }}
            value={state.displayName}
            onChange={(e) => updateField("displayName", e.target.value)}
            placeholder="My AI Provider"
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label>{t("plugin.version")}</label>
          <input
            className="input"
            style={{ fontSize: 12, padding: "6px 10px", fontFamily: "monospace" }}
            value={state.version}
            onChange={(e) => updateField("version", e.target.value)}
            placeholder="1.0.0"
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label>{t("plugin.description")}</label>
          <textarea
            className="textarea"
            style={{ fontSize: 12, minHeight: 80 }}
            value={state.description}
            onChange={(e) => updateField("description", e.target.value)}
            placeholder={t("plugin.descriptionPlaceholder")}
          />
        </div>
      </div>
    </div>
  );
}
