import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useCharacters } from "@/modules/character";
import { useScenes } from "@/modules/scene";
import { errorLogger } from "@/shared/error-logger";
import { isElectron } from "@/shared/utils/platform";
import type {
  StoryboardAsset,
  Collection,
  CollectionAsset,
  ImportMode,
} from "@/domain/schemas";
import { fetchSecondaryData } from "../AssetCardGrid";
import type { AssetTab, EditingItem } from "../AssetCardGrid";
import { useAssetLibraryActions } from "../useAssetLibraryActions";

export function useAssetLibraryPage() {
  const { data: characters = [], isLoading: charactersLoading } = useCharacters();
  const { data: scenes = [], isLoading: scenesLoading } = useScenes();

  const [activeTab, setActiveTab] = useState<AssetTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importMode, setImportMode] = useState<ImportMode>("skip");

  const [storyboards, setStoryboards] = useState<StoryboardAsset[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionAssets, setCollectionAssets] = useState<CollectionAsset[]>([]);
  const [secondaryDataLoading, setSecondaryDataLoading] = useState(true);

  const setSecondaryData = useCallback((data: { storyboards: StoryboardAsset[]; collections: Collection[]; collectionAssets: CollectionAsset[] }) => {
    setStoryboards(data.storyboards);
    setCollections(data.collections);
    setCollectionAssets(data.collectionAssets);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isElectron()) {
        if (!cancelled) setSecondaryDataLoading(false);
        return;
      }
      try {
        const data = await fetchSecondaryData();
        if (!cancelled) {
          setSecondaryData(data);
          setSecondaryDataLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          errorLogger.warn("Failed to load secondary data", err);
          setSecondaryDataLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setSecondaryData]);

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCollectionDialogOpen, setIsCollectionDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isNewCollectionDialogOpen, setIsNewCollectionDialogOpen] = useState(false);

  const [editingItem, setEditingItem] = useState<EditingItem | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [addToCollectionId, setAddToCollectionId] = useState("");
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const [isAddingToCollection, setIsAddingToCollection] = useState(false);
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    dialogControls: { setIsCollectionDialogOpen, setIsImportDialogOpen, setIsNewCollectionDialogOpen, setIsEditDialogOpen, setIsAddingToCollection },
    loadingControls: { setIsBatchDeleting, setIsSavingEdit, setIsCreatingCollection, isBatchDeleting },
    editDialog: { editingItem, setEditingItem },
    collectionForm: { addToCollectionId, newCollectionName, setNewCollectionName },
  });

  const filteredCharacters = useMemo(
    () =>
      characters.filter(
        (c) =>
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.tags?.some((t) =>
            t.toLowerCase().includes(searchQuery.toLowerCase()),
          ),
      ),
    [characters, searchQuery],
  );

  const filteredScenes = useMemo(
    () =>
      scenes.filter(
        (s) =>
          s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.tags?.some((t) =>
            t.toLowerCase().includes(searchQuery.toLowerCase()),
          ),
      ),
    [scenes, searchQuery],
  );

  const filteredStoryboards = useMemo(
    () =>
      storyboards.filter((sb) =>
        sb.script.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [storyboards, searchQuery],
  );

  const currentItems =
    activeTab === "characters"
      ? filteredCharacters
      : activeTab === "scenes"
        ? filteredScenes
        : activeTab === "storyboards"
          ? filteredStoryboards
          : activeTab === "collections"
            ? searchQuery
              ? collections.filter((c) =>
                  c.name?.toLowerCase().includes(searchQuery.toLowerCase()),
                )
              : collections
            : [];

  const handleTabChange = useCallback((v: string) => {
    setActiveTab(v as AssetTab);
    clearSelection();
    setSearchQuery("");
  }, [clearSelection]);

  const handleOpenImportDialog = useCallback(() => {
    setIsImportDialogOpen(true);
  }, []);

  const handleOpenCollectionDialog = useCallback(() => {
    setIsCollectionDialogOpen(true);
  }, []);

  const handleNewCollection = useCallback(() => {
    setIsNewCollectionDialogOpen(true);
  }, []);

  const handleSelectAll = useCallback(() => {
    selectAll(currentItems.map((i: { id: string }) => i.id));
  }, [selectAll, currentItems]);

  const handleEditingItemChange = useCallback((item: EditingItem | null) => {
    setEditingItem(item);
  }, []);

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
    isBatchDeleting,
    isSavingEdit,
    isAddingToCollection,
    isCreatingCollection,

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
    isEditDialogOpen,
    setIsEditDialogOpen,
    isCollectionDialogOpen,
    setIsCollectionDialogOpen,
    isImportDialogOpen,
    setIsImportDialogOpen,
    isNewCollectionDialogOpen,
    setIsNewCollectionDialogOpen,

    // Edit dialog
    editingItem,
    handleEditingItemChange,

    // Collection dialogs
    addToCollectionId,
    setAddToCollectionId,
    newCollectionName,
    setNewCollectionName,
    importMode,
    setImportMode,

    // Refs
    fileInputRef,

    // Actions
    handleOpenImportDialog,
    handleOpenCollectionDialog,
    handleNewCollection,
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
