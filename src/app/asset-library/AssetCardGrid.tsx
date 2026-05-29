"use client";

import { resolveImageUrl } from "@/shared/utils/image-url";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { TabsContent } from "@/shared/ui/tabs";
import {
  Users,
  Image as ImageIcon,
  Film,
  FolderOpen,
  CheckSquare,
  Square,
  Package,
  Clock,
  Link,
  Loader2,
  Trash2,
  Download,
  Plus,
} from "lucide-react";
import type {
  Character,
  Scene,
  StoryboardAsset,
  Collection,
  CollectionAsset,
} from "@/domain/schemas";
import { container } from "@/infrastructure/di";

export type AssetTab = "characters" | "scenes" | "storyboards" | "collections";

export type EditingItem =
  | (Character & { _type: "character" })
  | (Scene & { _type: "scene" })
  | (StoryboardAsset & { _type: "storyboard" });

export function toDateFromTimestamp(ts: unknown): Date {
  if (typeof ts === "number") return new Date(ts * 1000);
  if (typeof ts === "string") {
    const d = new Date(ts);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

export async function fetchSecondaryData() {
  const [sb, col, colAssets] = await Promise.all([
    container.storyboardStorage.getStoryboardAssets(),
    container.collectionStorage.getCollections(),
    container.collectionStorage.getCollectionAssets(),
  ]);
  return { storyboards: sb, collections: col, collectionAssets: colAssets };
}

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

  const getCollectionAssets = (collectionId: string) => {
    return collectionAssets.filter((ca) => ca.collectionId === collectionId);
  };

  const renderCharacterCard = (char: Character) => {
    const isSelected = selectedIds.has(char.id);
    return (
      <Card
        key={char.id}
        className={`overflow-hidden group cursor-pointer transition-all ${isSelected ? "ring-2 ring-purple-500" : "hover:shadow-lg"}`}
        onClick={() => onEditItem({ ...char, _type: "character" })}
      >
        <div className="aspect-square bg-slate-800 relative overflow-hidden">
          {char.generatedImage || char.avatarPath ? (
            <img
              src={resolveImageUrl(char.generatedImage || char.avatarPath)}
              alt={char.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Users className="w-12 h-12 text-slate-600" />
            </div>
          )}
          <div
            className="absolute top-2 left-2 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect(char.id);
            }}
          >
            {isSelected ? (
              <CheckSquare className="w-5 h-5 text-purple-400" />
            ) : (
              <Square className="w-5 h-5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </div>
          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7 bg-black/50 hover:bg-red-900/70 text-white"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteCharacter(char.id);
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        <CardContent className="p-3">
          <h4 className="font-medium truncate text-sm">
            {char.name || "未命名角色"}
          </h4>
          <div className="flex flex-wrap gap-1 mt-1">
            {(char.tags || []).slice(0, 2).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {(char.tags || []).length > 2 && (
              <Badge variant="secondary" className="text-xs">
                +{(char.tags || []).length - 2}
              </Badge>
            )}
          </div>
          {char.createdAt && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {toDateFromTimestamp(char.createdAt).toLocaleDateString()}
            </p>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderSceneCard = (scene: Scene) => {
    const isSelected = selectedIds.has(scene.id);
    return (
      <Card
        key={scene.id}
        className={`overflow-hidden group cursor-pointer transition-all ${isSelected ? "ring-2 ring-blue-500" : "hover:shadow-lg"}`}
        onClick={() => onEditItem({ ...scene, _type: "scene" })}
      >
        <div className="aspect-video bg-slate-800 relative overflow-hidden">
          {scene.generatedImage || scene.scenePath ? (
            <img
              src={resolveImageUrl(scene.generatedImage || scene.scenePath)}
              alt={scene.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon className="w-12 h-12 text-slate-600" />
            </div>
          )}
          <div
            className="absolute top-2 left-2 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect(scene.id);
            }}
          >
            {isSelected ? (
              <CheckSquare className="w-5 h-5 text-blue-400" />
            ) : (
              <Square className="w-5 h-5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </div>
          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7 bg-black/50 hover:bg-red-900/70 text-white"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteScene(scene.id);
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        <CardContent className="p-3">
          <h4 className="font-medium truncate text-sm">
            {scene.name || "未命名场景"}
          </h4>
          <div className="flex flex-wrap gap-1 mt-1">
            {(scene.tags || []).slice(0, 2).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
          {scene.atmosphere && (
            <p className="text-xs text-muted-foreground mt-1">
              {scene.atmosphere}
            </p>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderStoryboardCard = (sb: StoryboardAsset) => {
    const isSelected = selectedIds.has(sb.id);
    return (
      <Card
        key={sb.id}
        className={`overflow-hidden group cursor-pointer transition-all ${isSelected ? "ring-2 ring-amber-500" : "hover:shadow-lg"}`}
        onClick={() => onEditItem({ ...sb, _type: "storyboard" })}
      >
        <div className="aspect-video bg-slate-800 relative overflow-hidden">
          {sb.previewPath ? (
            <img
              src={resolveImageUrl(sb.previewPath)}
              alt="分镜预览"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center p-4">
              <p className="text-slate-400 text-sm text-center line-clamp-3">
                {sb.script}
              </p>
            </div>
          )}
          <div
            className="absolute top-2 left-2 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect(sb.id);
            }}
          >
            {isSelected ? (
              <CheckSquare className="w-5 h-5 text-amber-400" />
            ) : (
              <Square className="w-5 h-5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </div>
          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7 bg-black/50 hover:bg-red-900/70 text-white"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteStoryboard(sb.id);
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        <CardContent className="p-3">
          <p className="text-sm line-clamp-2">{sb.script}</p>
          <div className="flex items-center gap-2 mt-1">
            {sb.duration && (
              <Badge variant="outline" className="text-xs">
                {sb.duration}
              </Badge>
            )}
            {sb.shotType && (
              <Badge variant="outline" className="text-xs">
                {sb.shotType}
              </Badge>
            )}
          </div>
          {sb.characterIds?.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Link className="w-3 h-3" />
              {sb.characterIds.length} 个角色
            </p>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderCollectionCard = (col: Collection) => {
    const assetCount = getCollectionAssetCount(col.id);
    return (
      <Card key={col.id} className="group hover:shadow-lg transition-all">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FolderOpen className="w-4 h-4" />
              {col.name}
            </CardTitle>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="icon"
                className="w-7 h-7"
                onClick={() => onExportCollection(col.id)}
                title="导出合集"
              >
                <Download className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="w-7 h-7 hover:text-destructive"
                onClick={() => onDeleteCollection(col.id)}
                title="删除合集"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
          <CardDescription className="flex items-center gap-2">
            <Package className="w-3 h-3" />
            {assetCount} 个素材
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {assetCount > 0 && (
            <div className="flex flex-wrap gap-1">
              {getCollectionAssets(col.id)
                .slice(0, 5)
                .map((ca) => {
                  let name = String(ca.assetId || "");
                  if (ca.assetType === "character") {
                    const c = characters.find((ch) => ch.id === ca.assetId);
                    if (c) name = String(c.name || "");
                  } else if (ca.assetType === "scene") {
                    const s = scenes.find((sc) => sc.id === ca.assetId);
                    if (s) name = String(s.name || "");
                  }
                  return (
                    <Badge
                      key={String(ca.id || "")}
                      variant="secondary"
                      className="text-xs"
                    >
                      {ca.assetType === "character"
                        ? "👤"
                        : ca.assetType === "scene"
                          ? "🏞️"
                          : "🎬"}
                      {name}
                    </Badge>
                  );
                })}
              {assetCount > 5 && (
                <Badge variant="secondary" className="text-xs">
                  +{assetCount - 5}
                </Badge>
              )}
            </div>
          )}
          {col.createdAt && (
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {toDateFromTimestamp(col.createdAt).toLocaleDateString()}
            </p>
          )}
        </CardContent>
      </Card>
    );
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
            {filteredCharacters.map(renderCharacterCard)}
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
            {filteredScenes.map(renderSceneCard)}
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
            {filteredStoryboards.map(renderStoryboardCard)}
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
            {collections.map(renderCollectionCard)}
          </div>
        )}
      </TabsContent>
    </>
  );
}
