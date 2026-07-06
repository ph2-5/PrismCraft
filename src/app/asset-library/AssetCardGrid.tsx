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
import type { AssetTab, EditingItem } from "./asset-library-shared";
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
  onEditItem: (item: EditingItem) => void;
  onDeleteCharacter: (id: string) => void;
  onDeleteScene: (id: string) => void;
  onDeleteStoryboard: (id: string) => void;
  onDeleteCollection: (id: string) => void;
  onExportCollection: (id: string) => void;
  onNewCollection: () => void;
}

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
  gap: 10,
};

function EmptyState({ icon: Icon, title, desc }: { icon: typeof Users; title: string; desc: string }) {
  return (
    <div className="card" style={{ padding: 20, textAlign: "center" }}>
      <Icon size={48} style={{ margin: "0 auto 12px", color: "var(--muted-fg)", opacity: 0.3 }} />
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>{desc}</div>
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "64px 0" }}>
      <Loader2 size={32} className="animate-spin" style={{ color: "var(--muted-fg)" }} />
    </div>
  );
}

interface CardGridSectionProps {
  isLoading: boolean;
  isEmpty: boolean;
  emptyIcon: typeof Users;
  emptyTitle: string;
  emptyDesc: string;
  children: React.ReactNode;
}

function CardGridSection({ isLoading, isEmpty, emptyIcon, emptyTitle, emptyDesc, children }: CardGridSectionProps) {
  if (isLoading) return <LoadingState />;
  if (isEmpty) return <EmptyState icon={emptyIcon} title={emptyTitle} desc={emptyDesc} />;
  return <div style={gridStyle}>{children}</div>;
}

