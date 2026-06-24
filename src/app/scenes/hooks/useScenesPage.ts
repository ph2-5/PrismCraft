import { useState, useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useDirtyState } from "@/shared/hooks/use-dirty-state";
import {
  useScenes,
} from "@/modules/scene";
import {
  useStories,
  storyService,
} from "@/modules/story";
import {
  useMediaAssets,
  useCreateMediaAsset,
} from "@/modules/asset";
import { sceneService } from "@/modules/scene";
import { errorLogger } from "@/shared/error-logger";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import { resolveImageUrl } from "@/shared/utils/image-url";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { t } from "@/shared/constants/messages";
import { useGlobalKeyboardActions } from "@/shared/hooks/use-global-keyboard-actions";
import {
  defaultScene,
  useSceneImage,
  useSceneCRUD,
} from "@/modules/scene";
import { confirm } from "@/shared/utils/confirm";
import type { Scene } from "@/domain/schemas";

/**
 * 场景页面所有业务逻辑的 hook。
 * page.tsx 只负责 UI 渲染，所有状态、事件处理、数据变换都在这里。
 */
export function useScenesPage() {
  const { markDirty, markClean, isDirty } = useDirtyState();
  const queryClient = useQueryClient();
  const createMediaAssetMutation = useCreateMediaAsset();
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get("highlight");

  const { data: scenes = [], isLoading: scenesLoading } = useScenes();
  const { data: stories = [] } = useStories();
  const { data: assets = [], isLoading: _assetsLoading } = useMediaAssets();
  const [showAssetSelector, setShowAssetSelector] = useState(false);
  const [currentScene, setCurrentSceneRaw] = useState<Scene>(defaultScene);
  const currentSceneRef = useRef(currentScene);

  useEffect(() => { currentSceneRef.current = currentScene; }, [currentScene]);

  const setCurrentScene = useCallback(
    (update: Scene | ((prev: Scene) => Scene), shouldMarkDirty = false) => {
      setCurrentSceneRaw(update);
      if (shouldMarkDirty) markDirty("scenes");
    },
    [markDirty],
  );

  const [customElement, setCustomElement] = useState("");
  const [customColor, setCustomColor] = useState("");
  const { success, error: showError } = useToastHelpers();

  // ── 素材库添加 ──
  const addAssetToLibrary = async (
    url: string,
    type: "image" | "video",
    name: string,
    boundTo?: { type: "character" | "scene"; id: string; name: string },
  ) => {
    await createMediaAssetMutation.mutateAsync({
      name,
      type,
      url,
      description: "",
      tags: [],
      boundTo,
    });
  };

  // ── 图像生成 ──
  const imageHook = useSceneImage({
    currentScene,
    currentSceneRef,
    setCurrentScene,
    addAssetToLibrary,
    success,
    showError,
  });

  // ── CRUD ──
  const crudHook = useSceneCRUD({
    currentScene,
    setCurrentScene,
    generatedImage: imageHook.generatedImage,
    setCustomElement,
    setCustomColor,
    setGeneratedImage: imageHook.setGeneratedImage,
    addAssetToLibrary,
    generatePrompt: imageHook.generatePrompt,
    success,
    showError,
    stories,
    markDirty,
    markClean,
    onUpdateStoriesAfterDelete: async (sceneId, storiesList) => {
      const updatedStories = storiesList.map((story) => {
        const updatedBeats = (story.beats || []).map((beat) => {
          const updated = { ...beat };
          if (updated.sceneId === sceneId) delete updated.sceneId;
          return updated;
        });
        const updatedScenes = (story.scenes || []).filter((sid) => sid !== sceneId);
        return { ...story, scenes: updatedScenes, beats: updatedBeats };
      });
      const failedStories: string[] = [];
      const affectedStories = updatedStories.filter((updatedStory) => {
        const original = storiesList.find((s) => s.id === updatedStory.id);
        return original?.beats?.some((b) => b.sceneId === sceneId) || original?.scenes?.includes(sceneId);
      });
      const results = await Promise.allSettled(
        affectedStories.map((updatedStory) =>
          storyService.update(updatedStory.id, updatedStory),
        ),
      );
      results.forEach((result, i) => {
        if (result.status === "rejected") {
          errorLogger.warn("[Scenes] 更新关联故事异常", result.reason);
          failedStories.push(affectedStories[i]!.title || affectedStories[i]!.id.slice(0, 8));
        } else if (!result.value.ok) {
          errorLogger.warn("[Scenes] 更新关联故事失败", { storyId: affectedStories[i]!.id, error: result.value.error });
          failedStories.push(affectedStories[i]!.title || affectedStories[i]!.id.slice(0, 8));
        }
      });
      if (failedStories.length > 0) {
        showError(t("story.partialUpdateFailed"), t("story.partialUpdateFailedDetail", { items: failedStories.join("、") }));
      }
    },
  });

  // ── 保存快捷键 ──
  const handleSaveRef = useRef(crudHook.handleSave);
  useEffect(() => { handleSaveRef.current = crudHook.handleSave; }, [crudHook.handleSave]);
  useGlobalKeyboardActions({ onSave: () => handleSaveRef.current() });

  // ── 选择场景 ──
  const handleSelectScene = useCallback(
    async (scene: Scene) => {
      if (currentScene.id && currentScene.id !== scene.id && isDirty("scenes")) {
        if (
          !(await confirm(
            t("scene.unsavedChangesDesc"),
            t("scene.unsavedChanges"),
          ))
        )
          return;
      }
      setCurrentScene(scene);
      imageHook.setGeneratedImage(resolveImageUrl(scene.scenePath || scene.generatedImage) || null);
    },
    [currentScene.id, isDirty, setCurrentScene, imageHook.setGeneratedImage],
  );

  // ── 创建新场景 ──
  const handleNewScene = useCallback(async () => {
    if (currentScene.id && isDirty("scenes")) {
      if (
        !(await confirm(
          t("scene.unsavedChangesDesc"),
          t("scene.unsavedChanges"),
        ))
      )
        return;
    }
    setCurrentScene(defaultScene);
    setCustomElement("");
    setCustomColor("");
  }, [currentScene.id, isDirty, setCurrentScene]);

  // ── 高亮跳转 ──
  useEffect(() => {
    if (!highlightId || scenes.length === 0) return;
    const found = scenes.find((s) => s.id === highlightId);
    if (found) {
      setCurrentSceneRaw(found);
      imageHook.setGeneratedImage(found.generatedImage || found.scenePath || null);
    }
  }, [highlightId, scenes, imageHook.setGeneratedImage]);

  // ── 素材库选择回调 ──
  const handleAssetSelect = useCallback(
    async (asset: { url: string }) => {
      imageHook.setGeneratedImage(asset.url);
      if (currentScene.id) {
        try {
          const result = await sceneService.update(currentScene.id, {
            ...currentScene,
            scenePath: asset.url,
            generatedImage: asset.url,
          });
          if (!result.ok) throw result.error;
          queryClient.invalidateQueries({ queryKey: ["scenes"] });
        } catch (err) {
          showError(t("error.saveFailed"), mapUserFacingError(err));
        }
      }
      setShowAssetSelector(false);
      success(t("success.applied"), t("success.imageSelectedFromLibrary"));
    },
    [currentScene, imageHook.setGeneratedImage, queryClient, showError, success],
  );

  return {
    // 数据
    scenes,
    scenesLoading,
    assets,
    currentScene,
    setCurrentScene,
    customElement,
    setCustomElement,
    customColor,
    setCustomColor,

    // 图像
    isGenerating: imageHook.isGenerating,
    generatedImage: imageHook.generatedImage,
    isUploading: imageHook.isUploading,
    isAnalyzing: imageHook.isAnalyzing,
    isOptimizingPrompt: imageHook.isOptimizingPrompt,
    imageSize: imageHook.imageSize,
    setImageSize: imageHook.setImageSize,
    fileInputRef: imageHook.fileInputRef,
    analyzeFileInputRef: imageHook.analyzeFileInputRef,
    selectedImageModel: imageHook.selectedImageModel,
    setSelectedImageModel: imageHook.setSelectedImageModel,
    generatePrompt: imageHook.generatePrompt,
    optimizePrompt: imageHook.optimizePrompt,
    generateImage: imageHook.generateImage,
    saveImageToScene: imageHook.saveImageToScene,
    handleFileUpload: imageHook.handleFileUpload,
    handleAnalyzeFileUpload: imageHook.handleAnalyzeFileUpload,
    clearImage: imageHook.clearImage,

    // CRUD
    deleteDialogOpen: crudHook.deleteDialogOpen,
    setDeleteDialogOpen: crudHook.setDeleteDialogOpen,
    sceneToDelete: crudHook.sceneToDelete,
    referenceCheck: crudHook.referenceCheck,
    handleSave: crudHook.handleSave,
    saveStatus: crudHook.saveStatus,
    saveError: crudHook.saveError,
    handleDelete: crudHook.handleDelete,
    performDelete: crudHook.performDelete,
    isDeleting: crudHook.isDeleting,
    addItem: crudHook.addItem,
    removeItem: crudHook.removeItem,

    // 事件
    handleSelectScene,
    handleNewScene,
    handleAssetSelect,

    // 弹窗
    showAssetSelector,
    setShowAssetSelector,

    // 计算
    isDirty: isDirty("scenes"),
  };
}
