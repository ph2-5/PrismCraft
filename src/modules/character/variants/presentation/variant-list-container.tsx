/**
 * Task 2A.10 — VariantListContainer
 *
 * VariantList 的容器组件，自管理 state（无需父组件注入 handlers）。
 * 在角色页面中独立显示，与现有 OutfitList 并存（向后兼容）。
 *
 * 使用：
 *   <VariantListContainer characterId={characterId} />
 */

import { useState, useCallback } from "react";
import { t } from "@/shared/constants";
import { errorLogger } from "@/shared/error-logger";
import { confirm } from "@/shared/utils/confirm";
import {
  useCharacterVariants,
  useCreateVariant,
  useUpdateVariant,
  useDeleteVariant,
  useSetDefaultVariant,
} from "../hooks/use-character-variants";
import { VariantList } from "./variant-list";
import { VariantDialog, variantToForm, type VariantFormState } from "./variant-dialog";
import type { CharacterVariant } from "@/domain/schemas";

interface VariantListContainerProps {
  characterId: string;
  /** 可选：当生成图按钮点击时，由父组件提供更丰富的生成流程（如打开 Compositor） */
  onOpenInCompositor?: (variant: CharacterVariant) => void;
}

export function VariantListContainer({
  characterId,
  onOpenInCompositor,
}: VariantListContainerProps) {
  const { data: variants = [], isLoading } = useCharacterVariants(characterId);
  const createMutation = useCreateVariant();
  const updateMutation = useUpdateVariant();
  const deleteMutation = useDeleteVariant();
  const setDefaultMutation = useSetDefaultVariant();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVariant, setEditingVariant] = useState<CharacterVariant | null>(null);
  const [form, setForm] = useState<VariantFormState>(variantToForm());

  const handleAdd = useCallback(() => {
    setEditingVariant(null);
    setForm(variantToForm());
    setDialogOpen(true);
  }, []);

  const handleEdit = useCallback((variant: CharacterVariant) => {
    setEditingVariant(variant);
    setForm(variantToForm(variant));
    setDialogOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (variant: CharacterVariant) => {
      // P1-6: 使用项目统一的 confirm 工具（替代浏览器原生 confirm），保持 UI 一致性
      const ok = await confirm({
        title: t("character.variants.deleteConfirmTitle"),
        description: t("character.variants.deleteConfirmDesc", { name: variant.name }),
        variant: "danger",
      });
      if (!ok) return;
      try {
        await deleteMutation.mutateAsync(variant.id);
      } catch (err) {
        errorLogger.warn("[VariantList] 删除变体失败", err);
      }
    },
    [deleteMutation],
  );

  const handleSetDefault = useCallback(
    async (variant: CharacterVariant) => {
      try {
        await setDefaultMutation.mutateAsync({
          characterId: variant.characterId,
          variantId: variant.id,
        });
      } catch (err) {
        errorLogger.warn("[VariantList] 设置默认变体失败", err);
      }
    },
    [setDefaultMutation],
  );

  const handleGenerateImage = useCallback(
    async (_variant: CharacterVariant) => {
      // 简化实现：触发 Compositor（如果父组件提供了 onOpenInCompositor）
      // 完整的生成图流程由 Compositor 模块负责
      if (onOpenInCompositor) {
        onOpenInCompositor(_variant);
      } else {
        // 后续可集成 imageProvider.generateImage 直接生成
        errorLogger.warn("[VariantList] 未提供 onOpenInCompositor，无法生成图");
      }
    },
    [onOpenInCompositor],
  );

  const handleSubmit = useCallback(async () => {
    if (!form.name.trim()) return;
    try {
      if (editingVariant) {
        await updateMutation.mutateAsync({
          id: editingVariant.id,
          patch: {
            name: form.name,
            description: form.description,
            promptFragment: form.promptFragment,
            referenceImagePath: form.referenceImagePath || undefined,
            isDefault: form.isDefault,
            isCanonical: form.isCanonical,
            timeOfDay: form.timeOfDay || undefined,
            weather: form.weather || undefined,
            lighting: form.lighting || undefined,
            mood: form.mood || undefined,
            crowdLevel: form.crowdLevel || undefined,
            cameraAngle: form.cameraAngle || undefined,
            season: form.season || undefined,
            colorPalette: form.colorPalette || undefined,
          },
        });
      } else {
        await createMutation.mutateAsync({
          characterId,
          name: form.name,
          description: form.description,
          promptFragment: form.promptFragment,
          referenceImagePath: form.referenceImagePath || undefined,
          isDefault: form.isDefault,
          isCanonical: form.isCanonical,
          timeOfDay: form.timeOfDay || undefined,
          weather: form.weather || undefined,
          lighting: form.lighting || undefined,
          mood: form.mood || undefined,
          crowdLevel: form.crowdLevel || undefined,
          cameraAngle: form.cameraAngle || undefined,
          season: form.season || undefined,
          colorPalette: form.colorPalette || undefined,
          metadata: {},
        });
      }
      setDialogOpen(false);
    } catch (err) {
      errorLogger.warn("[VariantList] 保存变体失败", err);
    }
  }, [form, editingVariant, characterId, updateMutation, createMutation]);

  if (isLoading) {
    return (
      <div className="card">
        <div className="section-label">{t("character.variants.title")}</div>
        <div className="text-center p-4 text-muted-foreground text-sm">
          {t("common.loading")}
        </div>
      </div>
    );
  }

  return (
    <>
      <VariantList
        variants={variants}
        isGenerating={null}
        onAddVariant={handleAdd}
        onEditVariant={handleEdit}
        onDeleteVariant={handleDelete}
        onSetDefaultVariant={handleSetDefault}
        onGenerateVariantImage={handleGenerateImage}
        onOpenInCompositor={(v: CharacterVariant) => onOpenInCompositor?.(v)}
      />
      <VariantDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingVariant={editingVariant}
        form={form}
        setForm={setForm}
        onSubmit={handleSubmit}
      />
    </>
  );
}
