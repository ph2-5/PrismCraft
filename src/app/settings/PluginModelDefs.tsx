import { Plus, Trash2, Box } from "lucide-react";
import { t } from "@/shared/constants";
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
    <div className="card" style={{ padding: 16 }}>
      <div style={{ paddingBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
              <Box size={20} />
              {t("plugin.modelDefs")}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>{t("plugin.modelDefsDesc")}</div>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={addModel}>
            <Plus size={16} style={{ marginRight: 4 }} />
            {t("plugin.addModel")}
          </button>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {state.models.map((model, index) => (
          <div key={model._uid} style={{ padding: 16, border: "1px solid var(--border)", borderRadius: 8, background: "rgba(30, 41, 59, 0.3)", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="badge badge-muted" style={{ fontSize: 11 }}>
                  {model.type === "video" ? t("plugin.modelTypeVideo") : model.type === "image" ? t("plugin.modelTypeImage") : t("plugin.modelTypeText")}
                </span>
                <span style={{ fontSize: 12, fontWeight: 500 }}>
                  {model.modelId || t("plugin.modelFallbackName", { index: index + 1 })}
                </span>
              </div>
              {state.models.length > 1 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ color: "var(--destructive)", height: 32, width: 32, padding: 0 }}
                  onClick={() => removeModel(index)}
                  aria-label={t("aria.removeModel")}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11 }}>{t("plugin.modelId")} <span style={{ color: "var(--destructive)" }}>*</span></label>
                <input
                  className="input"
                  style={{ fontSize: 12, padding: "6px 10px", fontFamily: "monospace", height: 36 }}
                  value={model.modelId}
                  onChange={(e) => updateModel(index, { modelId: e.target.value })}
                  placeholder="model-v1"
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11 }}>{t("plugin.displayName")} <span style={{ color: "var(--destructive)" }}>*</span></label>
                <input
                  className="input"
                  style={{ fontSize: 12, padding: "6px 10px", height: 36 }}
                  value={model.displayName}
                  onChange={(e) => updateModel(index, { displayName: e.target.value })}
                  placeholder="Model V1"
                />
              </div>
            </div>

            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11 }}>{t("plugin.modelType")}</label>
                <select
                  className="select"
                  style={{ height: 36, fontSize: 12 }}
                  value={model.type}
                  onChange={(e) => updateModel(index, { type: e.target.value as ModelDefinition["type"] })}
                >
                  <option value="video">{t("plugin.modelTypeVideo")}</option>
                  <option value="image">{t("plugin.modelTypeImage")}</option>
                  <option value="text">{t("plugin.modelTypeText")}</option>
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11 }}>{t("plugin.maxDurationSeconds")}</label>
                <input
                  className="input"
                  style={{ fontSize: 12, padding: "6px 10px", fontFamily: "monospace", height: 36 }}
                  type="number"
                  value={model.maxDuration}
                  onChange={(e) => updateModel(index, { maxDuration: Number(e.target.value) || 0 })}
                  disabled={model.type !== "video"}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11 }}>{t("plugin.maxResolution")}</label>
                <input
                  className="input"
                  style={{ fontSize: 12, padding: "6px 10px", fontFamily: "monospace", height: 36 }}
                  type="number"
                  value={model.maxResolution}
                  onChange={(e) => updateModel(index, { maxResolution: Number(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              {model.type === "video" && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={model.supportsLastFrame}
                      onChange={(e) => updateModel(index, { supportsLastFrame: e.target.checked })}
                    />
                    <label style={{ fontSize: 11 }}>{t("plugin.supportsLastFrame")}</label>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={model.supportsReferenceVideo}
                      onChange={(e) => updateModel(index, { supportsReferenceVideo: e.target.checked })}
                    />
                    <label style={{ fontSize: 11 }}>{t("plugin.supportsReferenceVideo")}</label>
                  </div>
                </>
              )}
              {model.type === "image" && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={model.supportsReferenceImage}
                    onChange={(e) => updateModel(index, { supportsReferenceImage: e.target.checked })}
                  />
                  <label style={{ fontSize: 11 }}>{t("plugin.supportsReferenceImage")}</label>
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
