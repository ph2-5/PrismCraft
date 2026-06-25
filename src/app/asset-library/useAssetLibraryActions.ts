import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Result } from "@/domain/types";
import {
  useCharacters,
} from "@/modules/character";
import {
  useScenes,
} from "@/modules/scene";
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
import { useStories, storyService } from "@/modules/story";
import { checkCharacterReferences, checkSceneReferences } from "@/domain/services";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { errorLogger } from "@/shared/error-logger";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import { confirm } from "@/shared/utils/confirm";
import { t } from "@/shared/constants/messages";
import { container } from "@/infrastructure/di";
import type {
  AssetLibraryType,
  ImportMode,
} from "@/domain/schemas";
import type { AssetTab, EditingItem } from "./AssetCardGrid";
import { fetchSecondaryData } from "./AssetCardGrid";

interface UseAssetLibraryActionsParams {
  activeTab: AssetTab;
  selectedIds: Set<string>;
  clearSelection: () => void;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSecondaryData: (data: { storyboards: import("@/domain/schemas").StoryboardAsset[]; collections: import("@/domain/schemas").Collection[]; collectionAssets: import("@/domain/schemas").CollectionAsset[] }) => void;
  setIsBatchDeleting: (v: boolean) => void;
  setIsAddingToCollection: (v: boolean) => void;
  setIsCollectionDialogOpen: (v: boolean) => void;
  setIsImportDialogOpen: (v: boolean) => void;
  setIsNewCollectionDialogOpen: (v: boolean) => void;
  setIsEditDialogOpen: (v: boolean) => void;
  setEditingItem: (item: EditingItem | null) => void;
  setIsSavingEdit: (v: boolean) => void;
  setIsCreatingCollection: (v: boolean) => void;
  setNewCollectionName: (v: string) => void;
  setAddToCollectionId: (v: string) => void;
  addToCollectionId: string;
  newCollectionName: string;
  editingItem: EditingItem | null;
  isBatchDeleting: boolean;
}

