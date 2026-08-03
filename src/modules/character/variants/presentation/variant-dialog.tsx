/**
 * Task 2A.10 — VariantDialog 组件
 *
 * 角色侧包装：绑定 CharacterVariant 类型与 character.variants.* i18n 文案，
 * 实际表单逻辑复用共享泛型组件 @/shared/presentation/VariantDialog。
 *
 * 支持编辑变体的：
 *   - 基础字段：name / description / promptFragment
 *   - 默认/正典开关：isDefault / isCanonical
 *   - 8 维参数：timeOfDay / weather / lighting / mood / crowdLevel / cameraAngle / season / colorPalette
 *   - 参考图路径（referenceImagePath）
 */

import { t } from "@/shared/constants";
import {
  VariantDialog as SharedVariantDialog,
  variantToForm,
  type VariantFormState,
} from "@/shared/presentation/VariantDialog";
import type { CharacterVariant } from "@/domain/schemas";

export { variantToForm };
export type { VariantFormState };

interface VariantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingVariant: CharacterVariant | null;
  form: VariantFormState;
  setForm: (form: VariantFormState) => void;
  onSubmit: () => void;
}

export function VariantDialog({ editingVariant, ...rest }: VariantDialogProps) {
  return (
    <SharedVariantDialog
      {...rest}
      isEditing={editingVariant !== null}
      idPrefix="variant"
      strings={{
        editTitle: t("character.variants.editTitle"),
        addTitle: t("character.variants.addTitle"),
        subtitle: t("character.variants.subtitle"),
        close: t("common.close"),
        nameLabel: t("character.variants.nameLabel"),
        namePlaceholder: t("character.variants.namePlaceholder"),
        descriptionLabel: t("character.variants.descriptionLabel"),
        descriptionPlaceholder: t("character.variants.descriptionPlaceholder"),
        promptFragmentLabel: t("character.variants.promptFragmentLabel"),
        promptFragmentPlaceholder: t("character.variants.promptFragmentPlaceholder"),
        referenceImageLabel: t("character.variants.referenceImageLabel"),
        referenceImagePlaceholder: t("character.variants.referenceImagePlaceholder"),
        paramSection: t("character.variants.paramSection"),
        paramLabels: {
          timeOfDay: t("character.variants.param.timeOfDay"),
          weather: t("character.variants.param.weather"),
          lighting: t("character.variants.param.lighting"),
          mood: t("character.variants.param.mood"),
          crowdLevel: t("character.variants.param.crowdLevel"),
          cameraAngle: t("character.variants.param.cameraAngle"),
          season: t("character.variants.param.season"),
          colorPalette: t("character.variants.param.colorPalette"),
        },
        isDefault: t("character.variants.isDefault"),
        isCanonical: t("character.variants.isCanonical"),
        cancel: t("common.cancel"),
        save: t("common.save"),
        create: t("common.create"),
      }}
    />
  );
}
