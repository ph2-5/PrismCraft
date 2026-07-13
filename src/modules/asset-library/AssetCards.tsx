import { memo, useState } from "react";
import { resolveImageUrl } from "@/shared/utils/image-url";
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
import { IconButton } from "@/shared/presentation/IconButton";

// 统一的卡片图片区样式
const CARD_IMAGE_AREA_CLASS = "aspect-square bg-card2 relative overflow-hidden";

// 统一的卡片内容区样式
const CARD_CONTENT_CLASS = "p-2.5";

// 统一的选中标记样式（动态颜色/透明度由调用方按 isSelected 拼接）
const selectBadgeClass = (isSelected: boolean): string =>
  `absolute top-2 left-2 cursor-pointer ${isSelected ? "text-primary opacity-100" : "text-muted-foreground opacity-50"}`;

// 统一的删除按钮样式
const DELETE_BTN_CLASS = "absolute top-2 right-2 bg-black/50 text-destructive border-none rounded p-1 cursor-pointer flex items-center justify-center";

// 选中态卡片 className（覆盖 .card 默认 border）
const cardSelectedClass = (isSelected: boolean): string =>
  isSelected ? "!border-2 !border-primary" : "";

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
  const [imageError, setImageError] = useState(false);
  const hasImage = (char.generatedImage || char.avatarPath) && !imageError;
  return (
    <div
      className={`card !p-0 overflow-hidden cursor-pointer ${cardSelectedClass(isSelected)}`}
      role="button"
      tabIndex={0}
      aria-label={char.name || t("element.characterLabel")}
      onClick={() => onEditItem({ ...char, _type: "character" })}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEditItem({ ...char, _type: "character" });
        }
      }}
    >
      <div className={CARD_IMAGE_AREA_CLASS}>
        {hasImage ? (
          <img
            src={resolveImageUrl(char.generatedImage || char.avatarPath)}
            alt={char.name}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Users size={40} className="text-muted-foreground opacity-30" />
          </div>
        )}
        <div
          className={selectBadgeClass(isSelected)}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(char.id);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onToggleSelect(char.id);
            }
          }}
          aria-label={t("aria.toggleSelection")}
          aria-pressed={isSelected}
        >
          {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
        </div>
        <button
          type="button"
          className={DELETE_BTN_CLASS}
          onClick={(e) => {
            e.stopPropagation();
            onDeleteCharacter(char.id);
          }}
          aria-label={t("aria.deleteCharacter")}
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className={CARD_CONTENT_CLASS}>
        <div className="text-xs font-semibold overflow-hidden text-ellipsis whitespace-nowrap">
          {char.name || t("asset.unnamedCharacter")}
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          {(char.tags || []).slice(0, 2).map((tag) => (
            <span key={tag} className="badge badge-muted">
              {tag}
            </span>
          ))}
          {(char.tags || []).length > 2 && (
            <span className="badge badge-muted">
              +{(char.tags || []).length - 2}
            </span>
          )}
        </div>
        {char.createdAt && (
          <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
            <Clock size={11} />
            {toDateFromTimestamp(char.createdAt).toLocaleDateString()}
          </div>
        )}
      </div>
    </div>
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
  const [imageError, setImageError] = useState(false);
  const hasImage = (scene.generatedImage || scene.scenePath) && !imageError;
  return (
    <div
      className={`card !p-0 overflow-hidden cursor-pointer ${cardSelectedClass(isSelected)}`}
      role="button"
      tabIndex={0}
      aria-label={scene.name || t("scene.title")}
      onClick={() => onEditItem({ ...scene, _type: "scene" })}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEditItem({ ...scene, _type: "scene" });
        }
      }}
    >
      <div className={CARD_IMAGE_AREA_CLASS}>
        {hasImage ? (
          <img
            src={resolveImageUrl(scene.generatedImage || scene.scenePath)}
            alt={scene.name}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon size={40} className="text-muted-foreground opacity-30" />
          </div>
        )}
        <div
          className={selectBadgeClass(isSelected)}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(scene.id);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onToggleSelect(scene.id);
            }
          }}
          aria-label={t("aria.toggleSelection")}
          aria-pressed={isSelected}
        >
          {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
        </div>
        <button
          type="button"
          className={DELETE_BTN_CLASS}
          onClick={(e) => {
            e.stopPropagation();
            onDeleteScene(scene.id);
          }}
          aria-label={t("aria.deleteScene")}
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className={CARD_CONTENT_CLASS}>
        <div className="text-xs font-semibold overflow-hidden text-ellipsis whitespace-nowrap">
          {scene.name || t("asset.unnamedScene")}
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          {(scene.tags || []).slice(0, 2).map((tag) => (
            <span key={tag} className="badge badge-muted">
              {tag}
            </span>
          ))}
        </div>
        {scene.atmosphere && (
          <div className="text-[10px] text-muted-foreground mt-1">
            {scene.atmosphere}
          </div>
        )}
      </div>
    </div>
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
  const [imageError, setImageError] = useState(false);
  const hasImage = sb.previewPath && !imageError;
  return (
    <div
      className={`card !p-0 overflow-hidden cursor-pointer ${cardSelectedClass(isSelected)}`}
      role="button"
      tabIndex={0}
      aria-label={sb.script || t("story.untitled")}
      onClick={() => onEditItem({ ...sb, _type: "storyboard" })}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEditItem({ ...sb, _type: "storyboard" });
        }
      }}
    >
      <div className={CARD_IMAGE_AREA_CLASS}>
        {hasImage ? (
          <img
            src={resolveImageUrl(sb.previewPath)}
            alt={t("asset.storyboardPreview")}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center p-4">
            <div className="text-muted-foreground text-xs text-center line-clamp-3">
              {sb.script}
            </div>
          </div>
        )}
        <div
          className={selectBadgeClass(isSelected)}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(sb.id);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onToggleSelect(sb.id);
            }
          }}
          aria-label={t("aria.toggleSelection")}
          aria-pressed={isSelected}
        >
          {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
        </div>
        <button
          type="button"
          className={DELETE_BTN_CLASS}
          onClick={(e) => {
            e.stopPropagation();
            onDeleteStoryboard(sb.id);
          }}
          aria-label={t("aria.deleteStoryboard")}
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className={CARD_CONTENT_CLASS}>
        <div className="text-xs line-clamp-2">
          {sb.script}
        </div>
        <div className="flex items-center gap-1 mt-1">
          {sb.duration && (
            <span className="badge badge-muted">
              {sb.duration}
            </span>
          )}
          {sb.shotType && (
            <span className="badge badge-muted">
              {sb.shotType}
            </span>
          )}
        </div>
        {sb.characterIds?.length > 0 && (
          <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
            <Link size={11} />
            {t("asset.characterCountShort", { count: sb.characterIds.length })}
          </div>
        )}
      </div>
    </div>
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
    <div className="card !p-3">
      <div className="pb-2">
        <div className="flex items-center justify-between">
          <div className="text-[13px] font-semibold flex items-center gap-1.5">
            <FolderOpen size={14} />
            {col.name}
          </div>
          <div className="flex gap-1">
            <IconButton
              variant="ghost"
              className="btn-xs"
              onClick={() => onExportCollection(col.id)}
              title={t("asset.exportCollection")}
              aria-label={t("aria.exportCollection")}
            >
              <Download size={12} />
            </IconButton>
            <IconButton
              variant="ghost"
              className="btn-xs !text-destructive"
              onClick={() => onDeleteCollection(col.id)}
              title={t("asset.deleteCollection")}
              aria-label={t("aria.deleteCollection")}
            >
              <Trash2 size={12} />
            </IconButton>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Package size={11} />
          {t("asset.assetCount", { count: assetCount })}
        </div>
      </div>
      <div>
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
                  <span
                    key={String(ca.id || "")}
                    className="badge badge-muted"
                  >
                    {ca.assetType === "character"
                      ? ""
                      : ca.assetType === "scene"
                        ? ""
                        : ""}
                    {name}
                  </span>
                );
              })}
            {assetCount > 5 && (
              <span className="badge badge-muted">
                +{assetCount - 5}
              </span>
            )}
          </div>
        )}
        {col.createdAt && (
          <div className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
            <Clock size={11} />
            {toDateFromTimestamp(col.createdAt).toLocaleDateString()}
          </div>
        )}
      </div>
    </div>
  );
});