export function useAssetLibraryActions(params: UseAssetLibraryActionsParams) {
  const {
    activeTab,
    selectedIds,
    clearSelection,
    setSelectedIds,
    setSecondaryData,
    setIsBatchDeleting,
    setIsAddingToCollection,
    setIsCollectionDialogOpen,
    setIsImportDialogOpen,
    setIsNewCollectionDialogOpen,
    setIsEditDialogOpen,
    setEditingItem,
    setIsSavingEdit,
    setIsCreatingCollection,
    setNewCollectionName,
    addToCollectionId,
    newCollectionName,
    editingItem,
    isBatchDeleting,
  } = params;

  const { success, error: showError } = useToastHelpers();
  const queryClient = useQueryClient();
  const { data: characters = [] } = useCharacters();
  const { data: scenes = [] } = useScenes();
  const { data: stories = [] } = useStories();

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
      const deletedIds: string[] = [];
      const failedLabels: string[] = [];

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

      deleteResults.forEach((result, i) => {
        const id = ids[i]!;
        if (result.status === "fulfilled") {
          deletedIds.push(result.value);
        } else {
          errorLogger.warn("[AssetLibrary] Failed to delete asset", result.reason instanceof Error ? result.reason : undefined);
          const label = activeTab === "characters"
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
      const blob = new Blob([new Uint8Array(encodedResult.value)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `export-${activeTab}-${Date.now()}.asa`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
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
      const assetType: AssetLibraryType =
        activeTab === "characters"
          ? "character"
          : activeTab === "scenes"
            ? "scene"
            : "storyboard";
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
      const blob = new Blob([new Uint8Array(encodedResult.value)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `collection.asa`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      success(t("success.exported"), t("asset.collectionExported"));
    } catch (e) {
      showError(t("error.exportFailed"), mapUserFacingError(e));
    }
  }, [success, showError]);

  const handleDeleteCharacter = useCallback(async (id: string) => {
    const character = characters.find((c) => c.id === id);
    const checkResult = checkCharacterReferences(id, character?.name || id, stories);
    if (checkResult.references.length > 0) {
      const storyNames = [...new Set(checkResult.references.flatMap((r) => r.usedInStories))];
      if (!(await confirm(
        t("confirm.deleteCharacter"),
        t("asset.referencedByStories", { name: character?.name || id, stories: storyNames.join("、") }),
      ))) return;
    } else {
      if (!(await confirm(t("confirm.deleteCharacter"), t("confirm.deleteCharacterTitle")))) return;
    }
    try {
      const result = await characterService.delete(id);
      if (!result.ok) throw result.error;
      queryClient.invalidateQueries({ queryKey: ["characters"] });
      await updateStoriesAfterCharacterDelete(id);
      queryClient.invalidateQueries({ queryKey: ["stories"] });
      success(t("success.deleted"), t("success.assetDeleted"));
    } catch (e) {
      showError(t("error.deleteFailed"), mapUserFacingError(e));
    }
  }, [characters, stories, queryClient, success, showError]);

  const handleDeleteScene = useCallback(async (id: string) => {
    const scene = scenes.find((s) => s.id === id);
    const checkResult = checkSceneReferences(id, scene?.name || id, stories);
    if (checkResult.references.length > 0) {
      const storyNames = [...new Set(checkResult.references.flatMap((r) => r.usedInStories))];
      if (!(await confirm(
        t("confirm.deleteScene"),
        t("asset.referencedByStories", { name: scene?.name || id, stories: storyNames.join("、") }),
      ))) return;
    } else {
      if (!(await confirm(t("confirm.deleteScene"), t("confirm.deleteSceneTitle")))) return;
    }
    try {
      const result = await sceneService.delete(id);
      if (!result.ok) throw result.error;
      queryClient.invalidateQueries({ queryKey: ["scenes"] });
      await updateStoriesAfterSceneDelete(id);
      queryClient.invalidateQueries({ queryKey: ["stories"] });
      success(t("success.deleted"), t("success.assetDeleted"));
    } catch (e) {
      showError(t("error.deleteFailed"), mapUserFacingError(e));
    }
  }, [scenes, stories, queryClient, success, showError]);

  const handleDeleteStoryboard = useCallback(async (id: string) => {
    if (!(await confirm(t("confirm.deleteBeat"), t("confirm.deleteBeatTitle")))) return;
    try {
      await storyboardAssetService.remove(id);
      await loadSecondaryData();
      success(t("success.deleted"), t("success.assetDeleted"));
    } catch (e) {
      showError(t("error.deleteFailed"), mapUserFacingError(e));
    }
  }, [loadSecondaryData, showError, success]);

  const updateStoriesAfterCharacterDelete = useCallback(async (characterId: string) => {
    const updatedStories = stories.map((story) => {
      const updatedBeats = (story.beats || []).map((beat) => {
        const updated = { ...beat };
        if (updated.characterIds?.includes(characterId)) {
          updated.characterIds = updated.characterIds.filter((cid) => cid !== characterId);
        }
        return updated;
      });
      const updatedCharacters = (story.characters || []).filter((cid) => cid !== characterId);
      return { ...story, characters: updatedCharacters, beats: updatedBeats };
    });
    for (const updatedStory of updatedStories) {
      const original = stories.find((s) => s.id === updatedStory.id);
      const wasAffected = original?.beats?.some((b) => b.characterIds?.includes(characterId)) || original?.characters?.includes(characterId);
      if (wasAffected) {
        const result = await storyService.update(updatedStory.id, updatedStory);
        if (!result.ok) {
          errorLogger.warn("[AssetLibrary] 更新关联故事失败", { storyId: updatedStory.id, error: result.error });
        }
      }
    }
  }, [stories]);

  const updateStoriesAfterSceneDelete = useCallback(async (sceneId: string) => {
    const updatedStories = stories.map((story) => {
      const updatedBeats = (story.beats || []).map((beat) => {
        const updated = { ...beat };
        if (updated.sceneId === sceneId) delete updated.sceneId;
        return updated;
      });
      const updatedScenes = (story.scenes || []).filter((sid) => sid !== sceneId);
      return { ...story, scenes: updatedScenes, beats: updatedBeats };
    });
    for (const updatedStory of updatedStories) {
      const original = stories.find((s) => s.id === updatedStory.id);
      const wasAffected = original?.beats?.some((b) => b.sceneId === sceneId) || original?.scenes?.includes(sceneId);
      if (wasAffected) {
        const result = await storyService.update(updatedStory.id, updatedStory);
        if (!result.ok) {
          errorLogger.warn("[AssetLibrary] 更新关联故事失败", { storyId: updatedStory.id, error: result.error });
        }
      }
    }
  }, [stories]);

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
    loadSecondaryData,
    handleBatchDelete,
    handleBatchExport,
    handleAddToCollection,
    handleImport,
    handleCreateCollection,
    handleDeleteCollection,
    handleExportCollection,
    handleDeleteCharacter,
    handleDeleteScene,
    handleDeleteStoryboard,
    handleEditItem,
    handleSaveEdit,
  };
}
