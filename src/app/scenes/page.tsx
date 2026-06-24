import { Suspense } from "react";
import { resolveImageUrl } from "@/shared/utils/image-url";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import {
  Save,
  X,
  Loader2,
  Sparkles,
} from "lucide-react";
import { t } from "@/shared/constants/messages";
import { MediaExporter } from "@/modules/asset";
import { SceneEditorTabs } from "./components/SceneEditorTabs";
import { ImageActionToolbar } from "./components/ImageActionToolbar";
import { SceneList } from "./components/SceneList";
import { DeleteConfirmDialog } from "@/shared/presentation/DeleteConfirmDialog";
import { AssetSelectorDialog } from "@/shared/presentation/AssetSelectorDialog";
import { useScenesPage } from "./hooks/useScenesPage";

export default function ScenesPage() {
  return (
    <Suspense>
      <ScenesPageContent />
    </Suspense>
  );
}

function ScenesPageContent() {
  const {
    scenes,
    scenesLoading,
    assets,
    currentScene,
    setCurrentScene,
    customElement,
    setCustomElement,
    customColor,
    setCustomColor,
    isGenerating,
    generatedImage,
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
    handleSelectScene,
    handleNewScene,
    handleAssetSelect,
    showAssetSelector,
    setShowAssetSelector,
    isDirty,
  } = useScenesPage();

  return (
    <PageErrorBoundary pageName={t("scene.pageName")}>
      <div className="h-full flex gap-3">
        <SceneList
          scenes={scenes}
          scenesLoading={scenesLoading}
          currentSceneId={currentScene.id}
          isDirty={isDirty}
          onSelectScene={handleSelectScene}
          onDeleteScene={handleDelete}
          onNewScene={handleNewScene}
        />

        <div className="flex-1 min-w-0 border border-border rounded-lg bg-card overflow-hidden">
          <div className="h-full overflow-y-auto">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold">
                {currentScene.id ? t("scene.editScene") : t("scene.createNewScene")}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t("scene.allFieldsOptional")}
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
                    {t("scene.imageGenerationPrompt")}
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
                    {isOptimizingPrompt ? t("scene.optimizing") : t("scene.aiOptimize")}
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
                  placeholder={t("scene.promptPlaceholder")}
                  rows={6}
                  className="bg-slate-800/50 border-blue-700/50 text-blue-100 placeholder:text-blue-400/60 focus-visible:ring-blue-500 resize-none"
                />
                {!currentScene.imageGenerationPrompt && (
                  <p className="text-xs text-blue-400/60">
                    {t("scene.promptAutoFillHint")}
                  </p>
                )}
              </div>

              {(generatedImage ||
                currentScene.scenePath ||
                currentScene.generatedImage) && (
                <div className="mt-6 p-4 rounded-lg bg-slate-900/50 border border-cyan-800/30 space-y-3">
                  <Label className="text-sm font-medium text-cyan-200">
                    {t("scene.sceneImage")}
                  </Label>
                  <div className="relative aspect-video max-w-lg mx-auto rounded-lg overflow-hidden border border-cyan-700/50 shadow-lg shadow-cyan-500/20">
                    <img
                      src={resolveImageUrl(
                        generatedImage ||
                          currentScene.scenePath ||
                          currentScene.generatedImage,
                      )}
                      alt={t("scene.sceneImage")}
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
                      {t("scene.saveToScene")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={clearImage}
                    >
                      <X className="w-4 h-4" />
                      {t("scene.clear")}
                    </Button>
                  </div>
                </div>
              )}

              <ImageActionToolbar
                isDirty={isDirty}
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
        entityLabel={t("scene.label")}
        isDeleting={isDeleting}
        onConfirm={() => sceneToDelete && performDelete(sceneToDelete)}
        referenceCheck={referenceCheck}
      />

      <AssetSelectorDialog
        open={showAssetSelector}
        onOpenChange={setShowAssetSelector}
        assets={assets}
        description={t("scene.selectImage")}
        onSelect={handleAssetSelect}
      />
    </PageErrorBoundary>
  );
}
