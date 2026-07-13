import { Plus, Trash2, Box } from "lucide-react";
import { t } from "@/shared/constants";
import { IconButton } from "@/shared/presentation/IconButton";
import type { WizardState, ModelDefinition } from "./plugin-creator-types";
import { ModelParams } from "./ModelParams";

interface PluginModelDefsProps {
  state: WizardState;
  updateModel: (index: number, updates: Partial<ModelDefinition>) => void;
  addModel: () => void;
  removeModel: (index: number) => void;
  expandedModelParams: Set<number>;
  toggleModelParams: (index: number) => void;
}

export function PluginModelDefs({
  state,
  updateModel,
  addModel,
  removeModel,
  expandedModelParams,
  toggleModelParams,
}: PluginModelDefsProps) {
  return (
    <div className="card">
      <div className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-base font-semibold">
              <Box size={20} />
              {t("plugin.modelDefs")}
            </div>
            <div className="text-xs text-muted-foreground">{t("plugin.modelDefsDesc")}</div>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={addModel}>
            <Plus size={16} className="mr-1" />
            {t("plugin.addModel")}
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-4">
        {state.models.map((model, index) => (
          <div key={model._uid} className="plugin-model-card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="badge badge-muted text-[11px]">
                  {model.type === "video" ? t("plugin.modelTypeVideo") : model.type === "image" ? t("plugin.modelTypeImage") : t("plugin.modelTypeText")}
                </span>
                <span className="text-xs font-medium">
                  {model.modelId || t("plugin.modelFallbackName", { index: index + 1 })}
                </span>
              </div>
              {state.models.length > 1 && (
                <IconButton
                  variant="ghost"
                  className="btn-sm text-destructive !h-8 !w-8 !p-0"
                  onClick={() => removeModel(index)}
                  aria-label={t("aria.removeModel")}
                >
                  <Trash2 size={16} />
                </IconButton>
              )}
            </div>

            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
              <div className="flex flex-col gap-1">
                <label className="text-[11px]">{t("plugin.modelId")} <span className="text-destructive">*</span></label>
                <input
                  className="input !text-xs !py-1.5 !px-2.5 font-mono !h-9"
                  value={model.modelId}
                  onChange={(e) => updateModel(index, { modelId: e.target.value })}
                  placeholder="model-v1"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px]">{t("plugin.displayName")} <span className="text-destructive">*</span></label>
                <input
                  className="input !text-xs !py-1.5 !px-2.5 !h-9"
                  value={model.displayName}
                  onChange={(e) => updateModel(index, { displayName: e.target.value })}
                  placeholder="Model V1"
                />
              </div>
            </div>

            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
              <div className="flex flex-col gap-1">
                <label className="text-[11px]">{t("plugin.modelType")}</label>
                <select
                  className="select !h-9 !text-xs"
                  value={model.type}
                  onChange={(e) => updateModel(index, { type: e.target.value as ModelDefinition["type"] })}
                >
                  <option value="video">{t("plugin.modelTypeVideo")}</option>
                  <option value="image">{t("plugin.modelTypeImage")}</option>
                  <option value="text">{t("plugin.modelTypeText")}</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px]">{t("plugin.maxDurationSeconds")}</label>
                <input
                  className="input !text-xs !py-1.5 !px-2.5 font-mono !h-9"
                  type="number"
                  value={model.maxDuration}
                  onChange={(e) => updateModel(index, { maxDuration: Number(e.target.value) || 0 })}
                  disabled={model.type !== "video"}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px]">{t("plugin.maxResolution")}</label>
                <input
                  className="input !text-xs !py-1.5 !px-2.5 font-mono !h-9"
                  type="number"
                  value={model.maxResolution}
                  onChange={(e) => updateModel(index, { maxResolution: Number(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              {model.type === "video" && (
                <>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={model.supportsLastFrame}
                      onChange={(e) => updateModel(index, { supportsLastFrame: e.target.checked })}
                    />
                    <label className="text-[11px]">{t("plugin.supportsLastFrame")}</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={model.supportsReferenceVideo}
                      onChange={(e) => updateModel(index, { supportsReferenceVideo: e.target.checked })}
                    />
                    <label className="text-[11px]">{t("plugin.supportsReferenceVideo")}</label>
                  </div>
                </>
              )}
              {model.type === "image" && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={model.supportsReferenceImage}
                    onChange={(e) => updateModel(index, { supportsReferenceImage: e.target.checked })}
                  />
                  <label className="text-[11px]">{t("plugin.supportsReferenceImage")}</label>
                </div>
              )}
            </div>

            <ModelParams
              model={model}
              index={index}
              isExpanded={expandedModelParams.has(index)}
              updateModel={updateModel}
              toggleModelParams={toggleModelParams}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
