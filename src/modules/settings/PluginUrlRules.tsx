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
    <div className="card !p-0">
      <div className="p-4 pb-3">
        <div className="text-base font-semibold flex items-center gap-2">
          <Globe size={20} />
          {t("plugin.urlRules")}
        </div>
        <div className="text-xs text-muted-foreground mt-1">{t("plugin.urlRulesDesc")}</div>
      </div>
      <div className="p-4 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label>{t("plugin.matchMode")}</label>
          <select
            className="select w-[200px]"
            value={state.matchMode}
            onChange={(e) => updateField("matchMode", e.target.value as WizardState["matchMode"])}
          >
            <option value="contains">{t("plugin.matchContains")}</option>
            <option value="prefix">{t("plugin.matchPrefix")}</option>
            <option value="regex">{t("plugin.matchRegex")}</option>
          </select>
          <p className="text-[11px] text-muted-foreground">{t("plugin.matchModeHint")}</p>
        </div>
        {state.apiUrlPatterns.map((pattern) => (
          <div key={pattern._uid} className="flex items-center gap-2">
            <input
              className="input !text-xs !py-1.5 !px-2.5 !font-mono"
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
              className="btn-sm !text-destructive shrink-0 !py-1.5 !px-2"
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
          <Plus size={16} className="mr-1" />
          {t("plugin.addUrlPattern")}
        </button>
        {state.apiUrlPatterns.length === 0 && (
          <p className="text-[11px] text-muted-foreground">{t("plugin.urlPatternRequired")}</p>
        )}
      </div>
    </div>
  );
}
