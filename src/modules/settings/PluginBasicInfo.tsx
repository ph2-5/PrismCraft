import { Wand2 } from "lucide-react";
import { t } from "@/shared/constants";
import type { WizardState } from "./plugin-creator-types";

interface PluginBasicInfoProps {
  state: WizardState;
  updateField: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
}

export function PluginBasicInfo({ state, updateField }: PluginBasicInfoProps) {
  return (
    <div className="card">
      <div className="pb-3">
        <div className="text-lg flex items-center gap-2 font-semibold">
          <Wand2 size={20} />
          {t("plugin.basicInfo")}
        </div>
        <div className="text-sm text-muted-foreground">{t("plugin.basicInfoDesc")}</div>
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label>{t("plugin.pluginId")} <span className="text-destructive">*</span></label>
          <input
            className="input !text-xs !py-1.5 !px-2.5 !font-mono"
            value={state.id}
            onChange={(e) => updateField("id", e.target.value)}
            placeholder="my-provider"
          />
          <p className="text-xs text-muted-foreground">{t("plugin.pluginIdHint")}</p>
          {state.id && !/^[a-z][a-z0-9-]*$/.test(state.id) && (
            <p className="text-xs text-destructive">{t("plugin.pluginIdInvalid")}</p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label>{t("plugin.displayName")} <span className="text-destructive">*</span></label>
          <input
            className="input !text-xs !py-1.5 !px-2.5"
            value={state.displayName}
            onChange={(e) => updateField("displayName", e.target.value)}
            placeholder="My AI Provider"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label>{t("plugin.version")}</label>
          <input
            className="input !text-xs !py-1.5 !px-2.5 !font-mono"
            value={state.version}
            onChange={(e) => updateField("version", e.target.value)}
            placeholder="1.0.0"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label>{t("plugin.description")}</label>
          <textarea
            className="textarea min-h-[80px]"
            value={state.description}
            onChange={(e) => updateField("description", e.target.value)}
            placeholder={t("plugin.descriptionPlaceholder")}
          />
        </div>
      </div>
    </div>
  );
}
