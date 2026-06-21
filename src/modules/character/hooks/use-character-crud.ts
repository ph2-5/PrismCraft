import { useCallback } from "react";
import type { Character, Story } from "@/domain/schemas";
import { characterService } from "../services";
import { checkCharacterReferences } from "@/domain/services";
import { defaultCharacter, normalizeGender } from "../constants";
import { useEntityCRUD } from "@/shared/hooks/use-entity-crud";

interface UseCharacterCRUDProps {
  currentCharacter: Character;
  setCurrentCharacter: (update: Character | ((prev: Character) => Character), shouldMarkDirty?: boolean) => void;
  generatedImage: string | null;
  setCustomTrait: React.Dispatch<React.SetStateAction<string>>;
  setCustomStyle: React.Dispatch<React.SetStateAction<string>>;
  setGeneratedImage: React.Dispatch<React.SetStateAction<string | null>>;
  addAssetToLibrary: (
    url: string, type: "image" | "video", name: string,
    boundTo?: { type: "character" | "scene"; id: string; name: string },
  ) => void;
  generatePrompt: (char: Character) => string;
  success: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;
  stories: Story[];
  markDirty: (key: string) => void;
  markClean: (key: string) => void;
  onUpdateStoriesAfterDelete: (characterId: string, stories: Story[]) => Promise<void>;
}

export function useCharacterCRUD({
  currentCharacter,
  setCurrentCharacter,
  generatedImage,
  setCustomTrait,
  setCustomStyle,
  setGeneratedImage,
  addAssetToLibrary, generatePrompt, success, showError, stories, markDirty, markClean, onUpdateStoriesAfterDelete,
}: UseCharacterCRUDProps) {
  const resetCustomFields = useCallback(() => {
    setCustomTrait("");
    setCustomStyle("");
  }, [setCustomTrait, setCustomStyle]);

  const crud = useEntityCRUD({
    entity: currentCharacter,
    setEntity: setCurrentCharacter,
    generatedImage,
    setGeneratedImage,
    resetCustomFields,
    applyImageToEntity: (char, imageUrl) => ({
      ...char,
      refImagePath: imageUrl,
      generatedImage: imageUrl,
    }),
    prepareEntityForSave: (char, prompt) => ({
      ...char,
      prompt,
      gender: normalizeGender(char.gender || ""),
    }),
    service: characterService,
    queryKey: ["characters"],
    entityLabel: "角色",
    entityIdPrefix: "char",
    assetLabel: "角色图片",
    checkReferences: checkCharacterReferences,
    defaultEntity: defaultCharacter,
    generatePrompt,
    addAssetToLibrary,
    assetBindType: "character",
    success,
    showError,
    stories,
    markDirty,
    markClean,
    onUpdateStoriesAfterDelete,
  });

  const addTrait = (trait: string) => {
    if (trait) {
      setCurrentCharacter((prev) => {
        if (prev.personality.includes(trait)) return prev;
        return { ...prev, personality: [...prev.personality, trait] };
      }, true);
    }
    setCustomTrait("");
  };

  const removeTrait = (trait: string) => {
    setCurrentCharacter((prev) => ({
      ...prev,
      personality: prev.personality.filter((t) => t !== trait),
    }), true);
  };

  return {
    deleteDialogOpen: crud.deleteDialogOpen,
    setDeleteDialogOpen: crud.setDeleteDialogOpen,
    characterToDelete: crud.entityToDelete,
    referenceCheck: crud.referenceCheck,
    handleSave: crud.handleSave,
    saveStatus: crud.saveStatus,
    saveError: crud.saveError,
    handleDelete: crud.handleDelete,
    performDelete: crud.performDelete,
    isDeleting: crud.isDeleting,
    addTrait,
    removeTrait,
  };
}
