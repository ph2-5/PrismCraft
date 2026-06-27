import { useState } from "react";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { t } from "@/shared/constants/messages";
import { AssetCardGrid } from "./AssetCardGrid";
import { AssetEditDialog } from "./AssetEditDialog";
import { AssetCollectionDialogs } from "./AssetCollectionDialogs";
import { AssetUploadSection } from "./AssetUploadSection";
import { AssetToolbar } from "./AssetToolbar";
import { useAssetLibraryPage } from "./hooks/useAssetLibraryPage";
import type { AssetTab } from "./AssetCardGrid";

// 预览页面左侧分类树容器样式：
// width:200px;flex-shrink:0;border-right:1px solid var(--border);overflow-y:auto;
// padding:12px;display:flex;flex-direction:column;gap:2px;
const categoryTreeStyle: React.CSSProperties = {
  width: 200,
  flexShrink: 0,
  borderRight: "1px solid var(--border)",
  overflowY: "auto",
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const categoryDividerStyle: React.CSSProperties = {
  borderTop: "1px solid var(--border)",
  margin: "8px 0",
};

// 预览页面分类按钮基础样式：
// justify-content:flex-start;width:100%;
const categoryBtnBaseStyle: React.CSSProperties = {
  justifyContent: "flex-start",
  width: "100%",
};

// 预览页面选中态：background:rgba(99,102,241,0.1);color:var(--fg);
const categoryBtnActiveStyle: React.CSSProperties = {
  background: "rgba(99,102,241,0.1)",
  color: "var(--fg)",
};

// 预览页面计数标签：font-size:10px;color:var(--muted-fg);margin-left:auto;
const countBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  color: "var(--muted-fg)",
  marginLeft: "auto",
};

// 预览页面道具子分类容器样式：
// margin-left:12px;display:flex;flex-direction:column;gap:1px;
const propSubCatsStyle: React.CSSProperties = {
  marginLeft: 12,
  display: "flex",
  flexDirection: "column",
  gap: 1,
};

interface CategoryButtonProps {
  icon: string;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  size?: "sm" | "xs";
}

function CategoryButton({ icon, label, count, active, onClick, size = "sm" }: CategoryButtonProps) {
  const btnClassName = size === "xs" ? "btn btn-ghost btn-xs" : "btn btn-ghost btn-sm";
  const extraStyle: React.CSSProperties =
    size === "xs"
      ? { justifyContent: "flex-start", width: "100%", fontSize: 11 }
      : { ...categoryBtnBaseStyle };
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-active={active ? "true" : undefined}
      className={btnClassName}
      style={{
        ...extraStyle,
        ...(active ? categoryBtnActiveStyle : {}),
      }}
      onClick={onClick}
    >
      <span style={{ marginRight: 6 }}>{icon}</span>
      {label}
      {count !== undefined && count > 0 && (
        <span style={countBadgeStyle}>{count}</span>
      )}
    </button>
  );
}

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

  // 上传区域显示状态（纯 UI 状态，对齐预览页面行为）
  const [showUploadArea, setShowUploadArea] = useState(false);

  return (
    <PageErrorBoundary>
      <div className="fade-in" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {/* Top Tabs Header — 对齐预览页面：space-between 标题栏 + toolbar */}
        <div className="top-tabs" style={{ justifyContent: "space-between" }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>
            📦 {t("asset.libraryTitle")}
          </span>
          <div className="toolbar">
            <input
              className="input"
              data-testid="asset-search-input"
              placeholder={t("asset.searchNameDescTag")}
              style={{ fontSize: 12, padding: "6px 10px", width: 180 }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setShowUploadArea(true)}
            >
              + {t("common.upload")}
            </button>
            <button
              className="btn btn-outline btn-sm"
              onClick={handleOpenImportDialog}
            >
              📥 {t("asset.importAsa")}
            </button>
            <button
              className="btn btn-outline btn-sm"
              onClick={handleBatchExport}
            >
              📤 {t("asset.export")}
            </button>
          </div>
        </div>

        {/* Upload Section — 对齐预览页面：默认隐藏，点击"上传素材"显示 */}
        <AssetUploadSection
          visible={showUploadArea}
          onClose={() => setShowUploadArea(false)}
          fileInputRef={fileInputRef}
          onImport={handleImport}
        />

        {/* Batch Toolbar — 对齐预览页面：选中时显示 */}
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

        {/* Main Content: Left Category Tree + Right Grid */}
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          {/* Left: Category Tree — 完全对齐预览页面分类树 */}
          <div role="tablist" aria-label={t("asset.category")} style={categoryTreeStyle}>
            <div className="section-label" style={{ marginBottom: 6 }}>
              {t("asset.category")}
            </div>
            {/* 全部素材 — 默认选中 */}
            <CategoryButton
              icon="📁"
              label={t("asset.allAssets")}
              active={activeTab === "all"}
              onClick={() => handleTabChange("all" as AssetTab)}
            />
            {/* 角色素材 */}
            <CategoryButton
              icon="👤"
              label={t("asset.characterLibrary")}
              count={characters.length}
              active={activeTab === "characters"}
              onClick={() => handleTabChange("characters" as AssetTab)}
            />
            {/* 场景素材 */}
            <CategoryButton
              icon="🏙"
              label={t("asset.sceneLibrary")}
              count={scenes.length}
              active={activeTab === "scenes"}
              onClick={() => handleTabChange("scenes" as AssetTab)}
            />
            {/* 分镜素材 */}
            <CategoryButton
              icon="🎬"
              label={t("asset.storyboardLibrary")}
              count={storyboards.length}
              active={activeTab === "storyboards"}
              onClick={() => handleTabChange("storyboards" as AssetTab)}
            />
            {/* 道具 + 子分类 */}
            <CategoryButton
              icon="📦"
              label={t("asset.props")}
              active={activeTab === "props"}
              onClick={() => handleTabChange("props" as AssetTab)}
            />
            <div style={propSubCatsStyle}>
              <CategoryButton
                icon="└ 👗"
                label={t("asset.propClothing")}
                active={activeTab === "prop-clothing"}
                onClick={() => handleTabChange("prop-clothing" as AssetTab)}
                size="xs"
              />
              <CategoryButton
                icon="└ ⚔"
                label={t("asset.propWeapon")}
                active={activeTab === "prop-weapon"}
                onClick={() => handleTabChange("prop-weapon" as AssetTab)}
                size="xs"
              />
              <CategoryButton
                icon="└ 💍"
                label={t("asset.propAccessory")}
                active={activeTab === "prop-accessory"}
                onClick={() => handleTabChange("prop-accessory" as AssetTab)}
                size="xs"
              />
              <CategoryButton
                icon="└ 🔧"
                label={t("asset.propProp")}
                active={activeTab === "prop-prop"}
                onClick={() => handleTabChange("prop-prop" as AssetTab)}
                size="xs"
              />
            </div>
            {/* 分隔线 */}
            <div style={categoryDividerStyle} />
            {/* 收藏集 */}
            <CategoryButton
              icon="⭐"
              label={t("asset.myCollections")}
              count={collections.length}
              active={activeTab === "collections"}
              onClick={() => handleTabChange("collections" as AssetTab)}
            />
            {/* 媒体资产 */}
            <CategoryButton
              icon="🖼"
              label={t("asset.media")}
              active={activeTab === "media"}
              onClick={() => handleTabChange("media" as AssetTab)}
            />
          </div>

          {/* Right: Grid */}
          <div role="tabpanel" style={{ flex: 1, overflowY: "auto", padding: 16 }}>
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

        {/* Dialogs (unchanged) */}
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
