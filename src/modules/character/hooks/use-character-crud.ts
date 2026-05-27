"use client";

import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Character, Story } from "@/domain/schemas";
import { characterService } from "../services";
import { checkCharacterReferences } from "@/domain/services";
import type { DeleteCheckResult } from "@/domain/services";
import { defaultCharacter, normalizeGender } from "../constants";
import { errorLogger } from "@/shared/error-logger";
import { confirm } from "@/shared/utils/confirm";
import type { SaveStatus } from "@/shared/presentation/SaveStatusIndicator";

interface UseCharacterCRUDProps {
  currentCharacter: Character;
  setCurrentCharacter: React.Dispatch<React.SetStateAction<Character>>;
  generatedImage: string | null;
  setCustomTrait: React.Dispatch<React.SetStateAction<string>>;
  setCustomStyle: React.Dispatch<React.SetStateAction<string>>;
  setGeneratedImage: React.Dispatch<React.SetStateAction<string | null>>;
  addAssetToLibrary: (
    url: string,
    type: "image" | "video",
    name: string,
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
  const queryClient = useQueryClient();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [characterToDelete, setCharacterToDelete] = useState<string | null>(null);
  const [referenceCheck, setReferenceCheck] = useState<DeleteCheckResult | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const savingRef = useRef(false);

  const handleSave = async () => {
    if (savingRef.current) return;
    savingRef.current = true;

    const trimmedName = (currentCharacter.name || "").trim();
    if (!trimmedName) {
      showError("保存失败", "角色名称不能为空");
      return;
    }

    setSaveStatus("saving");
    setSaveError("");
    try {
      const newCharacter = {
        ...currentCharacter,
        name: trimmedName,
        id: currentCharacter.id || `char_${crypto.randomUUID()}`,
        prompt: generatePrompt(currentCharacter),
        gender: normalizeGender(currentCharacter.gender || ""),
      };

      if (generatedImage) {
        newCharacter.refImagePath = generatedImage;
        newCharacter.generatedImage = generatedImage;
      }

      if (currentCharacter.id) {
        const result = await characterService.update(newCharacter.id, newCharacter);
        if (!result.ok) throw result.error;
        success("保存成功", "角色信息已更新");
      } else {
        const result = await characterService.create(newCharacter);
        if (!result.ok) throw result.error;
        if (generatedImage) {
          addAssetToLibrary(generatedImage, "image", newCharacter.name || "角色图片", {
            type: "character",
            id: result.value.id,
            name: newCharacter.name || "未命名角色",
          });
        }
        success("创建成功", "新角色已添加");
      }

      queryClient.invalidateQueries({ queryKey: ["characters"] });
      setCurrentCharacter(newCharacter);
      setCustomTrait("");
      setCustomStyle("");
      markClean("characters");
      setGeneratedImage(null);
      setSaveStatus("saved");
    } catch (err) {
      errorLogger.error("[Character] Save failed", err);
      const message = err instanceof Error ? err.message : "未知错误";
      markDirty("characters");
      setSaveStatus("error");
      setSaveError(message);
      showError("保存失败", message);
    } finally {
      savingRef.current = false;
    }
  };

  const handleDelete = async (id: string) => {
    const checkResult = checkCharacterReferences(id, currentCharacter.name, stories);
    if (checkResult.references.length > 0) {
      setCharacterToDelete(id);
      setReferenceCheck(checkResult);
      setDeleteDialogOpen(true);
    } else {
      const confirmed = await confirm({
        title: "确认删除",
        description: `确定删除角色「${currentCharacter.name}」？此操作可通过恢复功能撤销`,
        confirmText: "删除",
        cancelText: "取消",
        variant: "danger",
      });
      if (confirmed) {
        performDelete(id);
      }
    }
  };

  const performDelete = async (id: string) => {
    setIsDeleting(true);
    try {
      const result = await characterService.delete(id);
      if (!result.ok) throw result.error;
      queryClient.invalidateQueries({ queryKey: ["characters"] });

      if (currentCharacter.id === id) {
        setCurrentCharacter(defaultCharacter);
      }

      await onUpdateStoriesAfterDelete(id, stories);
      queryClient.invalidateQueries({ queryKey: ["stories"] });

      setDeleteDialogOpen(false);
      setCharacterToDelete(null);
      setReferenceCheck(null);
      success("删除成功", "角色已删除");
    } catch (err) {
      showError("删除失败", err instanceof Error ? err.message : "未知错误");
    } finally {
      setIsDeleting(false);
    }
  };

  const addTrait = (trait: string) => {
    if (trait) {
      setCurrentCharacter((prev) => {
        if (prev.personality.includes(trait)) return prev;
        return { ...prev, personality: [...prev.personality, trait] };
      });
    }
    setCustomTrait("");
  };

  const removeTrait = (trait: string) => {
    setCurrentCharacter((prev) => ({
      ...prev,
      personality: prev.personality.filter((t) => t !== trait),
    }));
  };

  return {
    deleteDialogOpen,
    setDeleteDialogOpen,
    characterToDelete,
    referenceCheck,
    handleSave,
    saveStatus,
    saveError,
    handleDelete,
    performDelete,
    isDeleting,
    addTrait,
    removeTrait,
  };
}
