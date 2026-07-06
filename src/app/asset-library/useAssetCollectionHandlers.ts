import { useCallback } from "react";
import {
  collectionService,
  assetExportService,
} from "@/modules/asset";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import { confirm } from "@/shared/utils/confirm";
import { t } from "@/shared/constants/messages";
import { downloadBinaryAsFile } from "./assetLibraryActions";

interface UseAssetCollectionHandlersParams {
  dialogControls: {
    setIsNewCollectionDialogOpen: (v: boolean) => void;
  };
  loadingControls: {
    setIsCreatingCollection: (v: boolean) => void;
  };
  collectionForm: {
    newCollectionName: string;
    setNewCollectionName: (v: string) => void;
  };
  loadSecondaryData: () => Promise<void>;
}

export function useAssetCollectionHandlers({
  dialogControls: { setIsNewCollectionDialogOpen },
  loadingControls: { setIsCreatingCollection },
  collectionForm: { newCollectionName, setNewCollectionName },
  loadSecondaryData,
}: UseAssetCollectionHandlersParams) {
  const { success, error: showError } = useToastHelpers();

  const handleCreateCollection = useCallback(async () => {
    if (!newCollectionName.trim()) {
      showError(t("asset.inputError"), t("asset.enterCollectionName"));
      return;
    }
    setIsNewCollectionDialogOpen(false);
    setIsCreatingCollection(true);
    try {
      await collectionService.create(newCollectionName.trim());
      setNewCollectionName("");
      success(t("success.created"), t("success.collectionCreated"));
    } catch (e) {
      showError(t("asset.createFailed"), mapUserFacingError(e));
    } finally {
      setIsCreatingCollection(false);
    }
  }, [newCollectionName, setIsNewCollectionDialogOpen, setIsCreatingCollection, setNewCollectionName, success, showError]);

  const handleDeleteCollection = useCallback(async (id: string) => {
    if (!(await confirm(t("confirm.deleteCollection"), t("confirm.deleteCollectionTitle")))) return;
    try {
      await collectionService.remove(id);
      loadSecondaryData();
      success(t("success.deleted"), t("success.collectionDeleted"));
    } catch (e) {
      showError(t("error.deleteFailed"), mapUserFacingError(e));
    }
  }, [loadSecondaryData, success, showError]);

  const handleExportCollection = useCallback(async (id: string) => {
    try {
      const encodedResult = await assetExportService.exportCollections([id]);
      if (!encodedResult.ok) {
        showError(t("error.exportFailed"), mapUserFacingError(encodedResult.error));
        return;
      }
      downloadBinaryAsFile(encodedResult.value, `collection.asa`);
      success(t("success.exported"), t("asset.collectionExported"));
    } catch (e) {
      showError(t("error.exportFailed"), mapUserFacingError(e));
    }
  }, [success, showError]);

  return {
    handleCreateCollection,
    handleDeleteCollection,
    handleExportCollection,
  };
}
