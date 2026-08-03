/**
 * Q3-1 — SceneVariantDialog 组件
 *
 * 场景侧包装：绑定 SceneVariant 类型与 scene.variants.* i18n 文案，
 * 实际表单逻辑复用共享泛型组件 @/shared/presentation/VariantDialog。
 *
 * 支持编辑场景变体的：
 *   - 基础字段：name / description / promptFragment
 *   - 默认/正典开关：isDefault / isCanonical
 *   - 8 维参数：timeOfDay / weather / lighting / mood / crowdLevel / cameraAngle / season / colorPalette
 *   - 参考图路径（referenceImagePath）
 */

import { t } from "@/shared/constants";
import {
  VariantDialog as SharedVariantDialog,
  variantToForm,
  type VariantFormState as SharedVariantFormState,
} from "@/shared/presentation/VariantDialog";
import type { SceneVariant } from "@/domain/schemas";

export { variantToForm };
/** 场景变体表单状态（与共享 VariantFormState 结构一致） */
export type SceneVariantFormState = SharedVariantFormState;

interface SceneVariantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingVariant: SceneVariant | null;
  form: SceneVariantFormState;
  setForm: (form: SceneVariantFormState) => void;
  onSubmit: () => void;
}

export function SceneVariantDialog({ editingVariant, ...rest }: SceneVariantDialogProps) {
  return (
    <SharedVariantDialog
      {...rest}
      isEditing={editingVariant !== null}
      idPrefix="scene-variant"
      strings={{
        editTitle: t("scene.variants.editTitle"),
        addTitle: t("scene.variants.addTitle"),
        subtitle: t("scene.variants.subtitle"),
        close: t("common.close"),
        nameLabel: t("scene.variants.nameLabel"),
        namePlaceholder: t("scene.variants.namePlaceholder"),
        descriptionLabel: t("scene.variants.descriptionLabel"),
        descriptionPlaceholder: t("scene.variants.descriptionPlaceholder"),
        promptFragmentLabel: t("scene.variants.promptFragmentLabel"),
        promptFragmentPlaceholder: t("scene.variants.promptFragmentPlaceholder"),
        referenceImageLabel: t("scene.variants.referenceImageLabel"),
        referenceImagePlaceholder: t("scene.variants.referenceImagePlaceholder"),
        paramSection: t("scene.variants.paramSection"),
        paramLabels: {
          timeOfDay: t("scene.variants.param.timeOfDay"),
          weather: t("scene.variants.param.weather"),
          lighting: t("scene.variants.param.lighting"),
          mood: t("scene.variants.param.mood"),
          crowdLevel: t("scene.variants.param.crowdLevel"),
          cameraAngle: t("scene.variants.param.cameraAngle"),
          season: t("scene.variants.param.season"),
          colorPalette: t("scene.variants.param.colorPalette"),
        },
        isDefault: t("scene.variants.isDefault"),
        isCanonical: t("scene.variants.isCanonical"),
        cancel: t("common.cancel"),
        save: t("common.save"),
        create: t("common.create"),
      }}
    />
  );
}
