"use client";

import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Story } from "@/domain/schemas";
import type { Result } from "@/domain/types";
import type { DeleteCheckResult } from "@/domain/services";
import { errorLogger } from "@/shared/error-logger";
import { confirm } from "@/shared/utils/confirm";
import type { SaveStatus } from "@/shared/presentation/SaveStatusIndicator";

interface EntityCRUDConfig<T extends { id: string; name: string; prompt: string }> {
  entity: T;
  setEntity: (update: T | ((prev: T) => T), shouldMarkDirty?: boolean) => void;
  generatedImage: string | null;
  setGeneratedImage: React.Dispatch<React.SetStateAction<string | null>>;
  resetCustomFields: () => void;
  applyImageToEntity: (entity: T, imageUrl: string) => T;
  prepareEntityForSave: (entity: T, prompt: string) => T;
  service: {
    create: (entity: T) => Promise<Result<T>>;
    update: (id: string, entity: T) => Promise<Result<void>>;
    delete: (id: string) => Promise<Result<void>>;
  };
  queryKey: string[];
  entityLabel: string;
  entityIdPrefix: string;
  nameValidationMessage: string;
  assetLabel: string;
  checkReferences: (id: string, name: string, stories: Story[]) => DeleteCheckResult;
  defaultEntity: T;
  generatePrompt: (entity: T) => string;
  addAssetToLibrary: (
    url: string, type: "image" | "video", name: string,
    boundTo?: { type: "character" | "scene"; id: string; name: string },
  ) => void;
  assetBindType: "character" | "scene";
  success: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;
  stories: Story[];
  markDirty: (key: string) => void;
  markClean: (key: string) => void;
  onUpdateStoriesAfterDelete: (entityId: string, stories: Story[]) => Promise<void>;
}

export function useEntityCRUD<T extends { id: string; name: string; prompt: string }>({
  entity,
  setEntity,
  generatedImage,
  setGeneratedImage,
  resetCustomFields,
  applyImageToEntity,
  prepareEntityForSave,
  service,
  queryKey,
  entityLabel,
  entityIdPrefix,
  nameValidationMessage,
  assetLabel,
  checkReferences,
  defaultEntity,
  generatePrompt,
  addAssetToLibrary,
  assetBindType,
  success,
  showError,
  stories,
  markDirty,
  markClean,
  onUpdateStoriesAfterDelete,
}: EntityCRUDConfig<T>) {
  const queryClient = useQueryClient();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [entityToDelete, setEntityToDelete] = useState<string | null>(null);
  const [referenceCheck, setReferenceCheck] = useState<DeleteCheckResult | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const savingRef = useRef(false);

  const handleSave = async () => {
    if (savingRef.current) return;
    savingRef.current = true;

    const trimmedName = (entity.name || "").trim();
    if (!trimmedName) {
      showError("保存失败", nameValidationMessage);
      return;
    }

    setSaveStatus("saving");
    setSaveError("");
    try {
      let newEntity: T = {
        ...entity,
        name: trimmedName,
        id: entity.id || `${entityIdPrefix}_${crypto.randomUUID()}`,
        prompt: generatePrompt(entity),
      };
      newEntity = prepareEntityForSave(newEntity, generatePrompt(entity));

      if (generatedImage) {
        newEntity = applyImageToEntity(newEntity, generatedImage);
      }

      if (entity.id) {
        const result = await service.update(newEntity.id, newEntity);
        if (!result.ok) throw result.error;
        success("保存成功", `${entityLabel}信息已更新`);
      } else {
        const result = await service.create(newEntity);
        if (!result.ok) throw result.error;
        if (generatedImage) {
          addAssetToLibrary(generatedImage, "image", newEntity.name || assetLabel, {
            type: assetBindType,
            id: result.value.id,
            name: newEntity.name || `未命名${entityLabel}`,
          });
        }
        success("创建成功", `新${entityLabel}已添加`);
      }

      queryClient.invalidateQueries({ queryKey });
      setEntity(newEntity);
      resetCustomFields();
      markClean(queryKey[0]);
      setGeneratedImage(null);
      setSaveStatus("saved");
    } catch (err) {
      errorLogger.error(`[${entityLabel}] Save failed`, err);
      const message = err instanceof Error ? err.message : "未知错误";
      markDirty(queryKey[0]);
      setSaveStatus("error");
      setSaveError(message);
      showError("保存失败", message);
    } finally {
      savingRef.current = false;
    }
  };

  const handleDelete = async (id: string) => {
    const checkResult = checkReferences(id, entity.name, stories);
    if (checkResult.references.length > 0) {
      setEntityToDelete(id);
      setReferenceCheck(checkResult);
      setDeleteDialogOpen(true);
    } else {
      const confirmed = await confirm({
        title: "确认删除",
        description: `确定删除${entityLabel}「${entity.name}」？此操作可通过恢复功能撤销`,
        confirmText: "删除",
        cancelText: "取消",
        variant: "danger",
      });
      if (confirmed) {
        performDelete(id);
      }
    }
  };

  const performDelete = async (id: string) => {
    setIsDeleting(true);
    try {
      const result = await service.delete(id);
      if (!result.ok) throw result.error;
      queryClient.invalidateQueries({ queryKey });

      if (entity.id === id) {
        setEntity(defaultEntity);
      }

      await onUpdateStoriesAfterDelete(id, stories);
      queryClient.invalidateQueries({ queryKey: ["stories"] });

      setDeleteDialogOpen(false);
      setEntityToDelete(null);
      setReferenceCheck(null);
      success("删除成功", `${entityLabel}已删除`);
    } catch (err) {
      showError("删除失败", err instanceof Error ? err.message : "未知错误");
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    deleteDialogOpen,
    setDeleteDialogOpen,
    entityToDelete,
    referenceCheck,
    handleSave,
    saveStatus,
    saveError,
    handleDelete,
    performDelete,
    isDeleting,
  };
}
