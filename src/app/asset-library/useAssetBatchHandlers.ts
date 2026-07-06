import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Result } from "@/domain/types";
import type { AssetLibraryType, ImportMode } from "@/domain/schemas";
import {
  characterService,
} from "@/modules/character";
import {
  sceneService,
} from "@/modules/scene";
import {
  storyboardAssetService,
  collectionService,
  assetExportService,
} from "@/modules/asset";
import { useCharacters } from "@/modules/character";
import { useScenes } from "@/modules/scene";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { errorLogger } from "@/shared/error-logger";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import { confirm } from "@/shared/utils/confirm";
import { t } from "@/shared/constants/messages";
import type { AssetTab } from "./AssetCardGrid";
import { fetchSecondaryData } from "./AssetCardGrid";
import {
  resolveAssetLibraryType,
  downloadBinaryAsFile,
} from "./assetLibraryActions";

interface UseAssetBatchHandlersParams {
  selection: {
    activeTab: AssetTab;
    selectedIds: Set<string>;
    clearSelection: () => void;
    setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  };
  setSecondaryData: (data: { storyboards: import("@/domain/schemas").StoryboardAsset[]; collections: import("@/domain/schemas").Collection[]; collectionAssets: import("@/domain/schemas").CollectionAsset[] }) => void;
  dialogControls: {
    setIsCollectionDialogOpen: (v: boolean) => void;
    setIsImportDialogOpen: (v: boolean) => void;
    setIsAddingToCollection: (v: boolean) => void;
  };
  loadingControls: {
    setIsBatchDeleting: (v: boolean) => void;
    isBatchDeleting: boolean;
  };
  collectionForm: {
    addToCollectionId: string;
  };
}

export function useAssetBatchHandlers({
  selection: { activeTab, selectedIds, clearSelection, setSelectedIds },
  setSecondaryData,
  dialogControls: { setIsCollectionDialogOpen, setIsImportDialogOpen, setIsAddingToCollection },
  loadingControls: { setIsBatchDeleting, isBatchDeleting },
  collectionForm: { addToCollectionId },
}: UseAssetBatchHandlersParams) {
  const { success, error: showError } = useToastHelpers();
  const queryClient = useQueryClient();
  const { data: characters = [] } = useCharacters();
  const { data: scenes = [] } = useScenes();

  const loadSecondaryData = useCallback(async () => {
    try {
      const data = await fetchSecondaryData();
      setSecondaryData(data);
    } catch (err) {
      errorLogger.warn("Failed to load secondary data", err);
    }
  }, [setSecondaryData]);

  const handleBatchDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || isBatchDeleting) return;
    if (!(await confirm(t("confirm.deleteSelectedAssets", { count: ids.length }), t("confirm.batchDeleteAssets")))) return;
    setIsBatchDeleting(true);
    try {
      const deleteResults = await Promise.allSettled(
        ids.map(async (id) => {
          if (activeTab === "characters") {
            const result = await characterService.delete(id);
            if (!result.ok) throw new Error("delete_failed");
          } else if (activeTab === "scenes") {
            const result = await sceneService.delete(id);
            if (!result.ok) throw new Error("delete_failed");
          } else if (activeTab === "storyboards") {
            await storyboardAssetService.remove(id);
          }
          return id;
        }),
      );

      const deletedIds: string[] = [];
      const failedLabels: string[] = [];
      deleteResults.forEach((result, i) => {
        const id = ids[i]!;
        if (result.status === "fulfilled") {
          deletedIds.push(result.value);
        } else {
          errorLogger.warn("[AssetLibrary] Failed to delete asset", result.reason instanceof Error ? result.reason : undefined);
          const label =
            activeTab === "characters"
              ? characters.find((ch) => ch.id === id)?.name
              : activeTab === "scenes"
                ? scenes.find((sc) => sc.id === id)?.name
                : id.slice(0, 8);
          failedLabels.push(label || id.slice(0, 8));
        }
      });

      if (deletedIds.length > 0) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          deletedIds.forEach((id) => next.delete(id));
          return next;
        });
        queryClient.invalidateQueries({ queryKey: ["characters"] });
        queryClient.invalidateQueries({ queryKey: ["scenes"] });
        loadSecondaryData();
      }
      if (failedLabels.length > 0) {
        showError(t("asset.partialDeleteFailed"), t("asset.partialDeleteFailedDesc", { items: failedLabels.join("、") }));
      } else {
        success(t("success.deleted"), t("success.deletedCount", { count: deletedIds.length }));
      }
    } catch (e) {
      showError(t("error.deleteFailed"), mapUserFacingError(e));
    } finally {
      setIsBatchDeleting(false);
    }
  }, [selectedIds, isBatchDeleting, activeTab, characters, scenes, setIsBatchDeleting, setSelectedIds, queryClient, loadSecondaryData, success, showError]);

  const handleBatchExport = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      let encodedResult: Result<Uint8Array>;
      if (activeTab === "characters")
        encodedResult = await assetExportService.exportCharacters(ids);
      else if (activeTab === "scenes")
        encodedResult = await assetExportService.exportScenes(ids);
      else if (activeTab === "storyboards")
        encodedResult = await assetExportService.exportStoryboards(ids);
      else return;
      if (!encodedResult.ok) {
        showError(t("error.exportFailed"), mapUserFacingError(encodedResult.error));
        return;
      }
      downloadBinaryAsFile(encodedResult.value, `export-${activeTab}-${Date.now()}.asa`);
      clearSelection();
      success(t("success.exported"), t("asset.exportedCount", { count: ids.length }));
    } catch (e) {
      showError(t("error.exportFailed"), mapUserFacingError(e));
    }
  }, [selectedIds, activeTab, clearSelection, success, showError]);

  const handleAddToCollection = useCallback(async () => {
    if (!addToCollectionId || selectedIds.size === 0) return;
    setIsAddingToCollection(true);
    try {
      const assetType = resolveAssetLibraryType(activeTab) as AssetLibraryType;
      for (const id of selectedIds) {
        await collectionService.addAsset(addToCollectionId, assetType, id);
      }
      setIsCollectionDialogOpen(false);
      clearSelection();
      success(t("success.added"), t("asset.addedToCollection", { count: selectedIds.size }));
    } catch (e) {
      showError(t("error.uploadFailed"), mapUserFacingError(e));
    } finally {
      setIsAddingToCollection(false);
    }
  }, [addToCollectionId, selectedIds, activeTab, setIsAddingToCollection, setIsCollectionDialogOpen, clearSelection, success, showError]);

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await assetExportService.importFromFile(file, "skip" as ImportMode);
      if (!result.ok) {
        showError(t("error.importFailed"), mapUserFacingError(result.error));
      } else {
        if (result.value.errors.length > 0) {
          showError(t("asset.partialImportFailed"), result.value.errors.join("; "));
        }
        if (result.value.imported > 0) {
          success(t("success.imported"), t("asset.importedCount", { count: result.value.imported }));
        }
      }
      setIsImportDialogOpen(false);
    } catch (e) {
      showError(t("error.importFailed"), mapUserFacingError(e));
    }
    e.target.value = "";
  }, [setIsImportDialogOpen, success, showError]);

  return {
    loadSecondaryData,
    handleBatchDelete,
    handleBatchExport,
    handleAddToCollection,
    handleImport,
  };
}
