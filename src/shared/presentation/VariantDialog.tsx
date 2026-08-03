/**
 * 泛型变体编辑对话框（character/scene variants 共用）
 *
 * character/variants/presentation/variant-dialog.tsx 与 scene 侧对应文件
 * 曾为对称复制（各 ~260 行，仅类型/i18n 前缀/表单元素 id 前缀不同）。
 * 本组件抽取公共表单逻辑，差异通过 props 注入：
 *   - strings：i18n 文案（由调用方用 t() 解析后传入）
 *   - idPrefix：表单元素 id / data-testid 前缀（"variant" | "scene-variant"）
 *   - isEditing：编辑模式（决定标题/按钮文案）
 *
 * 支持编辑变体的：
 *   - 基础字段：name / description / promptFragment
 *   - 默认/正典开关：isDefault / isCanonical
 *   - 8 维参数：timeOfDay / weather / lighting / mood / crowdLevel / cameraAngle / season / colorPalette
 *   - 参考图路径（referenceImagePath）
 */

import { X } from "lucide-react";
import { Modal } from "@/shared/presentation/Modal";

/** 变体表单状态（character / scene 结构一致） */
export interface VariantFormState {
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

/** 字符串字段（与 VariantFormState 同名） */
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

/** 布尔字段（与 VariantFormState 同名） */
const VARIANT_BOOLEAN_FIELDS = [
  "isDefault",
  "isCanonical",
] as const;

/** 8 维参数表单字段（顺序即渲染顺序） */
const PARAM_FIELDS = [
  "timeOfDay",
  "weather",
  "lighting",
  "mood",
  "crowdLevel",
  "cameraAngle",
  "season",
  "colorPalette",
] as const;

/** CharacterVariant / SceneVariant 均可赋值的宽类型（仅用于提取同名表单字段） */
type VariantLike = Partial<Record<keyof VariantFormState, unknown>>;

/** 将变体对象转换为表单状态（CharacterVariant / SceneVariant 通用） */
export function variantToForm(v?: VariantLike): VariantFormState {
  const form: VariantFormState = {
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

/** 变体对话框所需的 i18n 文案（由调用方用 t() 解析） */
export interface VariantDialogStrings {
  editTitle: string;
  addTitle: string;
  subtitle: string;
  close: string;
  nameLabel: string;
  namePlaceholder: string;
  descriptionLabel: string;
  descriptionPlaceholder: string;
  promptFragmentLabel: string;
  promptFragmentPlaceholder: string;
  referenceImageLabel: string;
  referenceImagePlaceholder: string;
  paramSection: string;
  /** 8 维参数字段标签（key 为 VariantFormState 字符串字段名） */
  paramLabels: Record<(typeof PARAM_FIELDS)[number], string>;
  isDefault: string;
  isCanonical: string;
  cancel: string;
  save: string;
  create: string;
}

export interface VariantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 是否为编辑模式（编辑已有变体时标题/按钮使用编辑文案） */
  isEditing: boolean;
  form: VariantFormState;
  setForm: (form: VariantFormState) => void;
  onSubmit: () => void;
  /** i18n 文案（由调用方用 t() 解析后传入） */
  strings: VariantDialogStrings;
  /** 表单元素 id / data-testid 前缀（"variant" | "scene-variant"） */
  idPrefix: string;
}

export function VariantDialog({
  open,
  onOpenChange,
  isEditing,
  form,
  setForm,
  onSubmit,
  strings,
  idPrefix,
}: VariantDialogProps) {
  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      ariaLabel={isEditing ? strings.editTitle : strings.addTitle}
      style={{ maxWidth: "36rem" }}
    >
      <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>
            {isEditing ? strings.editTitle : strings.addTitle}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>
            {strings.subtitle}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={() => onOpenChange(false)}
          aria-label={strings.close}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-4 py-2">
        {/* 名称 */}
        <div className="space-y-2">
          <label htmlFor={`${idPrefix}-name`} className="text-sm font-medium">
            {strings.nameLabel}
          </label>
          <input
            id={`${idPrefix}-name`}
            className="input"
            data-testid={`${idPrefix}-name-input`}
            placeholder={strings.namePlaceholder}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>

        {/* 描述 */}
        <div className="space-y-2">
          <label htmlFor={`${idPrefix}-description`} className="text-sm font-medium">
            {strings.descriptionLabel}
          </label>
          <textarea
            id={`${idPrefix}-description`}
            className="textarea"
            placeholder={strings.descriptionPlaceholder}
            rows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>

        {/* Prompt 片段 */}
        <div className="space-y-2">
          <label htmlFor={`${idPrefix}-prompt`} className="text-sm font-medium">
            {strings.promptFragmentLabel}
          </label>
          <textarea
            id={`${idPrefix}-prompt`}
            className="textarea"
            placeholder={strings.promptFragmentPlaceholder}
            rows={3}
            value={form.promptFragment}
            onChange={(e) => setForm({ ...form, promptFragment: e.target.value })}
          />
        </div>

        {/* 参考图路径 */}
        <div className="space-y-2">
          <label htmlFor={`${idPrefix}-reference`} className="text-sm font-medium">
            {strings.referenceImageLabel}
          </label>
          <input
            id={`${idPrefix}-reference`}
            className="input"
            placeholder={strings.referenceImagePlaceholder}
            value={form.referenceImagePath}
            onChange={(e) => setForm({ ...form, referenceImagePath: e.target.value })}
          />
        </div>

        {/* 8 维参数 */}
        <div className="border-t pt-3">
          <div className="text-xs font-semibold text-muted-foreground mb-2">
            {strings.paramSection}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {PARAM_FIELDS.map((key) => (
              <div key={key} className="space-y-1">
                <label htmlFor={`${idPrefix}-${key}`} className="text-xs">
                  {strings.paramLabels[key]}
                </label>
                <input
                  id={`${idPrefix}-${key}`}
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
            <span className="text-sm">{strings.isDefault}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isCanonical}
              onChange={(e) => setForm({ ...form, isCanonical: e.target.checked })}
            />
            <span className="text-sm">{strings.isCanonical}</span>
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
          {strings.cancel}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onSubmit}
          disabled={!form.name.trim()}
          data-testid={`${idPrefix}-submit`}
        >
          {isEditing ? strings.save : strings.create}
        </button>
      </div>
    </Modal>
  );
}