interface CharactersTabProps {
  isLoading: boolean;
  filteredCharacters: Character[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onEditItem: (item: EditingItem) => void;
  onDeleteCharacter: (id: string) => void;
}

function CharactersTab({ isLoading, filteredCharacters, selectedIds, onToggleSelect, onEditItem, onDeleteCharacter }: CharactersTabProps) {
  return (
    <CardGridSection
      isLoading={isLoading}
      isEmpty={filteredCharacters.length === 0}
      emptyIcon={Users}
      emptyTitle={t("asset.characterLibraryEmpty")}
      emptyDesc={t("asset.characterLibraryEmptyDesc")}
    >
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
    </CardGridSection>
  );
}

interface ScenesTabProps {
  isLoading: boolean;
  filteredScenes: Scene[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onEditItem: (item: EditingItem) => void;
  onDeleteScene: (id: string) => void;
}

function ScenesTab({ isLoading, filteredScenes, selectedIds, onToggleSelect, onEditItem, onDeleteScene }: ScenesTabProps) {
  return (
    <CardGridSection
      isLoading={isLoading}
      isEmpty={filteredScenes.length === 0}
      emptyIcon={ImageIcon}
      emptyTitle={t("asset.sceneLibraryEmpty")}
      emptyDesc={t("asset.sceneLibraryEmptyDesc")}
    >
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
    </CardGridSection>
  );
}

interface StoryboardsTabProps {
  isLoading: boolean;
  filteredStoryboards: StoryboardAsset[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onEditItem: (item: EditingItem) => void;
  onDeleteStoryboard: (id: string) => void;
}

function StoryboardsTab({ isLoading, filteredStoryboards, selectedIds, onToggleSelect, onEditItem, onDeleteStoryboard }: StoryboardsTabProps) {
  return (
    <CardGridSection
      isLoading={isLoading}
      isEmpty={filteredStoryboards.length === 0}
      emptyIcon={Film}
      emptyTitle={t("asset.storyboardLibraryEmpty")}
      emptyDesc={t("asset.storyboardLibraryEmptyDesc")}
    >
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
    </CardGridSection>
  );
}

interface CollectionsTabProps {
  isLoading: boolean;
  collections: Collection[];
  collectionAssets: CollectionAsset[];
  characters: Character[];
  scenes: Scene[];
  onNewCollection: () => void;
  onDeleteCollection: (id: string) => void;
  onExportCollection: (id: string) => void;
}

function CollectionsTab({
  isLoading,
  collections,
  collectionAssets,
  characters,
  scenes,
  onNewCollection,
  onDeleteCollection,
  onExportCollection,
}: CollectionsTabProps) {
  const getCollectionAssetCount = (collectionId: string) =>
    collectionAssets.filter((ca) => ca.collectionId === collectionId).length;

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={onNewCollection}>
          <Plus size={14} style={{ marginRight: 4 }} />
          {t("asset.newCollection")}
        </button>
      </div>
      <CardGridSection
        isLoading={isLoading}
        isEmpty={collections.length === 0}
        emptyIcon={FolderOpen}
        emptyTitle={t("asset.noCollections")}
        emptyDesc={t("asset.noCollectionsDesc")}
      >
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
      </CardGridSection>
    </>
  );
}

interface AllTabSectionProps {
  title: string;
  count: number;
  children: React.ReactNode;
}

function AllTabSection({ title, count, children }: AllTabSectionProps) {
  if (count === 0) return null;
  return (
    <div>
      <div className="section-label" style={{ marginBottom: 8 }}>{title} ({count})</div>
      <div style={gridStyle}>{children}</div>
    </div>
  );
}

interface AllTabProps {
  isLoading: boolean;
  filteredCharacters: Character[];
  filteredScenes: Scene[];
  filteredStoryboards: StoryboardAsset[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onEditItem: (item: EditingItem) => void;
  onDeleteCharacter: (id: string) => void;
  onDeleteScene: (id: string) => void;
  onDeleteStoryboard: (id: string) => void;
}

function AllTab({
  isLoading,
  filteredCharacters,
  filteredScenes,
  filteredStoryboards,
  selectedIds,
  onToggleSelect,
  onEditItem,
  onDeleteCharacter,
  onDeleteScene,
  onDeleteStoryboard,
}: AllTabProps) {
  if (isLoading) return <LoadingState />;
  const isEmpty = filteredCharacters.length === 0 && filteredScenes.length === 0 && filteredStoryboards.length === 0;
  if (isEmpty) {
    return <EmptyState icon={Layers} title={t("asset.allAssetsEmpty")} desc={t("asset.allAssetsEmptyDesc")} />;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <AllTabSection title={`👤 ${t("asset.characterLibrary")}`} count={filteredCharacters.length}>
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
      </AllTabSection>
      <AllTabSection title={`🏙 ${t("asset.sceneLibrary")}`} count={filteredScenes.length}>
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
      </AllTabSection>
      <AllTabSection title={`🎬 ${t("asset.storyboardLibrary")}`} count={filteredStoryboards.length}>
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
      </AllTabSection>
    </div>
  );
}

const PROPS_TABS: ReadonlySet<AssetTab> = new Set(["props", "prop-clothing", "prop-weapon", "prop-accessory", "prop-prop"]);

export function AssetCardGrid(props: AssetCardGridProps) {
  const { activeTab } = props;

  if (activeTab === "characters") {
    return <CharactersTab isLoading={props.charactersLoading} filteredCharacters={props.filteredCharacters} selectedIds={props.selectedIds} onToggleSelect={props.onToggleSelect} onEditItem={props.onEditItem} onDeleteCharacter={props.onDeleteCharacter} />;
  }
  if (activeTab === "scenes") {
    return <ScenesTab isLoading={props.scenesLoading} filteredScenes={props.filteredScenes} selectedIds={props.selectedIds} onToggleSelect={props.onToggleSelect} onEditItem={props.onEditItem} onDeleteScene={props.onDeleteScene} />;
  }
  if (activeTab === "storyboards") {
    return <StoryboardsTab isLoading={props.secondaryDataLoading} filteredStoryboards={props.filteredStoryboards} selectedIds={props.selectedIds} onToggleSelect={props.onToggleSelect} onEditItem={props.onEditItem} onDeleteStoryboard={props.onDeleteStoryboard} />;
  }
  if (activeTab === "collections") {
    return (
      <CollectionsTab
        isLoading={props.secondaryDataLoading}
        collections={props.collections}
        collectionAssets={props.collectionAssets}
        characters={props.characters}
        scenes={props.scenes}
        onNewCollection={props.onNewCollection}
        onDeleteCollection={props.onDeleteCollection}
        onExportCollection={props.onExportCollection}
      />
    );
  }
  if (activeTab === "all") {
    return (
      <AllTab
        isLoading={props.charactersLoading || props.scenesLoading || props.secondaryDataLoading}
        filteredCharacters={props.filteredCharacters}
        filteredScenes={props.filteredScenes}
        filteredStoryboards={props.filteredStoryboards}
        selectedIds={props.selectedIds}
        onToggleSelect={props.onToggleSelect}
        onEditItem={props.onEditItem}
        onDeleteCharacter={props.onDeleteCharacter}
        onDeleteScene={props.onDeleteScene}
        onDeleteStoryboard={props.onDeleteStoryboard}
      />
    );
  }
  if (PROPS_TABS.has(activeTab)) {
    return <EmptyState icon={Package} title={t("asset.propsEmpty")} desc={t("asset.propsEmptyDesc")} />;
  }
  if (activeTab === "media") {
    return <EmptyState icon={MediaIcon} title={t("asset.mediaEmpty")} desc={t("asset.mediaEmptyDesc")} />;
  }
  return null;
}
