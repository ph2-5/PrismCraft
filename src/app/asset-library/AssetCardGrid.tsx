import {
  Users,
  Image as ImageIcon,
  Film,
  FolderOpen,
  Loader2,
  Plus,
  Package,
  Layers,
  Image as MediaIcon,
} from "lucide-react";
import type {
  Character,
  Scene,
  StoryboardAsset,
  Collection,
  CollectionAsset,
} from "@/domain/schemas";
import { t } from "@/shared/constants";
import { CharacterCard, SceneCard, StoryboardCard, CollectionCard } from "./AssetCards";
import type { AssetTab } from "./asset-library-shared";
export type { AssetTab, EditingItem } from "./asset-library-shared";
export { fetchSecondaryData } from "./asset-library-shared";

interface AssetCardGridProps {
  activeTab: AssetTab;
  characters: Character[];
  scenes: Scene[];
  collections: Collection[];
  collectionAssets: CollectionAsset[];
  filteredCharacters: Character[];
  filteredScenes: Scene[];
  filteredStoryboards: StoryboardAsset[];
  charactersLoading: boolean;
  scenesLoading: boolean;
  secondaryDataLoading: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onEditItem: (item: import("./asset-library-shared").EditingItem) => void;
  onDeleteCharacter: (id: string) => void;
  onDeleteScene: (id: string) => void;
  onDeleteStoryboard: (id: string) => void;
  onDeleteCollection: (id: string) => void;
  onExportCollection: (id: string) => void;
  onNewCollection: () => void;
}

// 预览页面统一的 grid 布局
const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
  gap: 10,
};

// 预览页面统一的空状态样式
function EmptyState({ icon: Icon, title, desc }: { icon: typeof Users; title: string; desc: string }) {
  return (
    <div className="card" style={{ padding: 20, textAlign: "center" }}>
      <Icon size={48} style={{ margin: "0 auto 12px", color: "var(--muted-fg)", opacity: 0.3 }} />
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>{desc}</div>
    </div>
  );
}

// 预览页面统一的加载状态样式
function LoadingState() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "64px 0" }}>
      <Loader2 size={32} className="animate-spin" style={{ color: "var(--muted-fg)" }} />
    </div>
  );
}

