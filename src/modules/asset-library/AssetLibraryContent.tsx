import { AssetCardGrid } from "./AssetCardGrid";
import { AssetEditDialog } from "./AssetEditDialog";
import { AssetCollectionDialogs } from "./AssetCollectionDialogs";
import { AssetUploadSection } from "./AssetUploadSection";
import { AssetToolbar } from "./AssetToolbar";
import { CategoryTree, TopHeader } from "./CategoryTree";
import type { useAssetLibraryPage } from "./hooks/use-asset-library-page";

type HookResult = ReturnType<typeof useAssetLibraryPage>;

interface AssetLibraryContentProps {
  hookResult: HookResult;
  showUploadArea: boolean;
  setShowUploadArea: (show: boolean) => void;
}

export function AssetLibraryContent({
  hookResult,
  showUploadArea,
  setShowUploadArea,
}: AssetLibraryContentProps) {
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
    activeTab,
    searchQuery,
    setSearchQuery,
    handleTabChange,
    selectedIds,
    toggleSelect,
    clearSelection,
    handleSelectAll,
    fileInputRef,
    handleOpenImportDialog,
    handleOpenCollectionDialog,
    handleNewCollection,
    handleImport,
    handleBatchDelete,
    handleBatchExport,
    handleDeleteCharacter,
    handleDeleteScene,
    handleDeleteStoryboard,
    handleDeleteCollection,
    handleExportCollection,
    handleEditItem,
  } = hookResult;

  return (
    <div className="fade-in flex flex-col h-full">
      <TopHeader
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onShowUploadArea={() => setShowUploadArea(true)}
        onOpenImportDialog={handleOpenImportDialog}
        onBatchExport={handleBatchExport}
      />

      <AssetUploadSection
        visible={showUploadArea}
        onClose={() => setShowUploadArea(false)}
        fileInputRef={fileInputRef}
        onImport={handleImport}
      />

      <AssetToolbar
        activeTab={activeTab}
        selectedIdsSize={selectedIds.size}
        isBatchDeleting={isBatchDeleting}
        onBatchDelete={handleBatchDelete}
        onBatchExport={handleBatchExport}
        onOpenCollectionDialog={handleOpenCollectionDialog}
        onClearSelection={clearSelection}
        onSelectAll={handleSelectAll}
        showSelectAll={currentItems.length > 0}
      />

      <div className="flex-1 flex min-h-0">
        <CategoryTree
          activeTab={activeTab}
          onTabChange={handleTabChange}
          charactersCount={characters.length}
          scenesCount={scenes.length}
          storyboardsCount={storyboards.length}
          collectionsCount={collections.length}
        />

        <div role="tabpanel" className="flex-1 overflow-y-auto p-4">
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
        </div>
      </div>

      <AssetLibraryDialogs hookResult={hookResult} />
    </div>
  );
}

interface AssetLibraryDialogsProps {
  hookResult: HookResult;
}

function AssetLibraryDialogs({ hookResult }: AssetLibraryDialogsProps) {
  const {
    collections,
    selectedIds,
    isEditDialogOpen,
    setIsEditDialogOpen,
    editingItem,
    isSavingEdit,
    handleSaveEdit,
    handleEditingItemChange,
    isCollectionDialogOpen,
    setIsCollectionDialogOpen,
    isNewCollectionDialogOpen,
    setIsNewCollectionDialogOpen,
    isImportDialogOpen,
    setIsImportDialogOpen,
    addToCollectionId,
    setAddToCollectionId,
    isAddingToCollection,
    handleAddToCollection,
    newCollectionName,
    setNewCollectionName,
    isCreatingCollection,
    handleCreateCollection,
    importMode,
    setImportMode,
    fileInputRef,
  } = hookResult;

  return (
    <>
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
    </>
  );
}
