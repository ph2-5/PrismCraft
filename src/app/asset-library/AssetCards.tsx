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
const cardImageAreaStyle: React.CSSProperties = {
  aspectRatio: "1 / 1",
  background: "var(--card2)",
  position: "relative",
  overflow: "hidden",
};

// 统一的卡片内容区样式
const cardContentStyle: React.CSSProperties = {
  padding: 10,
};

// 统一的选中标记样式
const selectBadgeStyle = (isSelected: boolean): React.CSSProperties => ({
  position: "absolute",
  top: 8,
  left: 8,
  cursor: "pointer",
  color: isSelected ? "var(--primary)" : "var(--muted-fg)",
  opacity: isSelected ? 1 : 0.5,
});

// 统一的删除按钮样式
const deleteBtnStyle: React.CSSProperties = {
  position: "absolute",
  top: 8,
  right: 8,
  background: "rgba(0, 0, 0, 0.5)",
  color: "var(--destructive)",
  border: "none",
  borderRadius: 4,
  padding: 4,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

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
      className="card"
      style={{
        padding: 0,
        overflow: "hidden",
        cursor: "pointer",
        border: isSelected ? "2px solid var(--primary)" : "1px solid var(--border)",
      }}
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
      <div style={cardImageAreaStyle}>
        {hasImage ? (
          <img
            src={resolveImageUrl(char.generatedImage || char.avatarPath)}
            alt={char.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={() => setImageError(true)}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Users size={40} style={{ color: "var(--muted-fg)", opacity: 0.3 }} />
          </div>
        )}
        <div
          style={selectBadgeStyle(isSelected)}
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
          style={deleteBtnStyle}
          onClick={(e) => {
            e.stopPropagation();
            onDeleteCharacter(char.id);
          }}
          aria-label={t("aria.deleteCharacter")}
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div style={cardContentStyle}>
        <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {char.name || t("asset.unnamedCharacter")}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
          {(char.tags || []).slice(0, 2).map((tag) => (
            <span key={tag} className="badge badge-muted" style={{ fontSize: 10 }}>
              {tag}
            </span>
          ))}
          {(char.tags || []).length > 2 && (
            <span className="badge badge-muted" style={{ fontSize: 10 }}>
              +{(char.tags || []).length - 2}
            </span>
          )}
        </div>
        {char.createdAt && (
          <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
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
      className="card"
      style={{
        padding: 0,
        overflow: "hidden",
        cursor: "pointer",
        border: isSelected ? "2px solid var(--primary)" : "1px solid var(--border)",
      }}
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
      <div style={cardImageAreaStyle}>
        {hasImage ? (
          <img
            src={resolveImageUrl(scene.generatedImage || scene.scenePath)}
            alt={scene.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={() => setImageError(true)}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ImageIcon size={40} style={{ color: "var(--muted-fg)", opacity: 0.3 }} />
          </div>
        )}
        <div
          style={selectBadgeStyle(isSelected)}
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
          style={deleteBtnStyle}
          onClick={(e) => {
            e.stopPropagation();
            onDeleteScene(scene.id);
          }}
          aria-label={t("aria.deleteScene")}
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div style={cardContentStyle}>
        <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {scene.name || t("asset.unnamedScene")}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
          {(scene.tags || []).slice(0, 2).map((tag) => (
            <span key={tag} className="badge badge-muted" style={{ fontSize: 10 }}>
              {tag}
            </span>
          ))}
        </div>
        {scene.atmosphere && (
          <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 4 }}>
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
      className="card"
      style={{
        padding: 0,
        overflow: "hidden",
        cursor: "pointer",
        border: isSelected ? "2px solid var(--primary)" : "1px solid var(--border)",
      }}
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
      <div style={cardImageAreaStyle}>
        {hasImage ? (
          <img
            src={resolveImageUrl(sb.previewPath)}
            alt={t("asset.storyboardPreview")}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={() => setImageError(true)}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div style={{ color: "var(--muted-fg)", fontSize: 12, textAlign: "center", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {sb.script}
            </div>
          </div>
        )}
        <div
          style={selectBadgeStyle(isSelected)}
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
          style={deleteBtnStyle}
          onClick={(e) => {
            e.stopPropagation();
            onDeleteStoryboard(sb.id);
          }}
          aria-label={t("aria.deleteStoryboard")}
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div style={cardContentStyle}>
        <div style={{ fontSize: 12, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {sb.script}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
          {sb.duration && (
            <span className="badge badge-muted" style={{ fontSize: 10 }}>
              {sb.duration}
            </span>
          )}
          {sb.shotType && (
            <span className="badge badge-muted" style={{ fontSize: 10 }}>
              {sb.shotType}
            </span>
          )}
        </div>
        {sb.characterIds?.length > 0 && (
          <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
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
    <div className="card" style={{ padding: 12 }}>
      <div style={{ paddingBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <FolderOpen size={14} />
            {col.name}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
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
              className="btn-xs"
              style={{ color: "var(--destructive)" }}
              onClick={() => onDeleteCollection(col.id)}
              title={t("asset.deleteCollection")}
              aria-label={t("aria.deleteCollection")}
            >
              <Trash2 size={12} />
            </IconButton>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted-fg)" }}>
          <Package size={11} />
          {t("asset.assetCount", { count: assetCount })}
        </div>
      </div>
      <div>
        {assetCount > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
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
                    style={{ fontSize: 10 }}
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
              <span className="badge badge-muted" style={{ fontSize: 10 }}>
                +{assetCount - 5}
              </span>
            )}
          </div>
        )}
        {col.createdAt && (
          <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 8, display: "flex", alignItems: "center", gap: 4 }}>
            <Clock size={11} />
            {toDateFromTimestamp(col.createdAt).toLocaleDateString()}
          </div>
        )}
      </div>
    </div>
  );
});
