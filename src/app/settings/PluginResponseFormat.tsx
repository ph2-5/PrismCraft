import { Plus, Trash2, Settings2 } from "lucide-react";
import { t } from "@/shared/constants";
import { IconButton } from "@/shared/presentation/IconButton";
import type { WizardState } from "./plugin-creator-types";

interface PluginResponseFormatProps {
  state: WizardState;
  updateField: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
}

export function PluginResponseFormat({ state, updateField }: PluginResponseFormatProps) {
  return (
    <div className="card">
      <div className="pb-3">
        <div className="text-lg flex items-center gap-2 font-semibold">
          <Settings2 size={20} />
          {t("plugin.responseFormat")}
        </div>
        <div className="text-sm text-muted-foreground">{t("plugin.responseFormatDesc")}</div>
      </div>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <label>{t("plugin.taskIdPath")} <span className="text-destructive">*</span></label>
            <input
              className="input !text-xs !py-1.5 !px-2.5 !font-mono"
              value={state.taskIdPath}
              onChange={(e) => updateField("taskIdPath", e.target.value)}
              placeholder="data.task_id"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label>{t("plugin.statusPath")} <span className="text-destructive">*</span></label>
            <input
              className="input !text-xs !py-1.5 !px-2.5 !font-mono"
              value={state.statusPath}
              onChange={(e) => updateField("statusPath", e.target.value)}
              placeholder="data.status"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <label>{t("plugin.videoUrlPath")}</label>
            <input
              className="input !text-xs !py-1.5 !px-2.5 !font-mono"
              value={state.videoUrlPath}
              onChange={(e) => updateField("videoUrlPath", e.target.value)}
              placeholder="data.video_url"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label>{t("plugin.imageUrlPath")}</label>
            <input
              className="input !text-xs !py-1.5 !px-2.5 !font-mono"
              value={state.imageUrlPath}
              onChange={(e) => updateField("imageUrlPath", e.target.value)}
              placeholder="data.image_url"
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <label>{t("plugin.statusMapping")}</label>
          <p className="text-xs text-muted-foreground">{t("plugin.statusMappingHint")}</p>
          {state.statusMapping.map((mapping) => (
            <div key={mapping._uid} className="flex items-center gap-2">
              <input
                className="input !text-xs !py-1.5 !px-2.5 !font-mono h-9"
                value={mapping.apiStatus}
                onChange={(e) => {
                  const statusMapping = state.statusMapping.map((m) =>
                    m._uid === mapping._uid ? { ...m, apiStatus: e.target.value } : m
                  );
                  updateField("statusMapping", statusMapping);
                }}
                placeholder={t("plugin.apiStatusPlaceholder")}
              />
              <span className="text-muted-foreground">→</span>
              <select
                className="select h-9 w-[160px] !text-xs"
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
              <IconButton
                variant="ghost"
                className="btn-sm !text-destructive shrink-0"
                onClick={() => {
                  updateField("statusMapping", state.statusMapping.filter((m) => m._uid !== mapping._uid));
                }}
                aria-label={t("aria.removeStatusMapping")}
              >
                <Trash2 size={16} />
              </IconButton>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => {
              updateField("statusMapping", [...state.statusMapping, { _uid: crypto.randomUUID(), apiStatus: "", appStatus: "pending" }]);
            }}
          >
            <Plus size={16} className="mr-1" />
            {t("plugin.addStatusMapping")}
          </button>
        </div>
      </div>
    </div>
  );
}
