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

// 预览页面角色列表项样式：使用 card 类 + Tailwind 工具类
// 选中态：border-color:var(--primary);

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
      className="card px-3 py-2.5 cursor-pointer"
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
      <div className="flex items-center gap-2.5">
        {showImage ? (
          <img
            src={characterImage}
            alt={character.name}
            className="w-10 h-10 rounded-full object-cover shrink-0"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--primary-foreground)] font-bold text-base shrink-0 bg-[linear-gradient(135deg,var(--primary),var(--accent))]">
            {character.name.charAt(0) || "?"}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold truncate">
            {character.name || t("character.unnamed")}
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            {character.style || t("character.noStyle")}
          </div>
        </div>
        <button
          type="button"
          className="p-1 rounded bg-transparent text-destructive hover:bg-destructive/10 flex items-center justify-center shrink-0 cursor-pointer border-none transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(e);
          }}
          aria-label={t("character.deleteLabel")}
          title={t("common.delete")}
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
