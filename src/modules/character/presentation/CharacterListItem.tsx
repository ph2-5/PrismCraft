import React, { useState } from "react";
import { resolveImageUrl } from "@/shared/utils/image-url";
import { t } from "@/shared/constants";

interface CharacterListItemProps {
  character: {
    id: string;
    name: string;
    style?: string;
    generatedImage?: string;
    avatarPath?: string;
    refImagePath?: string;
  };
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}

// 预览页面角色列表项样式：使用 card 类
// padding:10px 12px;cursor:pointer;
// 选中态：border-color:var(--primary);
const itemStyle: React.CSSProperties = {
  padding: "10px 12px",
  cursor: "pointer",
};

// 预览页面头像样式：element-avatar character 类
const avatarStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 20,
  objectFit: "cover",
  flexShrink: 0,
};

// 预览页面头像占位符：渐变背景
const avatarPlaceholderStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 20,
  background: "linear-gradient(135deg, var(--primary), var(--accent))",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--primary-foreground)",
  fontWeight: 700,
  fontSize: 16,
  flexShrink: 0,
};

const nameStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const styleStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--muted-fg)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const deleteBtnStyle: React.CSSProperties = {
  padding: 4,
  borderRadius: 4,
  border: "none",
  background: "transparent",
  cursor: "pointer",
  color: "var(--destructive)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

export const CharacterListItem = React.memo(function CharacterListItem({
  character,
  onClick,
  onDelete,
}: CharacterListItemProps) {
  const [imageError, setImageError] = useState(false);
  const getCharacterImage = (
    char: CharacterListItemProps["character"],
  ): string | undefined => {
    return resolveImageUrl(
      char.avatarPath || char.generatedImage || char.refImagePath,
    );
  };
  const characterImage = getCharacterImage(character);
  const showImage = characterImage && !imageError;

  return (
    <div
      className="card"
      style={itemStyle}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={t("character.selectLabel", { name: character.name || t("character.unnamed") })}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {showImage ? (
          <img
            src={characterImage}
            alt={character.name}
            style={avatarStyle}
            onError={() => setImageError(true)}
          />
        ) : (
          <div style={avatarPlaceholderStyle}>
            {character.name.charAt(0) || "?"}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={nameStyle}>
            {character.name || t("character.unnamed")}
          </div>
          <div style={styleStyle}>
            {character.style || t("character.noStyle")}
          </div>
        </div>
        <button
          type="button"
          style={deleteBtnStyle}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(e);
          }}
          aria-label={t("character.deleteLabel")}
        >
          <svg
            width={14}
            height={14}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>
    </div>
  );
});
