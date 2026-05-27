"use client";

import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Scene, Story } from "@/domain/schemas";
import { sceneService } from "../services";
import { checkSceneReferences } from "@/domain/services";
import type { DeleteCheckResult } from "@/domain/services";
import { defaultScene } from "../constants";
import { errorLogger } from "@/shared/error-logger";
import { confirm } from "@/shared/utils/confirm";
import type { SaveStatus } from "@/shared/presentation/SaveStatusIndicator";

interface UseSceneCRUDProps {
  currentScene: Scene;
  setCurrentScene: React.Dispatch<React.SetStateAction<Scene>>;
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
  const queryClient = useQueryClient();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sceneToDelete, setSceneToDelete] = useState<string | null>(null);
  const [referenceCheck, setReferenceCheck] = useState<DeleteCheckResult | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const savingRef = useRef(false);

  const handleSave = async () => {
    if (savingRef.current) return;
    savingRef.current = true;

    const trimmedName = (currentScene.name || "").trim();
    if (!trimmedName) {
      showError("保存失败", "场景名称不能为空");
      return;
    }

    setSaveStatus("saving");
    setSaveError("");
    try {
      const newScene = {
        ...currentScene,
        name: trimmedName,
        id: currentScene.id || `scene_${crypto.randomUUID()}`,
        prompt: generatePrompt(currentScene),
      };
      if (generatedImage) {
        newScene.scenePath = generatedImage;
        newScene.generatedImage = generatedImage;
      }

      if (currentScene.id) {
        const result = await sceneService.update(newScene.id, newScene);
        if (!result.ok) throw result.error;
        success("保存成功", "场景信息已更新");
      } else {
        const result = await sceneService.create(newScene);
        if (!result.ok) throw result.error;
        if (generatedImage) {
          addAssetToLibrary(generatedImage, "image", newScene.name || "场景图片", {
            type: "scene", id: result.value.id, name: newScene.name || "未命名场景",
          });
        }
        success("创建成功", "新场景已添加");
      }

      queryClient.invalidateQueries({ queryKey: ["scenes"] });
      setCurrentScene(newScene);
      setCustomElement("");
      setCustomColor("");
      markClean("scenes");
      setGeneratedImage(null);
      setSaveStatus("saved");
    } catch (err) {
      errorLogger.error("[Scene] Save failed", err);
      const message = err instanceof Error ? err.message : "未知错误";
      markDirty("scenes");
      setSaveStatus("error");
      setSaveError(message);
      showError("保存失败", message);
    } finally {
      savingRef.current = false;
    }
  };

  const handleDelete = async (id: string) => {
    const checkResult = checkSceneReferences(id, currentScene.name, stories);
    if (checkResult.references.length > 0) {
      setSceneToDelete(id);
      setReferenceCheck(checkResult);
      setDeleteDialogOpen(true);
    } else {
      const confirmed = await confirm({
        title: "确认删除",
        description: `确定删除场景「${currentScene.name}」？此操作可通过恢复功能撤销`,
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
      const result = await sceneService.delete(id);
      if (!result.ok) throw result.error;
      queryClient.invalidateQueries({ queryKey: ["scenes"] });

      if (currentScene.id === id) {
        setCurrentScene(defaultScene);
      }

      await onUpdateStoriesAfterDelete(id, stories);
      queryClient.invalidateQueries({ queryKey: ["stories"] });

      setDeleteDialogOpen(false);
      setSceneToDelete(null);
      setReferenceCheck(null);
      success("删除成功", "场景已删除");
    } catch (err) {
      showError("删除失败", err instanceof Error ? err.message : "未知错误");
    } finally {
      setIsDeleting(false);
    }
  };

  const addItem = (type: "elements" | "colors", value: string) => {
    if (value && !currentScene[type].includes(value)) {
      setCurrentScene((prev) => ({ ...prev, [type]: [...prev[type], value] }));
    }
    if (type === "elements") setCustomElement("");
    else setCustomColor("");
  };

  const removeItem = (type: "elements" | "colors", value: string) => {
    setCurrentScene((prev) => ({ ...prev, [type]: prev[type].filter((item) => item !== value) }));
  };

  return { deleteDialogOpen, setDeleteDialogOpen, sceneToDelete, referenceCheck, handleSave, saveStatus, saveError, handleDelete, performDelete, isDeleting, addItem, removeItem };
}
