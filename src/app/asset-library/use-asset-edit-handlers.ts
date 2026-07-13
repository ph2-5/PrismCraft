import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  characterService,
} from "@/modules/character";
import {
  sceneService,
} from "@/modules/scene";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import { container } from "@/infrastructure/di";
import { t } from "@/shared/constants/messages";
import type { EditingItem } from "./AssetCardGrid";

interface UseAssetEditHandlersParams {
  editDialog: {
    editingItem: EditingItem | null;
    setEditingItem: (item: EditingItem | null) => void;
  };
  dialogControls: {
    setIsEditDialogOpen: (v: boolean) => void;
  };
  loadingControls: {
    setIsSavingEdit: (v: boolean) => void;
  };
  loadSecondaryData: () => Promise<void>;
}

export function useAssetEditHandlers({
  editDialog: { editingItem, setEditingItem },
  dialogControls: { setIsEditDialogOpen },
  loadingControls: { setIsSavingEdit },
  loadSecondaryData,
}: UseAssetEditHandlersParams) {
  const { success, error: showError } = useToastHelpers();
  const queryClient = useQueryClient();

  const handleEditItem = useCallback((item: EditingItem) => {
    setEditingItem(item);
    setIsEditDialogOpen(true);
  }, [setEditingItem, setIsEditDialogOpen]);

  const handleSaveEdit = useCallback(async () => {
    if (!editingItem) return;
    setIsSavingEdit(true);
    try {
      if (editingItem._type === "character") {
        const result = await characterService.update(editingItem.id, {
          id: editingItem.id,
          name: editingItem.name,
          description: editingItem.description,
          tags: editingItem.tags,
        });
        if (!result.ok) throw result.error;
      } else if (editingItem._type === "scene") {
        const result = await sceneService.update(editingItem.id, {
          id: editingItem.id,
          name: editingItem.name,
          description: editingItem.description,
          tags: editingItem.tags,
          atmosphere: editingItem.atmosphere,
        });
        if (!result.ok) throw result.error;
      } else if (editingItem._type === "storyboard") {
        await container.storyboardStorage.createStoryboardAsset({
          id: editingItem.id,
          script: editingItem.script,
          duration: editingItem.duration,
          shotType: editingItem.shotType,
        });
      }
      setIsEditDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["characters"] });
      queryClient.invalidateQueries({ queryKey: ["scenes"] });
      loadSecondaryData();
      success(t("success.saved"), t("success.assetUpdated"));
    } catch (e) {
      showError(t("error.saveFailed"), mapUserFacingError(e));
    } finally {
      setIsSavingEdit(false);
    }
  }, [editingItem, setIsSavingEdit, setIsEditDialogOpen, queryClient, loadSecondaryData, success, showError]);

  return {
    handleEditItem,
    handleSaveEdit,
  };
}