export function AssetCardGrid({
  activeTab,
  characters,
  scenes,
  collections,
  collectionAssets,
  filteredCharacters,
  filteredScenes,
  filteredStoryboards,
  charactersLoading,
  scenesLoading,
  secondaryDataLoading,
  selectedIds,
  onToggleSelect,
  onEditItem,
  onDeleteCharacter,
  onDeleteScene,
  onDeleteStoryboard,
  onDeleteCollection,
  onExportCollection,
  onNewCollection,
}: AssetCardGridProps) {
  const getCollectionAssetCount = (collectionId: string) => {
    return collectionAssets.filter((ca) => ca.collectionId === collectionId)
      .length;
  };

  return (
    <>
      {activeTab === "characters" && (
        <>
          {charactersLoading ? (
            <LoadingState />
          ) : filteredCharacters.length === 0 ? (
            <EmptyState
              icon={Users}
              title={t("asset.characterLibraryEmpty")}
              desc={t("asset.characterLibraryEmptyDesc")}
            />
          ) : (
            <div style={gridStyle}>
              {filteredCharacters.map((char) => (
                <CharacterCard
                  key={char.id}
                  char={char}
                  isSelected={selectedIds.has(char.id)}
                  onToggleSelect={onToggleSelect}
                  onEditItem={onEditItem}
                  onDeleteCharacter={onDeleteCharacter}
                />
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === "scenes" && (
        <>
          {scenesLoading ? (
            <LoadingState />
          ) : filteredScenes.length === 0 ? (
            <EmptyState
              icon={ImageIcon}
              title={t("asset.sceneLibraryEmpty")}
              desc={t("asset.sceneLibraryEmptyDesc")}
            />
          ) : (
            <div style={gridStyle}>
              {filteredScenes.map((scene) => (
                <SceneCard
                  key={scene.id}
                  scene={scene}
                  isSelected={selectedIds.has(scene.id)}
                  onToggleSelect={onToggleSelect}
                  onEditItem={onEditItem}
                  onDeleteScene={onDeleteScene}
                />
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === "storyboards" && (
        <>
          {secondaryDataLoading ? (
            <LoadingState />
          ) : filteredStoryboards.length === 0 ? (
            <EmptyState
              icon={Film}
              title={t("asset.storyboardLibraryEmpty")}
              desc={t("asset.storyboardLibraryEmptyDesc")}
            />
          ) : (
            <div style={gridStyle}>
              {filteredStoryboards.map((sb) => (
                <StoryboardCard
                  key={sb.id}
                  sb={sb}
                  isSelected={selectedIds.has(sb.id)}
                  onToggleSelect={onToggleSelect}
                  onEditItem={onEditItem}
                  onDeleteStoryboard={onDeleteStoryboard}
                />
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === "collections" && (
        <>
          <div style={{ marginBottom: 12 }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={onNewCollection}>
              <Plus size={14} style={{ marginRight: 4 }} />
              {t("asset.newCollection")}
            </button>
          </div>
          {secondaryDataLoading ? (
            <LoadingState />
          ) : collections.length === 0 ? (
            <EmptyState
              icon={FolderOpen}
              title={t("asset.noCollections")}
              desc={t("asset.noCollectionsDesc")}
            />
          ) : (
            <div style={gridStyle}>
              {collections.map((col) => (
                <CollectionCard
                  key={col.id}
                  col={col}
                  assetCount={getCollectionAssetCount(col.id)}
                  collectionAssets={collectionAssets}
                  characters={characters}
                  scenes={scenes}
                  onDeleteCollection={onDeleteCollection}
                  onExportCollection={onExportCollection}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* 全部素材 — 组合视图，对齐预览页面 */}
      {activeTab === "all" && (
        <>
          {charactersLoading || scenesLoading || secondaryDataLoading ? (
            <LoadingState />
          ) : filteredCharacters.length === 0 &&
            filteredScenes.length === 0 &&
            filteredStoryboards.length === 0 ? (
            <EmptyState
              icon={Layers}
              title={t("asset.allAssetsEmpty")}
              desc={t("asset.allAssetsEmptyDesc")}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {filteredCharacters.length > 0 && (
                <div>
                  <div className="section-label" style={{ marginBottom: 8 }}>
                    👤 {t("asset.characterLibrary")} ({filteredCharacters.length})
                  </div>
                  <div style={gridStyle}>
                    {filteredCharacters.map((char) => (
                      <CharacterCard
                        key={char.id}
                        char={char}
                        isSelected={selectedIds.has(char.id)}
                        onToggleSelect={onToggleSelect}
                        onEditItem={onEditItem}
                        onDeleteCharacter={onDeleteCharacter}
                      />
                    ))}
                  </div>
                </div>
              )}
              {filteredScenes.length > 0 && (
                <div>
                  <div className="section-label" style={{ marginBottom: 8 }}>
                    🏙 {t("asset.sceneLibrary")} ({filteredScenes.length})
                  </div>
                  <div style={gridStyle}>
                    {filteredScenes.map((scene) => (
                      <SceneCard
                        key={scene.id}
                        scene={scene}
                        isSelected={selectedIds.has(scene.id)}
                        onToggleSelect={onToggleSelect}
                        onEditItem={onEditItem}
                        onDeleteScene={onDeleteScene}
                      />
                    ))}
                  </div>
                </div>
              )}
              {filteredStoryboards.length > 0 && (
                <div>
                  <div className="section-label" style={{ marginBottom: 8 }}>
                    🎬 {t("asset.storyboardLibrary")} ({filteredStoryboards.length})
                  </div>
                  <div style={gridStyle}>
                    {filteredStoryboards.map((sb) => (
                      <StoryboardCard
                        key={sb.id}
                        sb={sb}
                        isSelected={selectedIds.has(sb.id)}
                        onToggleSelect={onToggleSelect}
                        onEditItem={onEditItem}
                        onDeleteStoryboard={onDeleteStoryboard}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* 道具分类 — 对齐预览页面（暂无数据支持，显示空状态） */}
      {(activeTab === "props" ||
        activeTab === "prop-clothing" ||
        activeTab === "prop-weapon" ||
        activeTab === "prop-accessory" ||
        activeTab === "prop-prop") && (
        <EmptyState
          icon={Package}
          title={t("asset.propsEmpty")}
          desc={t("asset.propsEmptyDesc")}
        />
      )}

      {/* 媒体资产分类 — 对齐预览页面（暂无数据支持，显示空状态） */}
      {activeTab === "media" && (
        <EmptyState
          icon={MediaIcon}
          title={t("asset.mediaEmpty")}
          desc={t("asset.mediaEmptyDesc")}
        />
      )}
    </>
  );
}
