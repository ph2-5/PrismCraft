import { Wand2 } from "lucide-react";
import { t } from "@/shared/constants";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { TemplateSelectDialog } from "./TemplateSelectDialog";
import { useQuickGenerateState } from "./QuickGenerateState";
import { QuickGenerateForm } from "./QuickGenerateForm";
import { QuickGenerateHistory } from "./QuickGenerateHistory";

export default function QuickGeneratePage() {
  const state = useQuickGenerateState();

  return (
    <PageErrorBoundary pageName={t("quickGenerate.pageName")}>
      <div className="h-full max-w-5xl mx-auto">
        <header className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-900/40 border border-purple-700/50 mb-4">
            <Wand2 className="w-4 h-4 text-purple-400" />
            <span className="text-purple-300 font-medium text-sm">
              {t("quickGenerate.quickVideoGeneration")}
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            {t("quickGenerate.heroTitle")}
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            {t("quickGenerate.heroDesc")}
          </p>
          <p className="text-slate-500 text-sm mt-2">
            {t("quickGenerate.beginnerTip")}
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <QuickGenerateForm
            promptText={state.promptText}
            onPromptTextChange={state.setPromptText}
            duration={state.duration}
            onDurationChange={state.setDuration}
            selectedStyle={state.selectedStyle}
            onSelectedStyleChange={state.setSelectedStyle}
            selectedResolution={state.selectedResolution}
            onSelectedResolutionChange={state.setSelectedResolution}
            selectedVideoModel={state.selectedVideoModel}
            onSelectedVideoModelChange={state.setSelectedVideoModel}
            selectedCharacters={state.selectedCharacters}
            onToggleCharacter={state.toggleCharacter}
            selectedScene={state.selectedScene}
            onToggleScene={state.toggleScene}
            showAdvanced={state.showAdvanced}
            onToggleAdvanced={() => state.setShowAdvanced(!state.showAdvanced)}
            enableSmartOptimization={state.enableSmartOptimization}
            onSmartOptimizationChange={state.setEnableSmartOptimization}
            negativePrompt={state.negativePrompt}
            onNegativePromptChange={state.setNegativePrompt}
            referenceImage={state.referenceImage}
            onReferenceImageChange={state.setReferenceImage}
            referenceVideo={state.referenceVideo}
            referenceVideoName={state.referenceVideoName}
            onUploadReferenceVideo={state.handleUploadReferenceVideo}
            onRemoveReferenceVideo={state.handleRemoveReferenceVideo}
            isGenerating={state.isGenerating}
            onGenerate={state.handleGenerate}
            generatedPrompt={state.generatedPrompt}
            onOpenTemplateDialog={() => state.setTemplateDialogOpen(true)}
            characters={state.characters}
            charactersLoading={state.charactersLoading}
            scenes={state.scenes}
            scenesLoading={state.scenesLoading}
            guardedPush={state.guardedPush}
            quickExamples={state.quickExamples}
          />

          <QuickGenerateHistory
            currentTask={state.currentTask ?? null}
            effectiveVideoUrl={state.effectiveVideoUrl}
            tasks={state.tasks}
            activeTaskId={state.activeTaskId ?? null}
            isGenerating={state.isGenerating}
            onDownload={state.handleDownload}
            onSaveToAssets={state.handleSaveToAssets}
            onRetry={state.handleRetry}
            onClearCompleted={state.clearCompletedTasks}
            characterPosterImage={state.getSelectedCharacterObjects()[0]?.generatedImage}
          />
        </div>

        <TemplateSelectDialog
          open={state.templateDialogOpen}
          onOpenChange={state.setTemplateDialogOpen}
          onApplyTemplate={state.handleApplyTemplate}
        />
      </div>
    </PageErrorBoundary>
  );
}
