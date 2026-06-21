import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Story } from "@/domain/schemas";
import type { Result } from "@/domain/types";
import type { DeleteCheckResult } from "@/domain/services";
import { errorLogger } from "@/shared/error-logger";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import { confirm } from "@/shared/utils/confirm";
import { t } from "@/shared/constants/messages";
import type { SaveStatus } from "@/shared/presentation/SaveStatusIndicator";

export interface EntityCRUDConfig<T extends { id: string; name: string; prompt: string }> {
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

    const trimmedName = (entity.name || "").trim();
    // name 为空时自动生成 "未命名{label}" + 时间戳后缀，避免阻断保存流程
    const finalName = trimmedName || `${t("crud.unnamed", { label: entityLabel })}_${Date.now()}`;

    savingRef.current = true;
    setSaveStatus("saving");
    setSaveError("");
    try {
      let newEntity: T = {
        ...entity,
        name: finalName,
        id: entity.id || `${entityIdPrefix}_${crypto.randomUUID()}`,
        prompt: generatePrompt(entity),
      };
      newEntity = prepareEntityForSave(newEntity, generatePrompt(entity));

      if (generatedImage) {
        newEntity = applyImageToEntity(newEntity, generatedImage);
      }

      let savedEntity: T = newEntity;

      if (entity.id) {
        const result = await service.update(newEntity.id, newEntity);
        if (!result.ok) throw result.error;
        success(t("success.saved"), t("crud.infoUpdated", { label: entityLabel }));
      } else {
        const result = await service.create(newEntity);
        if (!result.ok) throw result.error;
        savedEntity = result.value ?? newEntity;
        if (generatedImage) {
          addAssetToLibrary(generatedImage, "image", newEntity.name || assetLabel, {
            type: assetBindType,
            id: savedEntity.id,
            name: newEntity.name || t("crud.unnamed", { label: entityLabel }),
          });
        }
        success(t("success.created"), t("crud.added", { label: entityLabel }));
      }

      queryClient.invalidateQueries({ queryKey });
      setEntity(savedEntity);
      resetCustomFields();
      const cleanKey = queryKey[0];
      if (cleanKey) markClean(cleanKey);
      setGeneratedImage(null);
      setSaveStatus("saved");
    } catch (err) {
      errorLogger.error(`[${entityLabel}] Save failed`, err);
      const message = err instanceof Error ? err.message : t("error.unknown");
      const dirtyKey = queryKey[0];
      if (dirtyKey) markDirty(dirtyKey);
      setSaveStatus("error");
      setSaveError(message);
      showError(t("error.saveFailed"), message);
    } finally {
      savingRef.current = false;
    }
  };

  const handleDelete = async (id: string, entityName?: string) => {
    const deleteName = entityName || entity.name;
    const checkResult = checkReferences(id, deleteName, stories);
    if (checkResult.references.length > 0) {
      setEntityToDelete(id);
      setReferenceCheck(checkResult);
      setDeleteDialogOpen(true);
    } else {
      const confirmed = await confirm({
        title: t("confirm.deleteTitle"),
        description: t("crud.confirmDelete", { label: entityLabel, name: deleteName }),
        confirmText: t("common.delete"),
        cancelText: t("common.cancel"),
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
      success(t("success.deleted"), t("crud.deleted", { label: entityLabel }));
    } catch (err) {
      showError(t("error.deleteFailed"), mapUserFacingError(err));
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
