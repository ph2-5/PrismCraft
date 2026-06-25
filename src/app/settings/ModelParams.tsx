import { Plus, Trash2, ChevronRight } from "lucide-react";
import { t } from "@/shared/constants";
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
  return (
    <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
      <button
        type="button"
        style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--muted-fg)" }}
        onClick={() => toggleModelParams(index)}
      >
        <ChevronRight size={14} style={{ transition: "transform 0.2s", transform: isExpanded ? "rotate(90deg)" : "none" }} />
        {t("plugin.paramConfig")}
      </button>
      {isExpanded && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 16, paddingLeft: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: 11 }}>{t("plugin.durationOptions")}</label>
            {model.durations.map((d) => (
              <div key={d._uid} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  className="input"
                  style={{ fontSize: 12, padding: "6px 10px", fontFamily: "monospace", height: 32 }}
                  type="number"
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
                  className="input"
                  style={{ fontSize: 12, padding: "6px 10px", height: 32 }}
                  value={d.label}
                  onChange={(e) => {
                    const durations = model.durations.map((item) =>
                      item._uid === d._uid ? { ...item, label: e.target.value } : item
                    );
                    updateModel(index, { durations });
                  }}
                  placeholder={t("plugin.durationLabelPlaceholder")}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ color: "var(--destructive)", height: 32, width: 32, padding: 0, flexShrink: 0 }}
                  onClick={() => {
                    updateModel(index, { durations: model.durations.filter((item) => item._uid !== d._uid) });
                  }}
                  aria-label={t("aria.removeDuration")}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-outline btn-sm"
              style={{ height: 28, fontSize: 12 }}
              onClick={() => {
                updateModel(index, { durations: [...model.durations, { _uid: crypto.randomUUID(), value: 0, label: "" }] });
              }}
            >
              <Plus size={12} style={{ marginRight: 4 }} />
              {t("plugin.addDuration")}
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: 11 }}>{t("plugin.resolutionOptions")}</label>
            {model.resolutions.map((r) => (
              <div key={r._uid} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  className="input"
                  style={{ fontSize: 12, padding: "6px 10px", fontFamily: "monospace", height: 32, width: 80 }}
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
                  className="input"
                  style={{ fontSize: 12, padding: "6px 10px", height: 32, width: 96 }}
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
                  className="input"
                  style={{ fontSize: 12, padding: "6px 10px", fontFamily: "monospace", height: 32, width: 64 }}
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
                  className="input"
                  style={{ fontSize: 12, padding: "6px 10px", fontFamily: "monospace", height: 32, width: 64 }}
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
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ color: "var(--destructive)", height: 32, width: 32, padding: 0, flexShrink: 0 }}
                  onClick={() => {
                    updateModel(index, { resolutions: model.resolutions.filter((item) => item._uid !== r._uid) });
                  }}
                  aria-label={t("aria.removeResolution")}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-outline btn-sm"
              style={{ height: 28, fontSize: 12 }}
              onClick={() => {
                updateModel(index, { resolutions: [...model.resolutions, { _uid: crypto.randomUUID(), value: "", label: "", width: 0, height: 0 }] });
              }}
            >
              <Plus size={12} style={{ marginRight: 4 }} />
              {t("plugin.addResolution")}
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: 11 }}>{t("plugin.styleOptions")}</label>
            {model.styles.map((s) => (
              <div key={s._uid} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  className="input"
                  style={{ fontSize: 12, padding: "6px 10px", fontFamily: "monospace", height: 32 }}
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
                  className="input"
                  style={{ fontSize: 12, padding: "6px 10px", height: 32 }}
                  value={s.label}
                  onChange={(e) => {
                    const styles = model.styles.map((item) =>
                      item._uid === s._uid ? { ...item, label: e.target.value } : item
                    );
                    updateModel(index, { styles });
                  }}
                  placeholder={t("plugin.labelPlaceholder")}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ color: "var(--destructive)", height: 32, width: 32, padding: 0, flexShrink: 0 }}
                  onClick={() => {
                    updateModel(index, { styles: model.styles.filter((item) => item._uid !== s._uid) });
                  }}
                  aria-label={t("aria.removeStyle")}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-outline btn-sm"
              style={{ height: 28, fontSize: 12 }}
              onClick={() => {
                updateModel(index, { styles: [...model.styles, { _uid: crypto.randomUUID(), value: "", label: "" }] });
              }}
            >
              <Plus size={12} style={{ marginRight: 4 }} />
              {t("plugin.addStyle")}
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={model.negativePrompt}
                onChange={(e) => updateModel(index, { negativePrompt: e.target.checked })}
              />
              <label style={{ fontSize: 11 }}>{t("plugin.negativePrompt")}</label>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={model.seed}
                onChange={(e) => updateModel(index, { seed: e.target.checked })}
              />
              <label style={{ fontSize: 11 }}>{t("plugin.seedValue")}</label>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={model.cfgScale !== null}
                onChange={(e) => {
                  updateModel(index, {
                    cfgScale: e.target.checked ? { min: 1, max: 30, default: 7, step: 0.5 } : null,
                  });
                }}
              />
              <label style={{ fontSize: 11 }}>{t("plugin.cfgScale")}</label>
            </div>
            {model.cfgScale && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 24 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, color: "var(--muted-fg)" }}>{t("plugin.min")}</label>
                  <input
                    className="input"
                    style={{ fontSize: 12, padding: "6px 10px", fontFamily: "monospace", height: 32, width: 80 }}
                    type="number"
                    value={model.cfgScale.min}
                    onChange={(e) => {
                      const cfgScale = { ...model.cfgScale!, min: Number(e.target.value) || 0 };
                      updateModel(index, { cfgScale });
                    }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, color: "var(--muted-fg)" }}>{t("plugin.max")}</label>
                  <input
                    className="input"
                    style={{ fontSize: 12, padding: "6px 10px", fontFamily: "monospace", height: 32, width: 80 }}
                    type="number"
                    value={model.cfgScale.max}
                    onChange={(e) => {
                      const cfgScale = { ...model.cfgScale!, max: Number(e.target.value) || 0 };
                      updateModel(index, { cfgScale });
                    }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, color: "var(--muted-fg)" }}>{t("plugin.defaultVal")}</label>
                  <input
                    className="input"
                    style={{ fontSize: 12, padding: "6px 10px", fontFamily: "monospace", height: 32, width: 80 }}
                    type="number"
                    value={model.cfgScale.default}
                    onChange={(e) => {
                      const cfgScale = { ...model.cfgScale!, default: Number(e.target.value) || 0 };
                      updateModel(index, { cfgScale });
                    }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 11, color: "var(--muted-fg)" }}>{t("plugin.step")}</label>
                  <input
                    className="input"
                    style={{ fontSize: 12, padding: "6px 10px", fontFamily: "monospace", height: 32, width: 80 }}
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
