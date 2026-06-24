import { Wand2 } from "lucide-react";
import { t } from "@/shared/constants";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import { TemplateSelectDialog } from "./TemplateSelectDialog";
import { useQuickGeneratePage } from "./hooks/useQuickGeneratePage";
import { QuickGenerateForm } from "./QuickGenerateForm";
import { QuickGenerateHistory } from "./QuickGenerateHistory";

export default function QuickGeneratePage() {
  const vm = useQuickGeneratePage();

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
            promptText={vm.promptText}
            onPromptTextChange={vm.onPromptTextChange}
            duration={vm.duration}
            onDurationChange={vm.onDurationChange}
            selectedStyle={vm.selectedStyle}
            onSelectedStyleChange={vm.onSelectedStyleChange}
            selectedResolution={vm.selectedResolution}
            onSelectedResolutionChange={vm.onSelectedResolutionChange}
            selectedVideoModel={vm.selectedVideoModel}
            onSelectedVideoModelChange={vm.onSelectedVideoModelChange}
            selectedCharacters={vm.selectedCharacters}
            onToggleCharacter={vm.onToggleCharacter}
            selectedScene={vm.selectedScene}
            onToggleScene={vm.onToggleScene}
            showAdvanced={vm.showAdvanced}
            onToggleAdvanced={vm.onToggleAdvanced}
            enableSmartOptimization={vm.enableSmartOptimization}
            onSmartOptimizationChange={vm.onSmartOptimizationChange}
            negativePrompt={vm.negativePrompt}
            onNegativePromptChange={vm.onNegativePromptChange}
            seed={vm.seed}
            onSeedChange={vm.onSeedChange}
            cfgScale={vm.cfgScale}
            onCfgScaleChange={vm.onCfgScaleChange}
            referenceImage={vm.referenceImage}
            onReferenceImageChange={vm.onReferenceImageChange}
            referenceVideo={vm.referenceVideo}
            referenceVideoName={vm.referenceVideoName}
            onUploadReferenceVideo={vm.onUploadReferenceVideo}
            onRemoveReferenceVideo={vm.onRemoveReferenceVideo}
            isGenerating={vm.isGenerating}
            onGenerate={vm.onGenerate}
            generatedPrompt={vm.generatedPrompt}
            onOpenTemplateDialog={vm.onOpenTemplateDialog}
            characters={vm.characters}
            charactersLoading={vm.charactersLoading}
            scenes={vm.scenes}
            scenesLoading={vm.scenesLoading}
            guardedPush={vm.guardedPush}
            quickExamples={vm.quickExamples}
          />

          <QuickGenerateHistory
            currentTask={vm.currentTask}
            effectiveVideoUrl={vm.effectiveVideoUrl}
            tasks={vm.tasks}
            activeTaskId={vm.activeTaskId}
            isGenerating={vm.isGenerating}
            onDownload={vm.onDownload}
            onSaveToAssets={vm.onSaveToAssets}
            onRetry={vm.onRetry}
            onClearCompleted={vm.onClearCompleted}
            characterPosterImage={vm.characterPosterImage}
          />
        </div>

        <TemplateSelectDialog
          open={vm.templateDialogOpen}
          onOpenChange={vm.onTemplateDialogOpenChange}
          onApplyTemplate={vm.onApplyTemplate}
        />
      </div>
    </PageErrorBoundary>
  );
}
