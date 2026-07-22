/**
 * Q3-1 — SceneVariantListContainer
 *
 * 对称 character/variants/presentation/variant-list-container.tsx。
 * SceneVariantList 的容器组件，自管理 state（无需父组件注入 handlers）。
 *
 * 使用：
 *   <SceneVariantListContainer sceneId={sceneId} />
 */

import { useState, useCallback } from "react";
import { t } from "@/shared/constants";
import { errorLogger } from "@/shared/error-logger";
import { confirm } from "@/shared/utils/confirm";
import {
  useSceneVariants,
  useCreateSceneVariant,
  useUpdateSceneVariant,
  useDeleteSceneVariant,
  useSetDefaultSceneVariant,
} from "../hooks/use-scene-variants";
import { SceneVariantList } from "./variant-list";
import { SceneVariantDialog, variantToForm, type SceneVariantFormState } from "./variant-dialog";
import type { SceneVariant } from "@/domain/schemas";

interface SceneVariantListContainerProps {
  sceneId: string;
  /** 可选：当生成图按钮点击时，由父组件提供更丰富的生成流程（如打开 Compositor） */
  onOpenInCompositor?: (variant: SceneVariant) => void;
}

export function SceneVariantListContainer({
  sceneId,
  onOpenInCompositor,
}: SceneVariantListContainerProps) {
  const { data: variants = [], isLoading } = useSceneVariants(sceneId);
  const createMutation = useCreateSceneVariant();
  const updateMutation = useUpdateSceneVariant();
  const deleteMutation = useDeleteSceneVariant();
  const setDefaultMutation = useSetDefaultSceneVariant();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVariant, setEditingVariant] = useState<SceneVariant | null>(null);
  const [form, setForm] = useState<SceneVariantFormState>(variantToForm());

  const handleAdd = useCallback(() => {
    setEditingVariant(null);
    setForm(variantToForm());
    setDialogOpen(true);
  }, []);

  const handleEdit = useCallback((variant: SceneVariant) => {
    setEditingVariant(variant);
    setForm(variantToForm(variant));
    setDialogOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (variant: SceneVariant) => {
      const ok = await confirm({
        title: t("scene.variants.deleteConfirmTitle"),
        description: t("scene.variants.deleteConfirmDesc", { name: variant.name }),
        variant: "danger",
      });
      if (!ok) return;
      try {
        await deleteMutation.mutateAsync(variant.id);
      } catch (err) {
        errorLogger.warn("[SceneVariantList] 删除变体失败", err);
      }
    },
    [deleteMutation],
  );

  const handleSetDefault = useCallback(
    async (variant: SceneVariant) => {
      try {
        await setDefaultMutation.mutateAsync({
          sceneId: variant.sceneId,
          variantId: variant.id,
        });
      } catch (err) {
        errorLogger.warn("[SceneVariantList] 设置默认变体失败", err);
      }
    },
    [setDefaultMutation],
  );

  const handleGenerateImage = useCallback(
    async (_variant: SceneVariant) => {
      if (onOpenInCompositor) {
        onOpenInCompositor(_variant);
      } else {
        errorLogger.warn("[SceneVariantList] 未提供 onOpenInCompositor，无法生成图");
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
          sceneId,
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
      errorLogger.warn("[SceneVariantList] 保存变体失败", err);
    }
  }, [form, editingVariant, sceneId, updateMutation, createMutation]);

  if (isLoading) {
    return (
      <div className="card">
        <div className="section-label">{t("scene.variants.title")}</div>
        <div className="text-center p-4 text-muted-foreground text-sm">
          {t("common.loading")}
        </div>
      </div>
    );
  }

  return (
    <>
      <SceneVariantList
        variants={variants}
        isGenerating={null}
        onAddVariant={handleAdd}
        onEditVariant={handleEdit}
        onDeleteVariant={handleDelete}
        onSetDefaultVariant={handleSetDefault}
        onGenerateVariantImage={handleGenerateImage}
        onOpenInCompositor={(v: SceneVariant) => onOpenInCompositor?.(v)}
      />
      <SceneVariantDialog
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
