import { Zap, ClipboardList } from "lucide-react";
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
      <div className="fade-in flex flex-col h-full">
        <div className="top-tabs justify-between">
          <span className="font-semibold text-sm flex items-center gap-2">
            <Zap size={14} /> {t("quickGenerate.pageName")}
          </span>
          <div className="toolbar">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={vm.onOpenTemplateDialog}
            >
              <ClipboardList className="inline-block" size={12} /> {t("quickGenerate.selectTemplate")}
            </button>
            <span className="text-[11px] text-muted-foreground">
              {t("quickGenerate.heroDesc")}
            </span>
          </div>
        </div>

        <div className="flex flex-col md:flex-row flex-1 min-h-0">
          <div className="flex-1 flex flex-col p-5 gap-[14px] overflow-y-auto">
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
          </div>

          <div
            className="w-full md:w-[340px] md:shrink-0 border-t border-border md:border-t-0 md:border-l flex flex-col p-4 gap-2.5 overflow-y-auto"
          >
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
