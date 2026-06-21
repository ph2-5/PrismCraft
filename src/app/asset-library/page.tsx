import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useCharacters } from "@/modules/character";
import { useScenes } from "@/modules/scene";
import { errorLogger } from "@/shared/error-logger";
import { isElectron } from "@/shared/utils/platform";
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
  ImportMode,
} from "@/domain/schemas";
import { t } from "@/shared/constants/messages";
import { AssetCardGrid, fetchSecondaryData } from "./AssetCardGrid";
import type { AssetTab, EditingItem } from "./AssetCardGrid";
import { AssetEditDialog } from "./AssetEditDialog";
import { AssetCollectionDialogs } from "./AssetCollectionDialogs";
import { AssetUploadSection } from "./AssetUploadSection";
import { AssetToolbar } from "./AssetToolbar";
import { useAssetLibraryActions } from "./useAssetLibraryActions";

export default function AssetLibraryPage() {
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
    setAddToCollectionId,
    addToCollectionId,
    newCollectionName,
    editingItem,
    isBatchDeleting,
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
          onImport={actions.handleImport}
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
            onBatchDelete={actions.handleBatchDelete}
            onBatchExport={actions.handleBatchExport}
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
            onEditItem={actions.handleEditItem}
            onDeleteCharacter={actions.handleDeleteCharacter}
            onDeleteScene={actions.handleDeleteScene}
            onDeleteStoryboard={actions.handleDeleteStoryboard}
            onDeleteCollection={actions.handleDeleteCollection}
            onExportCollection={actions.handleExportCollection}
            onNewCollection={() => setIsNewCollectionDialogOpen(true)}
          />
        </Tabs>

        <AssetEditDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          editingItem={editingItem}
          isSavingEdit={isSavingEdit}
          onSave={actions.handleSaveEdit}
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
          onAddToCollection={actions.handleAddToCollection}
          newCollectionName={newCollectionName}
          setNewCollectionName={setNewCollectionName}
          isCreatingCollection={isCreatingCollection}
          onCreateCollection={actions.handleCreateCollection}
          importMode={importMode}
          setImportMode={setImportMode}
          fileInputRef={fileInputRef}
        />
      </div>
    </PageErrorBoundary>
  );
}
