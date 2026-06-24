"use client";

import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Trash2 } from "lucide-react";
import { t } from "@/shared/constants";
import { ProfessionalModeEditor } from "@/modules/story";
import { VersionDialog } from "@/modules/story";
import { TemplateManagerDialog } from "@/modules/story";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { StoryProvider } from "./StoryProvider";
import { StoryHeader } from "./StoryHeader";
import { VideoGeneratorToolbar, VideoGeneratorPanel } from "./VideoGeneratorSection";
import { SwitchConfirmDialog } from "./SwitchConfirmDialog";
import { useStoryPage } from "./hooks/useStoryPage";

function StoryPageContent() {
  const {
    story,
    isGenerating,
    generatedVideo,
    generateVideo,
    showSwitchConfirmDialog,
    pendingSwitchStory,
    switchStory,
    handleSaveAndSwitch,
    handleSwitchConfirmOpenChange,
    handleSwitchWithoutSave,
    deleteConfirmInput,
    setDeleteConfirmInput,
    handleDeleteDialogOpenChange,
    handleDeleteCancel,
    handlePromptChange,
    handleToggleGenerationEnhanced,
  } = useStoryPage();

  return (
    <PageErrorBoundary pageName={t("page.storyboard")}>
      <div className="h-full flex flex-col">
        <div className="shrink-0 border-b border-border bg-card px-4 py-3">
          <div className="flex items-center gap-3">
            <StoryHeader story={story} onSwitchStory={switchStory} />
            <VideoGeneratorToolbar story={story} isGenerating={isGenerating} onGenerateVideo={generateVideo} />
          </div>
        </div>

        <div className="flex-1 min-h-0">
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

        <VideoGeneratorPanel story={story} generatedVideo={generatedVideo} />

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

        <Dialog
          open={story.deleteDialogOpen}
          onOpenChange={handleDeleteDialogOpenChange}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="w-5 h-5" />
                {t("story.confirmDeleteProject")}
              </DialogTitle>
              <DialogDescription>
                {t("story.confirmDeleteProjectDesc")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {t("story.deleteConfirmInputHint", { name: story.currentStory.title || t("story.unnamed") })}
              </p>
              <Input
                value={deleteConfirmInput}
                onChange={(e) => setDeleteConfirmInput(e.target.value)}
                placeholder={t("story.deleteConfirmInputPlaceholder")}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={handleDeleteCancel}
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="destructive"
                disabled={deleteConfirmInput !== (story.currentStory.title || t("story.unnamed"))}
                onClick={story.performDeleteStory}
              >
                {t("story.confirmDeleteButton")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
