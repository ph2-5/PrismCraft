/**
 * Q3-1 — SceneVariantDialog 组件
 *
 * 对称 character/variants/presentation/variant-dialog.tsx。
 * 支持编辑场景变体的：
 *   - 基础字段：name / description / promptFragment
 *   - 默认/正典开关：isDefault / isCanonical
 *   - 8 维参数：timeOfDay / weather / lighting / mood / crowdLevel / cameraAngle / season / colorPalette
 *   - 参考图路径（referenceImagePath）
 */

import { X } from "lucide-react";
import { Modal } from "@/shared/presentation/Modal";
import { t } from "@/shared/constants";
import type { SceneVariant } from "@/domain/schemas";

export interface SceneVariantFormState {
  name: string;
  description: string;
  promptFragment: string;
  referenceImagePath: string;
  isDefault: boolean;
  isCanonical: boolean;
  timeOfDay: string;
  weather: string;
  lighting: string;
  mood: string;
  crowdLevel: string;
  cameraAngle: string;
  season: string;
  colorPalette: string;
}

/** 字符串字段（与 SceneVariant 同名） */
const VARIANT_STRING_FIELDS = [
  "name",
  "description",
  "promptFragment",
  "referenceImagePath",
  "timeOfDay",
  "weather",
  "lighting",
  "mood",
  "crowdLevel",
  "cameraAngle",
  "season",
  "colorPalette",
] as const;

/** 布尔字段（与 SceneVariant 同名） */
const VARIANT_BOOLEAN_FIELDS = [
  "isDefault",
  "isCanonical",
] as const;

export function variantToForm(v?: Partial<SceneVariant>): SceneVariantFormState {
  const form: SceneVariantFormState = {
    name: "",
    description: "",
    promptFragment: "",
    referenceImagePath: "",
    isDefault: false,
    isCanonical: false,
    timeOfDay: "",
    weather: "",
    lighting: "",
    mood: "",
    crowdLevel: "",
    cameraAngle: "",
    season: "",
    colorPalette: "",
  };
  if (!v) return form;
  for (const key of VARIANT_STRING_FIELDS) {
    const val = v[key];
    if (typeof val === "string") form[key] = val;
  }
  for (const key of VARIANT_BOOLEAN_FIELDS) {
    const val = v[key];
    if (typeof val === "boolean") form[key] = val;
  }
  return form;
}

interface SceneVariantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingVariant: SceneVariant | null;
  form: SceneVariantFormState;
  setForm: (form: SceneVariantFormState) => void;
  onSubmit: () => void;
}

const PARAM_FIELDS: Array<{ key: keyof SceneVariantFormState; labelKey: string }> = [
  { key: "timeOfDay", labelKey: "scene.variants.param.timeOfDay" },
  { key: "weather", labelKey: "scene.variants.param.weather" },
  { key: "lighting", labelKey: "scene.variants.param.lighting" },
  { key: "mood", labelKey: "scene.variants.param.mood" },
  { key: "crowdLevel", labelKey: "scene.variants.param.crowdLevel" },
  { key: "cameraAngle", labelKey: "scene.variants.param.cameraAngle" },
  { key: "season", labelKey: "scene.variants.param.season" },
  { key: "colorPalette", labelKey: "scene.variants.param.colorPalette" },
];

export function SceneVariantDialog({
  open,
  onOpenChange,
  editingVariant,
  form,
  setForm,
  onSubmit,
}: SceneVariantDialogProps) {
  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      ariaLabel={editingVariant ? t("scene.variants.editTitle") : t("scene.variants.addTitle")}
      style={{ maxWidth: "36rem" }}
    >
      <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>
            {editingVariant ? t("scene.variants.editTitle") : t("scene.variants.addTitle")}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>
            {t("scene.variants.subtitle")}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={() => onOpenChange(false)}
          aria-label={t("common.close")}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-4 py-2">
        {/* 名称 */}
        <div className="space-y-2">
          <label htmlFor="scene-variant-name" className="text-sm font-medium">
            {t("scene.variants.nameLabel")}
          </label>
          <input
            id="scene-variant-name"
            className="input"
            data-testid="scene-variant-name-input"
            placeholder={t("scene.variants.namePlaceholder")}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>

        {/* 描述 */}
        <div className="space-y-2">
          <label htmlFor="scene-variant-description" className="text-sm font-medium">
            {t("scene.variants.descriptionLabel")}
          </label>
          <textarea
            id="scene-variant-description"
            className="textarea"
            placeholder={t("scene.variants.descriptionPlaceholder")}
            rows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>

        {/* Prompt 片段 */}
        <div className="space-y-2">
          <label htmlFor="scene-variant-prompt" className="text-sm font-medium">
            {t("scene.variants.promptFragmentLabel")}
          </label>
          <textarea
            id="scene-variant-prompt"
            className="textarea"
            placeholder={t("scene.variants.promptFragmentPlaceholder")}
            rows={3}
            value={form.promptFragment}
            onChange={(e) => setForm({ ...form, promptFragment: e.target.value })}
          />
        </div>

        {/* 参考图路径 */}
        <div className="space-y-2">
          <label htmlFor="scene-variant-reference" className="text-sm font-medium">
            {t("scene.variants.referenceImageLabel")}
          </label>
          <input
            id="scene-variant-reference"
            className="input"
            placeholder={t("scene.variants.referenceImagePlaceholder")}
            value={form.referenceImagePath}
            onChange={(e) => setForm({ ...form, referenceImagePath: e.target.value })}
          />
        </div>

        {/* 8 维参数 */}
        <div className="border-t pt-3">
          <div className="text-xs font-semibold text-muted-foreground mb-2">
            {t("scene.variants.paramSection")}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {PARAM_FIELDS.map(({ key, labelKey }) => (
              <div key={key} className="space-y-1">
                <label htmlFor={`scene-variant-${key}`} className="text-xs">
                  {t(labelKey)}
                </label>
                <input
                  id={`scene-variant-${key}`}
                  className="input input-sm"
                  value={form[key] as string}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </div>
            ))}
          </div>
        </div>

        {/* 默认/正典 */}
        <div className="flex gap-4 border-t pt-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
            />
            <span className="text-sm">{t("scene.variants.isDefault")}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isCanonical}
              onChange={(e) => setForm({ ...form, isCanonical: e.target.checked })}
            />
            <span className="text-sm">{t("scene.variants.isCanonical")}</span>
          </label>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => onOpenChange(false)}
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onSubmit}
          disabled={!form.name.trim()}
          data-testid="scene-variant-submit"
        >
          {editingVariant ? t("common.save") : t("common.create")}
        </button>
      </div>
    </Modal>
  );
}
