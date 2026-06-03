import { useState, useCallback, useRef, useMemo, useEffect } from "react";
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
import { useToastHelpers } from "@/shared/presentation/Toast";
import { errorLogger } from "@/shared/error-logger";
import { isElectron } from "@/shared/utils/platform";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import { Badge } from "@/shared/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import {
  Users,
  Image as ImageIcon,
  Film,
  FolderOpen,
} from "lucide-react";
import type {
  StoryboardAsset,
  Collection,
  CollectionAsset,
  AssetLibraryType,
  ImportMode,
} from "@/domain/schemas";
import { confirm } from "@/shared/utils/confirm";
import { t } from "@/shared/constants/messages";
import { container } from "@/infrastructure/di";
import { AssetCardGrid, fetchSecondaryData } from "./AssetCardGrid";
import type { AssetTab, EditingItem } from "./AssetCardGrid";
import { AssetEditDialog } from "./AssetEditDialog";
import { AssetCollectionDialogs } from "./AssetCollectionDialogs";
import { AssetUploadSection } from "./AssetUploadSection";
import { AssetToolbar } from "./AssetToolbar";

export default function AssetLibraryPage() {
  const { success, error: showError } = useToastHelpers();
  const queryClient = useQueryClient();
  const { data: characters = [], isLoading: charactersLoading } = useCharacters();
  const { data: scenes = [], isLoading: scenesLoading } = useScenes();
  const [activeTab, setActiveTab] = useState<AssetTab>("characters");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importMode, setImportMode] = useState<ImportMode>("skip");

  const [storyboards, setStoryboards] = useState<StoryboardAsset[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionAssets, setCollectionAssets] = useState<CollectionAsset[]>([]);
  const [secondaryDataLoading, setSecondaryDataLoading] = useState(true);

  const loadSecondaryData = useCallback(async () => {
    try {
      const data = await fetchSecondaryData();
      setStoryboards(data.storyboards);
      setCollections(data.collections);
      setCollectionAssets(data.collectionAssets);
    } catch (err) {
      errorLogger.warn("Failed to load secondary data", err);
    }
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
          setStoryboards(data.storyboards);
          setCollections(data.collections);
          setCollectionAssets(data.collectionAssets);
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
  }, []);

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCollectionDialogOpen, setIsCollectionDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isNewCollectionDialogOpen, setIsNewCollectionDialogOpen] =
    useState(false);

  const [editingItem, setEditingItem] = useState<EditingItem | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [addToCollectionId, setAddToCollectionId] = useState("");
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const [isAddingToCollection, setIsAddingToCollection] = useState(false);
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = (ids: string[]) => {
    setSelectedIds(new Set(ids));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBatchDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!(await confirm(t("confirm.deleteSelectedAssets", { count: ids.length }), t("confirm.batchDeleteAssets")))) return;
    setIsBatchDeleting(true);
    try {
      const deletedIds: string[] = [];
      const failedLabels: string[] = [];
      for (const id of ids) {
        try {
          if (activeTab === "characters") {
            const result = await characterService.delete(id);
            if (!result.ok) {
              const c = characters.find((ch) => ch.id === id);
              failedLabels.push(c?.name || id.slice(0, 8));
              continue;
            }
          } else if (activeTab === "scenes") {
            const result = await sceneService.delete(id);
            if (!result.ok) {
              const s = scenes.find((sc) => sc.id === id);
              failedLabels.push(s?.name || id.slice(0, 8));
              continue;
            }
          } else if (activeTab === "storyboards") {
            await storyboardAssetService.remove(id);
          }
          deletedIds.push(id);
        } catch {
          const label = activeTab === "characters"
            ? characters.find((ch) => ch.id === id)?.name
            : activeTab === "scenes"
              ? scenes.find((sc) => sc.id === id)?.name
              : id.slice(0, 8);
          failedLabels.push(label || id.slice(0, 8));
        }
      }
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
  };

  const handleBatchExport = async () => {
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
      URL.revokeObjectURL(url);
      clearSelection();
      success(t("success.exported"), t("asset.exportedCount", { count: ids.length }));
    } catch (e) {
      showError(t("error.exportFailed"), mapUserFacingError(e));
    }
  };

  const handleAddToCollection = async () => {
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
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await assetExportService.importFromFile(file, importMode);
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
  };

  const handleCreateCollection = async () => {
    if (!newCollectionName.trim()) {
      showError(t("asset.inputError"), t("asset.enterCollectionName"));
      return;
    }
    setIsCreatingCollection(true);
    try {
      await collectionService.create(newCollectionName.trim());
      setNewCollectionName("");
      setIsNewCollectionDialogOpen(false);
      success(t("success.created"), t("success.collectionCreated"));
    } catch (e) {
      showError(t("asset.createFailed"), mapUserFacingError(e));
    } finally {
      setIsCreatingCollection(false);
    }
  };

  const handleDeleteCollection = async (id: string) => {
    if (!(await confirm(t("confirm.deleteCollection"), t("confirm.deleteCollectionTitle")))) return;
    try {
      await collectionService.remove(id);
      loadSecondaryData();
      success(t("success.deleted"), t("success.collectionDeleted"));
    } catch (e) {
      showError(t("error.deleteFailed"), mapUserFacingError(e));
    }
  };

  const handleExportCollection = async (id: string) => {
    try {
      const encodedResult = await assetExportService.exportCollections([id]);
      if (!encodedResult.ok) {
        showError(t("error.exportFailed"), mapUserFacingError(encodedResult.error));
        return;
      }
      const col = collections.find((c) => c.id === id);
      const blob = new Blob([new Uint8Array(encodedResult.value)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${col?.name || "collection"}.asa`;
      a.click();
      URL.revokeObjectURL(url);
      success(t("success.exported"), t("asset.collectionExported"));
    } catch (e) {
      showError(t("error.exportFailed"), mapUserFacingError(e));
    }
  };

  const handleDeleteCharacter = async (id: string) => {
    if (!(await confirm(t("confirm.deleteCharacter"), t("confirm.deleteCharacterTitle")))) return;
    characterService
      .delete(id)
      .then(() => queryClient.invalidateQueries({ queryKey: ["characters"] }))
      .catch((e: unknown) =>
        showError(t("error.deleteFailed"), mapUserFacingError(e)),
      );
  };

  const handleDeleteScene = async (id: string) => {
    if (!(await confirm(t("confirm.deleteScene"), t("confirm.deleteSceneTitle")))) return;
    sceneService
      .delete(id)
      .then(() => queryClient.invalidateQueries({ queryKey: ["scenes"] }))
      .catch((e: unknown) =>
        showError(t("error.deleteFailed"), mapUserFacingError(e)),
      );
  };

  const handleDeleteStoryboard = async (id: string) => {
    if (!(await confirm(t("confirm.deleteBeat"), t("confirm.deleteBeatTitle")))) return;
    storyboardAssetService
      .remove(id)
      .then(() => loadSecondaryData())
      .catch((e: unknown) =>
        showError(t("error.deleteFailed"), mapUserFacingError(e)),
      );
  };

  const handleEditItem = (item: EditingItem) => {
    setEditingItem(item);
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
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
  };

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
          : searchQuery
            ? collections.filter((c) =>
                c.name?.toLowerCase().includes(searchQuery.toLowerCase()),
              )
            : collections;

  return (
    <PageErrorBoundary>
      <div className="h-full space-y-4">
        <AssetUploadSection
          onOpenImportDialog={() => setIsImportDialogOpen(true)}
          fileInputRef={fileInputRef}
          onImport={handleImport}
        />

        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            setActiveTab(v as AssetTab);
            clearSelection();
            setSearchQuery("");
          }}
        >
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="characters" className="gap-1">
              <Users className="w-4 h-4" />
              {t("asset.characterLibrary")}
              {characters.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  {characters.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="scenes" className="gap-1">
              <ImageIcon className="w-4 h-4" />
              {t("asset.sceneLibrary")}
              {scenes.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  {scenes.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="storyboards" className="gap-1">
              <Film className="w-4 h-4" />
              {t("asset.storyboardLibrary")}
              {storyboards.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  {storyboards.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="collections" className="gap-1">
              <FolderOpen className="w-4 h-4" />
              {t("asset.myCollections")}
              {collections.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  {collections.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <AssetToolbar
            activeTab={activeTab}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            selectedIdsSize={selectedIds.size}
            isBatchDeleting={isBatchDeleting}
            onBatchDelete={handleBatchDelete}
            onBatchExport={handleBatchExport}
            onOpenCollectionDialog={() => setIsCollectionDialogOpen(true)}
            onClearSelection={clearSelection}
            onSelectAll={() =>
              selectAll(currentItems.map((i: { id: string }) => i.id))
            }
            showSelectAll={currentItems.length > 0}
          />

          <AssetCardGrid
            activeTab={activeTab}
            characters={characters}
            scenes={scenes}
            collections={collections}
            collectionAssets={collectionAssets}
            filteredCharacters={filteredCharacters}
            filteredScenes={filteredScenes}
            filteredStoryboards={filteredStoryboards}
            charactersLoading={charactersLoading}
            scenesLoading={scenesLoading}
            secondaryDataLoading={secondaryDataLoading}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onEditItem={handleEditItem}
            onDeleteCharacter={handleDeleteCharacter}
            onDeleteScene={handleDeleteScene}
            onDeleteStoryboard={handleDeleteStoryboard}
            onDeleteCollection={handleDeleteCollection}
            onExportCollection={handleExportCollection}
            onNewCollection={() => setIsNewCollectionDialogOpen(true)}
          />
        </Tabs>

        <AssetEditDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          editingItem={editingItem}
          isSavingEdit={isSavingEdit}
          onSave={handleSaveEdit}
          onEditingItemChange={(item) => setEditingItem(item)}
        />

        <AssetCollectionDialogs
          isCollectionDialogOpen={isCollectionDialogOpen}
          setIsCollectionDialogOpen={setIsCollectionDialogOpen}
          isNewCollectionDialogOpen={isNewCollectionDialogOpen}
          setIsNewCollectionDialogOpen={setIsNewCollectionDialogOpen}
          isImportDialogOpen={isImportDialogOpen}
          setIsImportDialogOpen={setIsImportDialogOpen}
          collections={collections}
          selectedIdsCount={selectedIds.size}
          addToCollectionId={addToCollectionId}
          setAddToCollectionId={setAddToCollectionId}
          isAddingToCollection={isAddingToCollection}
          onAddToCollection={handleAddToCollection}
          newCollectionName={newCollectionName}
          setNewCollectionName={setNewCollectionName}
          isCreatingCollection={isCreatingCollection}
          onCreateCollection={handleCreateCollection}
          importMode={importMode}
          setImportMode={setImportMode}
          fileInputRef={fileInputRef}
        />
      </div>
    </PageErrorBoundary>
  );
}
