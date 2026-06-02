import { useState, useRef, useCallback, useEffect, Suspense } from "react";
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
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import type { Scene } from "@/domain/schemas";
import {
  Save,
  X,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { t } from "@/shared/constants/messages";
import { useGlobalKeyboardActions } from "@/shared/hooks/use-global-keyboard-actions";
import { MediaExporter } from "@/modules/asset";
import { SceneEditorTabs } from "./components/SceneEditorTabs";
import { ImageActionToolbar } from "./components/ImageActionToolbar";
import { SceneList } from "./components/SceneList";
import { DeleteConfirmDialog } from "@/shared/presentation/DeleteConfirmDialog";
import { AssetSelectorDialog } from "@/shared/presentation/AssetSelectorDialog";
import {
  defaultScene,
  useSceneImage,
  useSceneCRUD,
} from "@/modules/scene";
import { confirm } from "@/shared/utils/confirm";

export default function ScenesPage() {
  return (
    <Suspense>
      <ScenesPageContent />
    </Suspense>
  );
}

function ScenesPageContent() {
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

  const {
    isGenerating,
    generatedImage,
    setGeneratedImage,
    isUploading,
    isAnalyzing,
    isOptimizingPrompt,
    imageSize,
    setImageSize,
    fileInputRef,
    analyzeFileInputRef,
    selectedImageModel,
    setSelectedImageModel,
    generatePrompt,
    optimizePrompt,
    generateImage,
    saveImageToScene,
    handleFileUpload,
    handleAnalyzeFileUpload,
    clearImage,
  } = useSceneImage({
    currentScene,
    currentSceneRef,
    setCurrentScene,
    addAssetToLibrary,
    success,
    showError,
  });

  const {
    deleteDialogOpen,
    setDeleteDialogOpen,
    sceneToDelete,
    referenceCheck,
    handleSave,
    saveStatus,
    saveError,
    handleDelete,
    performDelete,
    isDeleting,
    addItem,
    removeItem,
  } = useSceneCRUD({
    currentScene,
    setCurrentScene,
    generatedImage,
    setCustomElement,
    setCustomColor,
    setGeneratedImage,
    addAssetToLibrary,
    generatePrompt,
    success,
    showError,
    stories,
    markDirty,
    markClean,
    onUpdateStoriesAfterDelete: async (sceneId, storiesList) => {
      const updatedStories = storiesList.map((story) => {
        const updatedBeats = (story.beats || []).map((beat) => {
          const updated = { ...beat };
          if (updated.scene === sceneId) delete updated.scene;
          if (updated.sceneId === sceneId) delete updated.sceneId;
          return updated;
        });
        const updatedScenes = (story.scenes || []).filter((sid) => sid !== sceneId);
        return { ...story, scenes: updatedScenes, beats: updatedBeats };
      });
      const failedStories: string[] = [];
      for (const updatedStory of updatedStories) {
        const original = storiesList.find((s) => s.id === updatedStory.id);
        const wasAffected = original?.beats?.some((b) => b.scene === sceneId || b.sceneId === sceneId) || original?.scenes?.includes(sceneId);
        if (wasAffected) {
          try {
            const result = await storyService.update(updatedStory.id, updatedStory);
            if (!result.ok) {
              errorLogger.warn("[Scenes] 更新关联故事失败", { storyId: updatedStory.id, error: result.error });
              failedStories.push(updatedStory.title || updatedStory.id.slice(0, 8));
            }
          } catch (e) {
            errorLogger.warn("[Scenes] 更新关联故事异常", e);
            failedStories.push(updatedStory.title || updatedStory.id.slice(0, 8));
          }
        }
      }
      if (failedStories.length > 0) {
        showError(t("story.partialUpdateFailed"), t("story.partialUpdateFailedDetail", { items: failedStories.join("、") }));
      }
    },
  });

  const handleSaveRef = useRef(handleSave);
  useEffect(() => { handleSaveRef.current = handleSave; }, [handleSave]);

  const handleSelectScene = useCallback(
    async (scene: Scene) => {
      if (currentScene.id && currentScene.id !== scene.id && isDirty("scenes")) {
        if (
          !(await confirm(
            "当前场景有未保存的修改，切换将丢失这些修改。确定要继续吗？",
            "未保存的修改",
          ))
        )
          return;
      }
      setCurrentScene(scene);
      setGeneratedImage(resolveImageUrl(scene.scenePath || scene.generatedImage) || null);
    },
    [currentScene.id, isDirty, setCurrentScene, setGeneratedImage],
  );

  const handleNewScene = useCallback(async () => {
    if (currentScene.id && isDirty("scenes")) {
      if (
        !(await confirm(
          "当前场景有未保存的修改，切换将丢失这些修改。确定要继续吗？",
          "未保存的修改",
        ))
      )
        return;
    }
    setCurrentScene(defaultScene);
    setCustomElement("");
    setCustomColor("");
  }, [currentScene.id, isDirty, setCurrentScene]);

  useGlobalKeyboardActions({
    onSave: () => handleSaveRef.current(),
  });

  useEffect(() => {
    if (!highlightId || scenes.length === 0) return;
    const found = scenes.find((s) => s.id === highlightId);
    if (found) {
      setCurrentSceneRaw(found);
      setGeneratedImage(found.generatedImage || found.scenePath || null);
    }
  }, [highlightId, scenes, setGeneratedImage]);

  return (
    <PageErrorBoundary pageName="场景">
      <div className="h-full flex gap-3">
        <SceneList
          scenes={scenes}
          scenesLoading={scenesLoading}
          currentSceneId={currentScene.id}
          isDirty={isDirty("scenes")}
          onSelectScene={handleSelectScene}
          onDeleteScene={handleDelete}
          onNewScene={handleNewScene}
        />

        <div className="flex-1 min-w-0 border border-border rounded-lg bg-card overflow-hidden">
          <div className="h-full overflow-y-auto">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold">
                {currentScene.id ? "编辑场景" : "创建新场景"}
              </h3>
              <p className="text-xs text-muted-foreground">
                自由填写，所有字段都是可选的
              </p>
            </div>
            <div className="p-4">
              <SceneEditorTabs
                currentScene={currentScene}
                setCurrentScene={setCurrentScene}
                customElement={customElement}
                setCustomElement={setCustomElement}
                customColor={customColor}
                setCustomColor={setCustomColor}
                addItem={addItem}
                removeItem={removeItem}
              />

              <div className="mt-6 p-4 rounded-lg bg-slate-900/50 border border-blue-800/30 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-blue-200">
                    图片生成提示词
                  </Label>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 border-blue-700 bg-blue-900/20 hover:bg-blue-900/40 text-blue-200"
                    onClick={optimizePrompt}
                    disabled={isOptimizingPrompt}
                  >
                    {isOptimizingPrompt ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {isOptimizingPrompt ? "优化中..." : "AI优化"}
                  </Button>
                </div>
                <Textarea
                  value={
                    currentScene.imageGenerationPrompt ||
                    generatePrompt(currentScene)
                  }
                  onChange={(e) =>
                    setCurrentScene((prev) => ({
                      ...prev,
                      imageGenerationPrompt: e.target.value,
                    }), true)
                  }
                  placeholder="输入图片生成提示词，或点击 'AI优化' 按钮自动优化..."
                  rows={6}
                  className="bg-slate-800/50 border-blue-700/50 text-blue-100 placeholder:text-blue-400/60 focus-visible:ring-blue-500 resize-none"
                />
                {!currentScene.imageGenerationPrompt && (
                  <p className="text-xs text-blue-400/60">
                    提示：首次使用时会自动填充提示词，你可以直接编辑或点击
                    AI优化 来优化它
                  </p>
                )}
              </div>

              {(generatedImage ||
                currentScene.scenePath ||
                currentScene.generatedImage) && (
                <div className="mt-6 p-4 rounded-lg bg-slate-900/50 border border-cyan-800/30 space-y-3">
                  <Label className="text-sm font-medium text-cyan-200">
                    场景图像
                  </Label>
                  <div className="relative aspect-video max-w-lg mx-auto rounded-lg overflow-hidden border border-cyan-700/50 shadow-lg shadow-cyan-500/20">
                    <img
                      src={resolveImageUrl(
                        generatedImage ||
                          currentScene.scenePath ||
                          currentScene.generatedImage,
                      )}
                      alt="Generated scene"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-2"
                      onClick={saveImageToScene}
                      disabled={!currentScene.id}
                    >
                      <Save className="w-4 h-4" />
                      保存到场景
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={clearImage}
                    >
                      <X className="w-4 h-4" />
                      清除
                    </Button>
                  </div>
                </div>
              )}

              <ImageActionToolbar
                isDirty={isDirty("scenes")}
                saveStatus={saveStatus}
                saveError={saveError}
                handleSave={handleSave}
                isGenerating={isGenerating}
                imageSize={imageSize}
                setImageSize={setImageSize}
                generateImage={generateImage}
                selectedImageModel={selectedImageModel}
                setSelectedImageModel={setSelectedImageModel}
                isUploading={isUploading}
                fileInputRef={fileInputRef}
                handleFileUpload={handleFileUpload}
                isAnalyzing={isAnalyzing}
                analyzeFileInputRef={analyzeFileInputRef}
                handleAnalyzeFileUpload={handleAnalyzeFileUpload}
                onShowAssetSelector={() => setShowAssetSelector(true)}
                entityType="scene"
              />
            </div>
          </div>
        </div>
      </div>

      {currentScene.id && <MediaExporter type="scene" item={currentScene} />}

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        entityLabel="场景"
        isDeleting={isDeleting}
        onConfirm={() => sceneToDelete && performDelete(sceneToDelete)}
        referenceCheck={referenceCheck}
      />

      <AssetSelectorDialog
        open={showAssetSelector}
        onOpenChange={setShowAssetSelector}
        assets={assets}
        description="选择一张图片作为场景图像"
        onSelect={async (asset) => {
          setGeneratedImage(asset.url);
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
        }}
      />
    </PageErrorBoundary>
  );
}
