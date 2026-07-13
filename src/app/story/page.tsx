"use client";

import { Trash2 } from "lucide-react";
import { t } from "@/shared/constants";
import { ProfessionalModeEditor } from "@/modules/story";
import { VersionDialog } from "@/modules/story";
import { TemplateManagerDialog } from "@/modules/story";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { Modal } from "@/shared/presentation/Modal";
import { PageLoader } from "@/shared/presentation/PageLoader";
import { Tabs } from "@/shared/presentation/Tabs";
import { StoryProvider } from "./StoryProvider";
import { StoryHeader } from "./StoryHeader";
import { SwitchConfirmDialog } from "./SwitchConfirmDialog";
import { useStoryPage } from "./hooks/useStoryPage";

function StoryPageContent() {
  const {
    story,
    switchStory,
    isGenerating,
    showSwitchConfirmDialog,
    pendingSwitchStory,
    handleSaveAndSwitch,
    handleSwitchConfirmOpenChange,
    handleSwitchWithoutSave,
    deleteConfirmInput,
    setDeleteConfirmInput,
    handleDeleteDialogOpenChange,
    handleDeleteCancel,
    handlePromptChange,
    handleToggleGenerationEnhanced,
    activeTab,
    setActiveTab,
  } = useStoryPage();

  return (
    <PageErrorBoundary pageName={t("page.storyboard")}>
      <div className="fade-in flex flex-col h-full">
        <div className="top-tabs !p-0 !items-stretch !justify-between">
          <Tabs
            tabs={[
              { id: "storyboard", label: t("story.tab.storyboard") },
            ]}
            activeTab={activeTab}
            onChange={(id) => setActiveTab(id as typeof activeTab)}
          />
          <div className="toolbar pr-8">
            <StoryHeader story={story} onSwitchStory={switchStory} />
            <span className="text-border">|</span>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => story.setVersionDialogOpen(true)}
            >
              {t("story.snapshot")}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => story.setTemplateDialogOpen(true)}
            >
              {t("story.templateBtn")}
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={story.handleSave}
              disabled={story.saveStatus === "saving"}
            >
              {t("common.save")}
            </button>
          </div>
        </div>

        {story.isStoryLoading ? (
          <div className="flex-1 min-h-0 flex items-center justify-center">
            <PageLoader size="lg" label={t("common.loading")} />
          </div>
        ) : activeTab === "storyboard" ? (
          <div className="flex-1 min-h-0 flex flex-col">
            <ProfessionalModeEditor
              currentStory={story.currentStory}
              beats={story.beats}
              characters={story.characters}
              scenes={story.scenes}
              assets={story.assets}
              onUpdateBeat={story.updateBeat}
              onAddBeat={story.addBeat}
              onDeleteBeat={story.deleteBeat}
              onMoveBeat={story.moveBeat}
              onReorderBeats={story.setBeats}
              onPlanStoryWithAI={story.planStoryWithAI}
              onOpenTemplateDialog={() => story.setTemplateDialogOpen(true)}
              onOpenVersionDialog={() => story.setVersionDialogOpen(true)}
              isGenerating={isGenerating}
              isPlanningStory={story.isPlanningStory}
              generationEnhanced={story.generationEnhanced}
              onToggleGenerationEnhanced={handleToggleGenerationEnhanced}
              onGenerateKeyframe={story.generateKeyframe}
              onGenerateFramePair={story.generateFramePair}
              onGenerateVideoNew={story.generateVideoNew}
              onRegenerateKeyframe={story.regenerateKeyframe}
              generatingKeyframe={story.generatingBeats}
              onUploadKeyframe={story.handleUploadKeyframe}
              onUploadFirstFrame={story.handleUploadFirstFrame}
              onUploadLastFrame={story.handleUploadLastFrame}
              onUploadVideo={story.handleUploadVideo}
              onBatchGenerateKeyframes={story.batchGenerateKeyframes}
              onBatchGenerateFramePairs={story.batchGenerateFramePairs}
              onBatchGenerateVideos={story.batchGenerateVideos}
              onPromptChange={handlePromptChange}
              imageProviderId={story.selectedImageModel?.providerId}
              imageModelId={story.selectedImageModel?.modelId}
              assetsLoading={story.assetsLoading}
            />
          </div>
        ) : null}

        <TemplateManagerDialog
          isOpen={story.templateDialogOpen}
          onClose={() => story.setTemplateDialogOpen(false)}
          currentBeats={story.beats}
          onApplyTemplate={story.applyStoryboardTemplate}
          savedTemplates={story.savedTemplates}
          onSaveTemplate={story.handleSaveTemplate}
          onDeleteTemplate={story.handleDeleteTemplate}
        />

        <VersionDialog
          open={story.versionDialogOpen}
          onOpenChange={story.setVersionDialogOpen}
          currentStory={story.currentStory}
          beats={story.beats}
          onRestoreVersion={story.handleRestoreVersion}
        />

        {/* 删除确认弹窗 */}
        <Modal
          open={story.deleteDialogOpen}
          onClose={() => handleDeleteDialogOpenChange(false)}
          ariaLabel={t("story.confirmDeleteProject")}
          style={{ minWidth: 420 }}
        >
          <div className="flex items-center gap-2 font-semibold text-destructive mb-2">
            <Trash2 size={18} />
            {t("story.confirmDeleteProject")}
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            {t("story.confirmDeleteProjectDesc")}
          </p>
          <div className="mb-4">
            <p className="text-xs text-muted-foreground mb-2">
              {t("story.deleteConfirmInputHint", { name: story.currentStory.title || t("story.unnamed") })}
            </p>
            <input
              className="input !text-xs !px-2.5 !py-1.5"
              aria-label={t("aria.deleteConfirmInput")}
              value={deleteConfirmInput}
              onChange={(e) => setDeleteConfirmInput(e.target.value)}
              placeholder={t("story.deleteConfirmInputPlaceholder")}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={handleDeleteCancel}
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={deleteConfirmInput !== (story.currentStory.title || t("story.unnamed"))}
              onClick={story.performDeleteStory}
            >
              {t("story.confirmDeleteButton")}
            </button>
          </div>
        </Modal>

        <SwitchConfirmDialog
          open={showSwitchConfirmDialog}
          onOpenChange={handleSwitchConfirmOpenChange}
          pendingSwitchStory={pendingSwitchStory}
          onSaveAndSwitch={handleSaveAndSwitch}
          onSwitchWithoutSave={handleSwitchWithoutSave}
        />
      </div>
    </PageErrorBoundary>
  );
}

export default function StoryPage() {
  return (
    <StoryProvider>
      <StoryPageContent />
    </StoryProvider>
  );
}
