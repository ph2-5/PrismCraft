import { Plus, Trash2, Globe } from "lucide-react";
import { t } from "@/shared/constants";
import { IconButton } from "@/shared/presentation/IconButton";
import type { WizardState } from "./plugin-creator-types";

interface PluginUrlRulesProps {
  state: WizardState;
  updateField: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
}

export function PluginUrlRules({ state, updateField }: PluginUrlRulesProps) {
  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ padding: 16, paddingBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          <Globe size={20} />
          {t("plugin.urlRules")}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted-fg)", marginTop: 4 }}>{t("plugin.urlRulesDesc")}</div>
      </div>
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label>{t("plugin.matchMode")}</label>
          <select
            className="select"
            style={{ width: 200 }}
            value={state.matchMode}
            onChange={(e) => updateField("matchMode", e.target.value as WizardState["matchMode"])}
          >
            <option value="contains">{t("plugin.matchContains")}</option>
            <option value="prefix">{t("plugin.matchPrefix")}</option>
            <option value="regex">{t("plugin.matchRegex")}</option>
          </select>
          <p style={{ fontSize: 11, color: "var(--muted-fg)" }}>{t("plugin.matchModeHint")}</p>
        </div>
        {state.apiUrlPatterns.map((pattern) => (
          <div key={pattern._uid} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              className="input"
              style={{ fontSize: 12, padding: "6px 10px", fontFamily: "monospace" }}
              value={pattern.pattern}
              onChange={(e) => {
                const patterns = state.apiUrlPatterns.map((p) =>
                  p._uid === pattern._uid ? { ...p, pattern: e.target.value } : p
                );
                updateField("apiUrlPatterns", patterns);
              }}
              placeholder="api.example.com"
            />
            <IconButton
              variant="ghost"
              className="btn-sm"
              style={{ color: "var(--destructive)", flexShrink: 0, padding: "6px 8px" }}
              onClick={() => {
                updateField(
                  "apiUrlPatterns",
                  state.apiUrlPatterns.filter((p) => p._uid !== pattern._uid)
                );
              }}
              aria-label={t("aria.removeUrlPattern")}
            >
              <Trash2 size={16} />
            </IconButton>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => {
            updateField("apiUrlPatterns", [
              ...state.apiUrlPatterns,
              { _uid: crypto.randomUUID(), pattern: "", type: state.matchMode },
            ]);
          }}
        >
          <Plus size={16} style={{ marginRight: 4 }} />
          {t("plugin.addUrlPattern")}
        </button>
        {state.apiUrlPatterns.length === 0 && (
          <p style={{ fontSize: 11, color: "var(--muted-fg)" }}>{t("plugin.urlPatternRequired")}</p>
        )}
      </div>
    </div>
  );
}
