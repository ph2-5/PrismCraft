import { Suspense, useState } from "react";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { t } from "@/shared/constants/messages";
import { SceneList } from "./components/SceneList";
import { DeleteConfirmDialog } from "@/shared/presentation/DeleteConfirmDialog";
import { AssetSelectorDialog } from "@/shared/presentation/AssetSelectorDialog";
import { Tabs, type TabItem } from "@/shared/presentation/Tabs";
import { useScenesPage } from "./hooks/use-scenes-page";
import {
  ScenePageHeader,
  SceneDetailHeader,
  SceneBasicInfoCard,
  SceneAtmosphereCard,
  SceneSpaceCard,
  SceneElementsCard,
  SceneReferencedBeatsCard,
  SceneImageGenerationCard,
  SceneActionFooter,
} from "./SceneEditorParts";
import type { useScenesPage as UseScenesPage } from "./hooks/use-scenes-page";

type ScenesPageState = ReturnType<typeof UseScenesPage>;

function SceneDetailContainer(state: ScenesPageState) {
  const {
    currentScene,
    setCurrentScene,
    customElement,
    setCustomElement,
    generatedImage,
    isGenerating,
    isUploading,
    isAnalyzing,
    isOptimizingPrompt,
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
    handleSave,
    saveStatus,
    saveError,
    handleDelete,
    addItem,
    removeItem,
    setShowAssetSelector,
    isDirty,
    showElementInput,
    setShowElementInput,
    referencedBeats,
    avatarImage,
  } = state;
  const [activeTab, setActiveTab] = useState("basic");
  const tabItems: TabItem[] = [
    { id: "basic", label: t("editor.tab.basic") },
    { id: "references", label: t("editor.tab.references") },
    { id: "generation", label: t("editor.tab.generation") },
  ];
  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      {/* Header - 固定不滚动 */}
      <div className="p-4 pb-2 flex-shrink-0">
        <SceneDetailHeader
          scene={currentScene}
          avatarImage={avatarImage}
          referencedBeats={referencedBeats}
          setCurrentScene={setCurrentScene}
          onChangeCover={() => setShowAssetSelector(true)}
        />
      </div>

      {/* Tabs - 固定不滚动 */}
      <div className="px-4 flex-shrink-0">
        <Tabs
          tabs={tabItems}
          activeTab={activeTab}
          onChange={setActiveTab}
          className="!px-0"
        />
      </div>

      {/* Tab 内容 - 滚动区域 */}
      <div className="flex-1 overflow-y-auto px-4 pt-2 pb-4 flex flex-col gap-3 min-h-0">
        {activeTab === "basic" && (
          <>
            <SceneBasicInfoCard scene={currentScene} setCurrentScene={setCurrentScene} />
            <SceneAtmosphereCard scene={currentScene} setCurrentScene={setCurrentScene} />
            <SceneSpaceCard scene={currentScene} setCurrentScene={setCurrentScene} />
            <SceneElementsCard
              scene={currentScene}
              customElement={customElement}
              setCustomElement={setCustomElement}
              showElementInput={showElementInput}
              setShowElementInput={setShowElementInput}
              onAddItem={addItem}
              onRemoveItem={removeItem}
            />
          </>
        )}

        {activeTab === "references" && (
          <SceneReferencedBeatsCard beats={referencedBeats} />
        )}

        {activeTab === "generation" && (
          <SceneImageGenerationCard
            scene={currentScene}
            avatarImage={avatarImage}
            generatedImage={generatedImage}
            isGenerating={isGenerating}
            isUploading={isUploading}
            isAnalyzing={isAnalyzing}
            isOptimizingPrompt={isOptimizingPrompt}
            selectedImageModel={selectedImageModel}
            setSelectedImageModel={setSelectedImageModel}
            generatePrompt={generatePrompt}
            optimizePrompt={optimizePrompt}
            generateImage={generateImage}
            saveImageToScene={saveImageToScene}
            clearImage={clearImage}
            fileInputRef={fileInputRef}
            analyzeFileInputRef={analyzeFileInputRef}
            handleFileUpload={handleFileUpload}
            handleAnalyzeFileUpload={handleAnalyzeFileUpload}
            setShowAssetSelector={setShowAssetSelector}
          />
        )}
      </div>

      {/* 底部操作栏 - 固定不滚动 */}
      <SceneActionFooter
        isDirty={isDirty}
        saveStatus={saveStatus}
        saveError={saveError}
        canSave={!!currentScene.name.trim()}
        onSave={handleSave}
        onDelete={() => handleDelete(currentScene.id, currentScene.name)}
        deleteDisabled={!currentScene.id}
      />
    </div>
  );
}

export default function ScenesPage() {
  return (
    <Suspense>
      <ScenesPageContent />
    </Suspense>
  );
}

function ScenesPageContent() {
  const state = useScenesPage();
  const {
    scenesLoading,
    scenesError,
    refetchScenes,
    assets,
    currentScene,
    handleSelectScene,
    handleNewScene,
    handleAssetSelect,
    showAssetSelector,
    setShowAssetSelector,
    isDirty,
    searchQuery,
    setSearchQuery,
    filteredScenes,
    handleDelete,
    deleteDialogOpen,
    setDeleteDialogOpen,
    sceneToDelete,
    referenceCheck,
    performDelete,
    isDeleting,
  } = state;

  return (
    <PageErrorBoundary pageName={t("scene.pageName")}>
      <div
        className="fade-in flex flex-col h-full"
      >
        <ScenePageHeader
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onNewScene={handleNewScene}
        />
        <div className="flex-1 flex min-h-0">
          <SceneList
            scenes={filteredScenes}
            scenesLoading={scenesLoading}
            scenesError={scenesError}
            onRetry={refetchScenes}
            currentSceneId={currentScene.id}
            isDirty={isDirty}
            onSelectScene={handleSelectScene}
            onDeleteScene={handleDelete}
            onNewScene={handleNewScene}
          />
          <SceneDetailContainer {...state} />
        </div>
      </div>

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
