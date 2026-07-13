import { useId } from "react";
import { Plus, Trash2, ChevronRight } from "lucide-react";
import { t } from "@/shared/constants";
import { IconButton } from "@/shared/presentation/IconButton";
import type { ModelDefinition } from "./plugin-creator-types";

interface ModelParamsProps {
  model: ModelDefinition;
  index: number;
  isExpanded: boolean;
  updateModel: (index: number, updates: Partial<ModelDefinition>) => void;
  toggleModelParams: (index: number) => void;
}

export function ModelParams({
  model,
  index,
  isExpanded,
  updateModel,
  toggleModelParams,
}: ModelParamsProps) {
  const negativePromptCheckId = useId();
  const seedCheckId = useId();
  const cfgScaleCheckId = useId();
  return (
    <div className="mt-3 border-t border-border pt-3">
      <button
        type="button"
        className="flex items-center gap-1 text-[11px] text-muted-foreground"
        onClick={() => toggleModelParams(index)}
      >
        <ChevronRight size={14} style={{ transition: "transform 0.2s", transform: isExpanded ? "rotate(90deg)" : "none" }} />
        {t("plugin.paramConfig")}
      </button>
      {isExpanded && (
        <div className="mt-3 flex flex-col gap-4 pl-2">
          <div className="flex flex-col gap-2">
            <label className="text-[11px]">{t("plugin.durationOptions")}</label>
            {model.durations.map((d) => (
              <div key={d._uid} className="flex items-center gap-2">
                <input
                  className="input text-xs !px-2.5 !py-1.5 font-mono h-8"
                  type="number"
                  aria-label={t("plugin.durationValuePlaceholder")}
                  value={d.value}
                  onChange={(e) => {
                    const durations = model.durations.map((item) =>
                      item._uid === d._uid ? { ...item, value: Number(e.target.value) || 0 } : item
                    );
                    updateModel(index, { durations });
                  }}
                  placeholder={t("plugin.durationValuePlaceholder")}
                />
                <input
                  className="input text-xs !px-2.5 !py-1.5 h-8"
                  aria-label={t("plugin.durationLabelPlaceholder")}
                  value={d.label}
                  onChange={(e) => {
                    const durations = model.durations.map((item) =>
                      item._uid === d._uid ? { ...item, label: e.target.value } : item
                    );
                    updateModel(index, { durations });
                  }}
                  placeholder={t("plugin.durationLabelPlaceholder")}
                />
                <IconButton
                  variant="ghost"
                  className="btn-sm !text-destructive h-8 w-8 !p-0 shrink-0"
                  onClick={() => {
                    updateModel(index, { durations: model.durations.filter((item) => item._uid !== d._uid) });
                  }}
                  aria-label={t("aria.removeDuration")}
                >
                  <Trash2 size={14} />
                </IconButton>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-outline btn-sm h-7"
              onClick={() => {
                updateModel(index, { durations: [...model.durations, { _uid: crypto.randomUUID(), value: 0, label: "" }] });
              }}
            >
              <Plus size={12} className="mr-1" />
              {t("plugin.addDuration")}
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[11px]">{t("plugin.resolutionOptions")}</label>
            {model.resolutions.map((r) => (
              <div key={r._uid} className="flex items-center gap-2">
                <input
                  className="input text-xs !px-2.5 !py-1.5 font-mono h-8 !w-20"
                  value={r.value}
                  onChange={(e) => {
                    const resolutions = model.resolutions.map((item) =>
                      item._uid === r._uid ? { ...item, value: e.target.value } : item
                    );
                    updateModel(index, { resolutions });
                  }}
                  placeholder={t("plugin.valuePlaceholder")}
                />
                <input
                  className="input text-xs !px-2.5 !py-1.5 h-8 !w-24"
                  value={r.label}
                  onChange={(e) => {
                    const resolutions = model.resolutions.map((item) =>
                      item._uid === r._uid ? { ...item, label: e.target.value } : item
                    );
                    updateModel(index, { resolutions });
                  }}
                  placeholder={t("plugin.labelPlaceholder")}
                />
                <input
                  className="input text-xs !px-2.5 !py-1.5 font-mono h-8 !w-16"
                  value={r.width ? String(r.width) : ""}
                  onChange={(e) => {
                    const resolutions = model.resolutions.map((item) =>
                      item._uid === r._uid ? { ...item, width: Number(e.target.value) || 0 } : item
                    );
                    updateModel(index, { resolutions });
                  }}
                  placeholder={t("plugin.resolutionWidthPlaceholder")}
                  type="number"
                />
                <input
                  className="input text-xs !px-2.5 !py-1.5 font-mono h-8 !w-16"
                  value={r.height ? String(r.height) : ""}
                  onChange={(e) => {
                    const resolutions = model.resolutions.map((item) =>
                      item._uid === r._uid ? { ...item, height: Number(e.target.value) || 0 } : item
                    );
                    updateModel(index, { resolutions });
                  }}
                  placeholder={t("plugin.resolutionHeightPlaceholder")}
                  type="number"
                />
                <IconButton
                  variant="ghost"
                  className="btn-sm !text-destructive h-8 w-8 !p-0 shrink-0"
                  onClick={() => {
                    updateModel(index, { resolutions: model.resolutions.filter((item) => item._uid !== r._uid) });
                  }}
                  aria-label={t("aria.removeResolution")}
                >
                  <Trash2 size={14} />
                </IconButton>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-outline btn-sm h-7"
              onClick={() => {
                updateModel(index, { resolutions: [...model.resolutions, { _uid: crypto.randomUUID(), value: "", label: "", width: 0, height: 0 }] });
              }}
            >
              <Plus size={12} className="mr-1" />
              {t("plugin.addResolution")}
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[11px]">{t("plugin.styleOptions")}</label>
            {model.styles.map((s) => (
              <div key={s._uid} className="flex items-center gap-2">
                <input
                  className="input text-xs !px-2.5 !py-1.5 font-mono h-8"
                  value={s.value}
                  onChange={(e) => {
                    const styles = model.styles.map((item) =>
                      item._uid === s._uid ? { ...item, value: e.target.value } : item
                    );
                    updateModel(index, { styles });
                  }}
                  placeholder={t("plugin.valuePlaceholder")}
                />
                <input
                  className="input text-xs !px-2.5 !py-1.5 h-8"
                  value={s.label}
                  onChange={(e) => {
                    const styles = model.styles.map((item) =>
                      item._uid === s._uid ? { ...item, label: e.target.value } : item
                    );
                    updateModel(index, { styles });
                  }}
                  placeholder={t("plugin.labelPlaceholder")}
                />
                <IconButton
                  variant="ghost"
                  className="btn-sm !text-destructive h-8 w-8 !p-0 shrink-0"
                  onClick={() => {
                    updateModel(index, { styles: model.styles.filter((item) => item._uid !== s._uid) });
                  }}
                  aria-label={t("aria.removeStyle")}
                >
                  <Trash2 size={14} />
                </IconButton>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-outline btn-sm h-7"
              onClick={() => {
                updateModel(index, { styles: [...model.styles, { _uid: crypto.randomUUID(), value: "", label: "" }] });
              }}
            >
              <Plus size={12} className="mr-1" />
              {t("plugin.addStyle")}
            </button>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <input
                id={negativePromptCheckId}
                type="checkbox"
                checked={model.negativePrompt}
                onChange={(e) => updateModel(index, { negativePrompt: e.target.checked })}
              />
              <label htmlFor={negativePromptCheckId} className="text-[11px]">{t("plugin.negativePrompt")}</label>
            </div>
            <div className="flex items-center gap-2">
              <input
                id={seedCheckId}
                type="checkbox"
                checked={model.seed}
                onChange={(e) => updateModel(index, { seed: e.target.checked })}
              />
              <label htmlFor={seedCheckId} className="text-[11px]">{t("plugin.seedValue")}</label>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <input
                id={cfgScaleCheckId}
                type="checkbox"
                checked={model.cfgScale !== null}
                onChange={(e) => {
                  updateModel(index, {
                    cfgScale: e.target.checked ? { min: 1, max: 30, default: 7, step: 0.5 } : null,
                  });
                }}
              />
              <label htmlFor={cfgScaleCheckId} className="text-[11px]">{t("plugin.cfgScale")}</label>
            </div>
            {model.cfgScale && (
              <div className="flex items-center gap-2 pl-6">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-muted-foreground">{t("plugin.min")}</label>
                  <input
                    className="input text-xs !px-2.5 !py-1.5 font-mono h-8 !w-20"
                    type="number"
                    value={model.cfgScale.min}
                    onChange={(e) => {
                      const cfgScale = { ...model.cfgScale!, min: Number(e.target.value) || 0 };
                      updateModel(index, { cfgScale });
                    }}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-muted-foreground">{t("plugin.max")}</label>
                  <input
                    className="input text-xs !px-2.5 !py-1.5 font-mono h-8 !w-20"
                    type="number"
                    value={model.cfgScale.max}
                    onChange={(e) => {
                      const cfgScale = { ...model.cfgScale!, max: Number(e.target.value) || 0 };
                      updateModel(index, { cfgScale });
                    }}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-muted-foreground">{t("plugin.defaultVal")}</label>
                  <input
                    className="input text-xs !px-2.5 !py-1.5 font-mono h-8 !w-20"
                    type="number"
                    value={model.cfgScale.default}
                    onChange={(e) => {
                      const cfgScale = { ...model.cfgScale!, default: Number(e.target.value) || 0 };
                      updateModel(index, { cfgScale });
                    }}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-muted-foreground">{t("plugin.step")}</label>
                  <input
                    className="input text-xs !px-2.5 !py-1.5 font-mono h-8 !w-20"
                    type="number"
                    value={model.cfgScale.step}
                    onChange={(e) => {
                      const cfgScale = { ...model.cfgScale!, step: Number(e.target.value) || 0 };
                      updateModel(index, { cfgScale });
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
