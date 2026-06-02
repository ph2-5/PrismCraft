import {
  Users,
  Image as ImageIcon,
  Film,
  FolderOpen,
  Loader2,
  Plus,
} from "lucide-react";
import type {
  Character,
  Scene,
  StoryboardAsset,
  Collection,
  CollectionAsset,
} from "@/domain/schemas";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardContent,
} from "@/shared/ui/card";
import { TabsContent } from "@/shared/ui/tabs";
import { CharacterCard, SceneCard, StoryboardCard, CollectionCard } from "./AssetCards";
export type { AssetTab, EditingItem } from "./asset-library-shared";
export { fetchSecondaryData } from "./asset-library-shared";

interface AssetCardGridProps {
  activeTab: "characters" | "scenes" | "storyboards" | "collections";
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

export function AssetCardGrid({
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
      <TabsContent value="characters" className="mt-4">
        {charactersLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredCharacters.length === 0 ? (
          <Card>
            <CardContent className="pt-12 pb-12 text-center">
              <Users className="w-16 h-16 mx-auto mb-4 text-slate-500" />
              <h3 className="text-xl font-bold mb-2">角色库为空</h3>
              <p className="text-muted-foreground">
                前往角色页面创建角色，素材会自动入库
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
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
      </TabsContent>

      <TabsContent value="scenes" className="mt-4">
        {scenesLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredScenes.length === 0 ? (
          <Card>
            <CardContent className="pt-12 pb-12 text-center">
              <ImageIcon className="w-16 h-16 mx-auto mb-4 text-slate-500" />
              <h3 className="text-xl font-bold mb-2">场景库为空</h3>
              <p className="text-muted-foreground">
                前往场景页面创建场景，素材会自动入库
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
      </TabsContent>

      <TabsContent value="storyboards" className="mt-4">
        {secondaryDataLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredStoryboards.length === 0 ? (
          <Card>
            <CardContent className="pt-12 pb-12 text-center">
              <Film className="w-16 h-16 mx-auto mb-4 text-slate-500" />
              <h3 className="text-xl font-bold mb-2">分镜库为空</h3>
              <p className="text-muted-foreground">
                在分镜编辑器中保存分镜，素材会自动入库
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
      </TabsContent>

      <TabsContent value="collections" className="mt-4">
        <div className="mb-4">
          <Button onClick={onNewCollection}>
            <Plus className="w-4 h-4 mr-2" />
            新建合集
          </Button>
        </div>
        {secondaryDataLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : collections.length === 0 ? (
          <Card>
            <CardContent className="pt-12 pb-12 text-center">
              <FolderOpen className="w-16 h-16 mx-auto mb-4 text-slate-500" />
              <h3 className="text-xl font-bold mb-2">暂无合集</h3>
              <p className="text-muted-foreground">
                创建合集来组织你的角色、场景和分镜素材
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
      </TabsContent>
    </>
  );
}
