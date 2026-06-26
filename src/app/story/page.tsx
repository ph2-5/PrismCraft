"use client";

import { Trash2 } from "lucide-react";
import { t } from "@/shared/constants";
import { ProfessionalModeEditor } from "@/modules/story";
import { VersionDialog } from "@/modules/story";
import { TemplateManagerDialog } from "@/modules/story";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { ComingSoon } from "@/shared/presentation/ComingSoon";
import { Modal } from "@/shared/presentation/Modal";
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
      <div className="fade-in" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div className="top-tabs" style={{ padding: 0, alignItems: "stretch", justifyContent: "space-between" }}>
          <Tabs
            tabs={[
              { id: "storyboard", label: t("story.tab.storyboard") },
              { id: "ai-generate", label: t("story.tab.aiGenerate") },
              { id: "preview-export", label: t("story.tab.previewExport") },
              { id: "comments", label: t("story.tab.comments") },
              { id: "audio", label: t("story.tab.audio") },
            ]}
            activeTab={activeTab}
            onChange={(id) => setActiveTab(id as typeof activeTab)}
          />
          <div className="toolbar" style={{ paddingRight: 32 }}>
            <StoryHeader story={story} onSwitchStory={switchStory} />
            <span style={{ color: "var(--border)" }}>|</span>
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

        {activeTab === "storyboard" ? (
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
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
        ) : (
          <div style={{ flex: 1, minHeight: 0 }}>
            {activeTab === "ai-generate" && (
              <ComingSoon
                icon="🤖"
                title={t("story.tab.aiGenerate")}
                descriptionKey="comingSoon.agentDesc"
              />
            )}
            {activeTab === "preview-export" && (
              <ComingSoon
                icon="🎬"
                title={t("story.tab.previewExport")}
                descriptionKey="comingSoon.composerDesc"
              />
            )}
            {activeTab === "comments" && (
              <ComingSoon
                icon="💬"
                title={t("story.tab.comments")}
                descriptionKey="comingSoon.agentDesc"
              />
            )}
            {activeTab === "audio" && (
              <ComingSoon
                icon="🎵"
                title={t("story.tab.audio")}
                descriptionKey="comingSoon.pluginsDesc"
              />
            )}
          </div>
        )}

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
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, color: "var(--destructive)", marginBottom: 8 }}>
            <Trash2 size={18} />
            {t("story.confirmDeleteProject")}
          </div>
          <p style={{ fontSize: 12, color: "var(--muted-fg)", marginBottom: 12 }}>
            {t("story.confirmDeleteProjectDesc")}
          </p>
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 12, color: "var(--muted-fg)", marginBottom: 8 }}>
              {t("story.deleteConfirmInputHint", { name: story.currentStory.title || t("story.unnamed") })}
            </p>
            <input
              className="input"
              value={deleteConfirmInput}
              onChange={(e) => setDeleteConfirmInput(e.target.value)}
              placeholder={t("story.deleteConfirmInputPlaceholder")}
              style={{ width: "100%", fontSize: 12, padding: "6px 10px" }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
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
