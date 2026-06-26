import { useCallback } from "react";
import { useQuickGenerateState } from "../QuickGenerateState";

export function useQuickGeneratePage() {
  const state = useQuickGenerateState();

  const onToggleAdvanced = useCallback(() => {
    state.setShowAdvanced(!state.showAdvanced);
  }, [state.showAdvanced, state.setShowAdvanced]);

  const onOpenTemplateDialog = useCallback(() => {
    state.setTemplateDialogOpen(true);
  }, [state.setTemplateDialogOpen]);

  const characterPosterImage = state.getSelectedCharacterObjects()[0]?.generatedImage;

  return {
    // QuickGenerateForm props
    promptText: state.promptText,
    onPromptTextChange: state.setPromptText,
    duration: state.duration,
    onDurationChange: state.setDuration,
    selectedStyle: state.selectedStyle,
    onSelectedStyleChange: state.setSelectedStyle,
    selectedResolution: state.selectedResolution,
    onSelectedResolutionChange: state.setSelectedResolution,
    selectedVideoModel: state.selectedVideoModel,
    onSelectedVideoModelChange: state.setSelectedVideoModel,
    selectedCharacters: state.selectedCharacters,
    onToggleCharacter: state.toggleCharacter,
    selectedScene: state.selectedScene,
    onToggleScene: state.toggleScene,
    showAdvanced: state.showAdvanced,
    onToggleAdvanced,
    enableSmartOptimization: state.enableSmartOptimization,
    onSmartOptimizationChange: state.setEnableSmartOptimization,
    negativePrompt: state.negativePrompt,
    onNegativePromptChange: state.setNegativePrompt,
    seed: state.seed,
    onSeedChange: state.setSeed,
    cfgScale: state.cfgScale,
    onCfgScaleChange: state.setCfgScale,
    referenceImage: state.referenceImage,
    onReferenceImageChange: state.setReferenceImage,
    referenceVideo: state.referenceVideo,
    referenceVideoName: state.referenceVideoName,
    onUploadReferenceVideo: state.handleUploadReferenceVideo,
    onRemoveReferenceVideo: state.handleRemoveReferenceVideo,
    isGenerating: state.isGenerating,
    onGenerate: state.handleGenerate,
    generatedPrompt: state.generatedPrompt,
    onOpenTemplateDialog,
    characters: state.characters,
    charactersLoading: state.charactersLoading,
    scenes: state.scenes,
    scenesLoading: state.scenesLoading,
    guardedPush: state.guardedPush,
    quickExamples: state.quickExamples,

    // QuickGenerateHistory props
    currentTask: state.currentTask ?? null,
    effectiveVideoUrl: state.effectiveVideoUrl,
    tasks: state.tasks,
    activeTaskId: state.activeTaskId ?? null,
    onDownload: state.handleDownload,
    onSaveToAssets: state.handleSaveToAssets,
    onRetry: state.handleRetry,
    onClearCompleted: state.clearCompletedTasks,
    characterPosterImage,

    // TemplateSelectDialog props
    templateDialogOpen: state.templateDialogOpen,
    onTemplateDialogOpenChange: state.setTemplateDialogOpen,
    onApplyTemplate: state.handleApplyTemplate,
  };
}
