import { memo } from "react";
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
import {
  Users,
  Image as ImageIcon,
  FolderOpen,
  CheckSquare,
  Square,
  Package,
  Clock,
  Link,
  Trash2,
  Download,
} from "lucide-react";
import type {
  Character,
  Scene,
  StoryboardAsset,
  Collection,
  CollectionAsset,
} from "@/domain/schemas";
import { toDateFromTimestamp } from "./asset-library-shared";
import type { EditingItem } from "./asset-library-shared";
import { t } from "@/shared/constants";

interface CharacterCardProps {
  char: Character;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onEditItem: (item: EditingItem) => void;
  onDeleteCharacter: (id: string) => void;
}

export const CharacterCard = memo(function CharacterCard({
  char,
  isSelected,
  onToggleSelect,
  onEditItem,
  onDeleteCharacter,
}: CharacterCardProps) {
  return (
    <Card
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
            aria-label={t("aria.deleteCharacter")}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      <CardContent className="p-3">
        <h4 className="font-medium truncate text-sm">
          {char.name || t("asset.unnamedCharacter")}
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
});

interface SceneCardProps {
  scene: Scene;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onEditItem: (item: EditingItem) => void;
  onDeleteScene: (id: string) => void;
}

export const SceneCard = memo(function SceneCard({
  scene,
  isSelected,
  onToggleSelect,
  onEditItem,
  onDeleteScene,
}: SceneCardProps) {
  return (
    <Card
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
            aria-label={t("aria.deleteScene")}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      <CardContent className="p-3">
        <h4 className="font-medium truncate text-sm">
          {scene.name || t("asset.unnamedScene")}
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
});

interface StoryboardCardProps {
  sb: StoryboardAsset;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onEditItem: (item: EditingItem) => void;
  onDeleteStoryboard: (id: string) => void;
}

export const StoryboardCard = memo(function StoryboardCard({
  sb,
  isSelected,
  onToggleSelect,
  onEditItem,
  onDeleteStoryboard,
}: StoryboardCardProps) {
  return (
    <Card
      className={`overflow-hidden group cursor-pointer transition-all ${isSelected ? "ring-2 ring-amber-500" : "hover:shadow-lg"}`}
      onClick={() => onEditItem({ ...sb, _type: "storyboard" })}
    >
      <div className="aspect-video bg-slate-800 relative overflow-hidden">
        {sb.previewPath ? (
          <img
            src={resolveImageUrl(sb.previewPath)}
            alt={t("asset.storyboardPreview")}
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
            aria-label={t("aria.deleteStoryboard")}
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
            {t("asset.characterCountShort", { count: sb.characterIds.length })}
          </p>
        )}
      </CardContent>
    </Card>
  );
});

interface CollectionCardProps {
  col: Collection;
  assetCount: number;
  collectionAssets: CollectionAsset[];
  characters: Character[];
  scenes: Scene[];
  onDeleteCollection: (id: string) => void;
  onExportCollection: (id: string) => void;
}

export const CollectionCard = memo(function CollectionCard({
  col,
  assetCount,
  collectionAssets,
  characters,
  scenes,
  onDeleteCollection,
  onExportCollection,
}: CollectionCardProps) {
  const getCollectionAssets = (collectionId: string) => {
    return collectionAssets.filter((ca) => ca.collectionId === collectionId);
  };

  return (
    <Card className="group hover:shadow-lg transition-all">
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
              title={t("asset.exportCollection")}
              aria-label={t("aria.exportCollection")}
            >
              <Download className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7 hover:text-destructive"
              onClick={() => onDeleteCollection(col.id)}
              title={t("asset.deleteCollection")}
              aria-label={t("aria.deleteCollection")}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        <CardDescription className="flex items-center gap-2">
          <Package className="w-3 h-3" />
          {t("asset.assetCount", { count: assetCount })}
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
});
