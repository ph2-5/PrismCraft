import { Badge } from "@/shared/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import {
  Users,
  Image as ImageIcon,
  Film,
  FolderOpen,
} from "lucide-react";
import { t } from "@/shared/constants/messages";
import { AssetCardGrid } from "./AssetCardGrid";
import { AssetEditDialog } from "./AssetEditDialog";
import { AssetCollectionDialogs } from "./AssetCollectionDialogs";
import { AssetUploadSection } from "./AssetUploadSection";
import { AssetToolbar } from "./AssetToolbar";
import { useAssetLibraryPage } from "./hooks/useAssetLibraryPage";

export default function AssetLibraryPage() {
  const {
    characters,
    scenes,
    storyboards,
    collections,
    collectionAssets,
    filteredCharacters,
    filteredScenes,
    filteredStoryboards,
    currentItems,
    charactersLoading,
    scenesLoading,
    secondaryDataLoading,
    isBatchDeleting,
    isSavingEdit,
    isAddingToCollection,
    isCreatingCollection,
    activeTab,
    searchQuery,
    setSearchQuery,
    handleTabChange,
    selectedIds,
    toggleSelect,
    clearSelection,
    handleSelectAll,
    isEditDialogOpen,
    setIsEditDialogOpen,
    isCollectionDialogOpen,
    setIsCollectionDialogOpen,
    isImportDialogOpen,
    setIsImportDialogOpen,
    isNewCollectionDialogOpen,
    setIsNewCollectionDialogOpen,
    editingItem,
    handleEditingItemChange,
    addToCollectionId,
    setAddToCollectionId,
    newCollectionName,
    setNewCollectionName,
    importMode,
    setImportMode,
    fileInputRef,
    handleOpenImportDialog,
    handleOpenCollectionDialog,
    handleNewCollection,
    handleImport,
    handleBatchDelete,
    handleBatchExport,
    handleAddToCollection,
    handleCreateCollection,
    handleDeleteCharacter,
    handleDeleteScene,
    handleDeleteStoryboard,
    handleDeleteCollection,
    handleExportCollection,
    handleEditItem,
    handleSaveEdit,
  } = useAssetLibraryPage();

  return (
    <PageErrorBoundary>
      <div className="h-full space-y-4">
        <AssetUploadSection
          onOpenImportDialog={handleOpenImportDialog}
          fileInputRef={fileInputRef}
          onImport={handleImport}
        />

        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
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
            onOpenCollectionDialog={handleOpenCollectionDialog}
            onClearSelection={clearSelection}
            onSelectAll={handleSelectAll}
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
            onNewCollection={handleNewCollection}
          />
        </Tabs>

        <AssetEditDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          editingItem={editingItem}
          isSavingEdit={isSavingEdit}
          onSave={handleSaveEdit}
          onEditingItemChange={handleEditingItemChange}
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
