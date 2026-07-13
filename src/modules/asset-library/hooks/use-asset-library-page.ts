import { useState, useCallback, useRef } from "react";
import { useCharacters } from "@/modules/character";
import { useScenes } from "@/modules/scene";
import type { ImportMode } from "@/domain/schemas";
import type { AssetTab } from "../AssetCardGrid";
import { useAssetLibraryActions } from "../use-asset-library-actions";
import { useAssetFiltering } from "./use-asset-filtering";
import { useSecondaryDataLoader } from "./use-secondary-data-loader";
import { useAssetDialogState } from "./use-asset-dialog-state";

export function useAssetLibraryPage() {
  const { data: characters = [], isLoading: charactersLoading } = useCharacters();
  const { data: scenes = [], isLoading: scenesLoading } = useScenes();

  const [activeTab, setActiveTab] = useState<AssetTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importMode, setImportMode] = useState<ImportMode>("skip");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    storyboards,
    collections,
    collectionAssets,
    secondaryDataLoading,
    setSecondaryData,
  } = useSecondaryDataLoader();

  const dialogState = useAssetDialogState();

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const actions = useAssetLibraryActions({
    selection: { activeTab, selectedIds, clearSelection, setSelectedIds },
    setSecondaryData,
    dialogControls: {
      setIsCollectionDialogOpen: dialogState.setIsCollectionDialogOpen,
      setIsImportDialogOpen: dialogState.setIsImportDialogOpen,
      setIsNewCollectionDialogOpen: dialogState.setIsNewCollectionDialogOpen,
      setIsEditDialogOpen: dialogState.setIsEditDialogOpen,
      setIsAddingToCollection: dialogState.setIsAddingToCollection,
    },
    loadingControls: {
      setIsBatchDeleting: dialogState.setIsBatchDeleting,
      setIsSavingEdit: dialogState.setIsSavingEdit,
      setIsCreatingCollection: dialogState.setIsCreatingCollection,
      isBatchDeleting: dialogState.isBatchDeleting,
    },
    editDialog: {
      editingItem: dialogState.editingItem,
      setEditingItem: dialogState.setEditingItem,
    },
    collectionForm: {
      addToCollectionId: dialogState.addToCollectionId,
      newCollectionName: dialogState.newCollectionName,
      setNewCollectionName: dialogState.setNewCollectionName,
    },
  });

  const { filteredCharacters, filteredScenes, filteredStoryboards, currentItems } =
    useAssetFiltering({ activeTab, searchQuery, characters, scenes, storyboards, collections });

  const handleTabChange = useCallback((v: string) => {
    setActiveTab(v as AssetTab);
    clearSelection();
    setSearchQuery("");
  }, [clearSelection]);

  const handleSelectAll = useCallback(() => {
    selectAll(currentItems.map((i: { id: string }) => i.id));
  }, [selectAll, currentItems]);

  return {
    // Data
    characters,
    scenes,
    storyboards,
    collections,
    collectionAssets,
    filteredCharacters,
    filteredScenes,
    filteredStoryboards,
    currentItems,

    // Loading states
    charactersLoading,
    scenesLoading,
    secondaryDataLoading,
    isBatchDeleting: dialogState.isBatchDeleting,
    isSavingEdit: dialogState.isSavingEdit,
    isAddingToCollection: dialogState.isAddingToCollection,
    isCreatingCollection: dialogState.isCreatingCollection,

    // Tab & search
    activeTab,
    searchQuery,
    setSearchQuery,
    handleTabChange,

    // Selection
    selectedIds,
    toggleSelect,
    clearSelection,
    handleSelectAll,

    // Dialog states
    isEditDialogOpen: dialogState.isEditDialogOpen,
    setIsEditDialogOpen: dialogState.setIsEditDialogOpen,
    isCollectionDialogOpen: dialogState.isCollectionDialogOpen,
    setIsCollectionDialogOpen: dialogState.setIsCollectionDialogOpen,
    isImportDialogOpen: dialogState.isImportDialogOpen,
    setIsImportDialogOpen: dialogState.setIsImportDialogOpen,
    isNewCollectionDialogOpen: dialogState.isNewCollectionDialogOpen,
    setIsNewCollectionDialogOpen: dialogState.setIsNewCollectionDialogOpen,

    // Edit dialog
    editingItem: dialogState.editingItem,
    handleEditingItemChange: dialogState.handleEditingItemChange,

    // Collection dialogs
    addToCollectionId: dialogState.addToCollectionId,
    setAddToCollectionId: dialogState.setAddToCollectionId,
    newCollectionName: dialogState.newCollectionName,
    setNewCollectionName: dialogState.setNewCollectionName,
    importMode,
    setImportMode,

    // Refs
    fileInputRef,

    // Actions
    handleOpenImportDialog: dialogState.handleOpenImportDialog,
    handleOpenCollectionDialog: dialogState.handleOpenCollectionDialog,
    handleNewCollection: dialogState.handleNewCollection,
    handleImport: actions.handleImport,
    handleBatchDelete: actions.handleBatchDelete,
    handleBatchExport: actions.handleBatchExport,
    handleAddToCollection: actions.handleAddToCollection,
    handleCreateCollection: actions.handleCreateCollection,
    handleDeleteCharacter: actions.handleDeleteCharacter,
    handleDeleteScene: actions.handleDeleteScene,
    handleDeleteStoryboard: actions.handleDeleteStoryboard,
    handleDeleteCollection: actions.handleDeleteCollection,
    handleExportCollection: actions.handleExportCollection,
    handleEditItem: actions.handleEditItem,
    handleSaveEdit: actions.handleSaveEdit,
  };
}
