"use client";

import { resolveImageUrl } from "@/shared/utils/image-url";

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

export function CharacterListItem({
  character,
  onClick,
  onDelete,
}: CharacterListItemProps) {
  const getCharacterImage = (
    char: CharacterListItemProps["character"],
  ): string | undefined => {
    return resolveImageUrl(
      char.avatarPath || char.generatedImage || char.refImagePath,
    );
  };
  const characterImage = getCharacterImage(character);

  return (
    <div
      className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted cursor-pointer mx-2 my-1"
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        {characterImage ? (
          <img
            src={characterImage}
            alt={character.name}
            className="w-10 h-10 rounded-full object-cover"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold">
            {character.name.charAt(0) || "?"}
          </div>
        )}
        <div className="min-w-0">
          <p className="font-medium truncate">
            {character.name || "未命名角色"}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {character.style || "无风格"}
          </p>
        </div>
      </div>
      <button
        className="p-2 hover:bg-destructive/10 rounded-full transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(e);
        }}
        aria-label="删除角色"
      >
        <svg
          className="w-4 h-4 text-destructive"
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
  );
}
