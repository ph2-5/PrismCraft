import { useCallback } from "react";
import type { Scene, Story } from "@/domain/schemas";
import { sceneService } from "../services";
import { checkSceneReferences } from "@/domain/services";
import { defaultScene } from "../constants";
import { useEntityCRUD } from "@/shared/hooks/use-entity-crud";

interface UseSceneCRUDProps {
  currentScene: Scene;
  setCurrentScene: (update: Scene | ((prev: Scene) => Scene), shouldMarkDirty?: boolean) => void;
  generatedImage: string | null;
  setCustomElement: React.Dispatch<React.SetStateAction<string>>;
  setCustomColor: React.Dispatch<React.SetStateAction<string>>;
  setGeneratedImage: React.Dispatch<React.SetStateAction<string | null>>;
  addAssetToLibrary: (
    url: string, type: "image" | "video", name: string,
    boundTo?: { type: "character" | "scene"; id: string; name: string },
  ) => void;
  generatePrompt: (scene: Scene) => string;
  success: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;
  stories: Story[];
  markDirty: (key: string) => void;
  markClean: (key: string) => void;
  onUpdateStoriesAfterDelete: (sceneId: string, stories: Story[]) => Promise<void>;
}

export function useSceneCRUD({
  currentScene, setCurrentScene, generatedImage,
  setCustomElement, setCustomColor, setGeneratedImage,
  addAssetToLibrary, generatePrompt, success, showError, stories, markDirty, markClean, onUpdateStoriesAfterDelete,
}: UseSceneCRUDProps) {
  const resetCustomFields = useCallback(() => {
    setCustomElement("");
    setCustomColor("");
  }, [setCustomElement, setCustomColor]);

  const crud = useEntityCRUD({
    entity: currentScene,
    setEntity: setCurrentScene,
    generatedImage,
    setGeneratedImage,
    resetCustomFields,
    applyImageToEntity: (scene, imageUrl) => ({
      ...scene,
      scenePath: imageUrl,
      generatedImage: imageUrl,
    }),
    prepareEntityForSave: (scene, prompt) => ({
      ...scene,
      prompt,
    }),
    service: sceneService,
    queryKey: ["scenes"],
    entityLabel: "场景",
    entityIdPrefix: "scene",
    nameValidationMessage: "场景名称不能为空",
    assetLabel: "场景图片",
    checkReferences: checkSceneReferences,
    defaultEntity: defaultScene,
    generatePrompt,
    addAssetToLibrary,
    assetBindType: "scene",
    success,
    showError,
    stories,
    markDirty,
    markClean,
    onUpdateStoriesAfterDelete,
  });

  const addItem = (type: "elements" | "colors", value: string) => {
    if (value && !currentScene[type].includes(value)) {
      setCurrentScene((prev) => ({ ...prev, [type]: [...prev[type], value] }), true);
    }
    if (type === "elements") setCustomElement("");
    else setCustomColor("");
  };

  const removeItem = (type: "elements" | "colors", value: string) => {
    setCurrentScene((prev) => ({ ...prev, [type]: prev[type].filter((item) => item !== value) }), true);
  };

  return {
    deleteDialogOpen: crud.deleteDialogOpen,
    setDeleteDialogOpen: crud.setDeleteDialogOpen,
    sceneToDelete: crud.entityToDelete,
    referenceCheck: crud.referenceCheck,
    handleSave: crud.handleSave,
    saveStatus: crud.saveStatus,
    saveError: crud.saveError,
    handleDelete: crud.handleDelete,
    performDelete: crud.performDelete,
    isDeleting: crud.isDeleting,
    addItem,
    removeItem,
  };
}
