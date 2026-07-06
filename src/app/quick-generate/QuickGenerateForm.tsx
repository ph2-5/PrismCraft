import { useId } from "react";
import { t } from "@/shared/constants";
import { ModelSelector } from "@/modules/prompt";
import type { Character, Scene, ModelSelection } from "@/domain/schemas";
import { AdvancedSettingsCard } from "./AdvancedSettingsCard";
import {
  ModelParameterPanel,
  type ModelParameterValues,
} from "@/shared/presentation/ModelParameterPanel";
import {
  PromptCard,
  CharacterSelector,
  SceneSelector,
  GenerateButton,
  GeneratedPromptCard,
} from "./QuickGenerateFormParts";

interface QuickGenerateFormProps {
  promptText: string;
  onPromptTextChange: (value: string) => void;
  duration: number;
  onDurationChange: (value: number) => void;
  selectedStyle: string;
  onSelectedStyleChange: (value: string) => void;
  selectedResolution: string;
  onSelectedResolutionChange: (value: string) => void;
  selectedVideoModel: ModelSelection | null;
  onSelectedVideoModelChange: (value: ModelSelection | null) => void;
  selectedCharacters: string[];
  onToggleCharacter: (charId: string) => void;
  selectedScene: string | null;
  onToggleScene: (sceneId: string) => void;
  showAdvanced: boolean;
  onToggleAdvanced: () => void;
  enableSmartOptimization: boolean;
  onSmartOptimizationChange: (val: boolean) => void;
  negativePrompt: string;
  onNegativePromptChange: (val: string) => void;
  seed: string;
  onSeedChange: (val: string) => void;
  cfgScale: number;
  onCfgScaleChange: (val: number) => void;
  referenceImage: string | null;
  onReferenceImageChange: (val: string | null) => void;
  referenceVideo: string | null;
  referenceVideoName: string | null;
  onUploadReferenceVideo: (file: File) => void;
  onRemoveReferenceVideo: () => void;
  isGenerating: boolean;
  onGenerate: () => void;
  generatedPrompt: string | null;
  onOpenTemplateDialog: () => void;
  characters: Character[];
  charactersLoading: boolean;
  scenes: Scene[];
  scenesLoading: boolean;
  guardedPush: (path: string) => void;
  quickExamples: string[];
}

export function QuickGenerateForm({
  promptText,
  onPromptTextChange,
  duration,
  onDurationChange,
  selectedStyle,
  onSelectedStyleChange,
  selectedResolution,
  onSelectedResolutionChange,
  selectedVideoModel,
  onSelectedVideoModelChange,
  selectedCharacters,
  onToggleCharacter,
  selectedScene,
  onToggleScene,
  showAdvanced,
  onToggleAdvanced,
  enableSmartOptimization,
  onSmartOptimizationChange,
  negativePrompt,
  onNegativePromptChange,
  seed,
  onSeedChange,
  cfgScale,
  onCfgScaleChange,
  referenceImage,
  onReferenceImageChange,
  referenceVideo,
  referenceVideoName,
  onUploadReferenceVideo,
  onRemoveReferenceVideo,
  isGenerating,
  onGenerate,
  generatedPrompt,
  onOpenTemplateDialog,
  characters,
  charactersLoading,
  scenes,
  scenesLoading,
  guardedPush,
  quickExamples,
}: QuickGenerateFormProps) {
  const handleModelParamsChange = (partial: Partial<ModelParameterValues>) => {
    if (partial.duration !== undefined) onDurationChange(partial.duration);
    if (partial.resolution !== undefined) onSelectedResolutionChange(partial.resolution);
    if (partial.style !== undefined) onSelectedStyleChange(partial.style);
    if (partial.negativePrompt !== undefined) onNegativePromptChange(partial.negativePrompt);
    if (partial.seed !== undefined) onSeedChange(partial.seed);
    if (partial.cfgScale !== undefined) onCfgScaleChange(partial.cfgScale);
  };

  const videoModelInputId = useId();

  return (
    <div className="lg:col-span-2 space-y-6">
      <PromptCard
        promptText={promptText}
        onPromptTextChange={onPromptTextChange}
        onOpenTemplateDialog={onOpenTemplateDialog}
        quickExamples={quickExamples}
      />

      <div
        className="card"
        style={{
          padding: 16,
          border: "1px solid var(--border)",
          background: "var(--card2)",
        }}
      >
        <div style={{ padding: "12px 16px 4px" }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: "var(--fg)" }}>
            {t("quickGenerate.configVideoParams")}
          </div>
        </div>
        <div style={{ padding: "0 16px 16px" }} className="space-y-6">
          <div className="space-y-2">
            <label htmlFor={videoModelInputId} style={{ fontSize: 13, color: "var(--fg)" }}>
              {t("quickGenerate.videoModel")}
            </label>
            <ModelSelector
              capability="video"
              value={selectedVideoModel}
              onChange={onSelectedVideoModelChange}
              id={videoModelInputId}
            />
          </div>

          <ModelParameterPanel
            modelId={selectedVideoModel?.modelId}
            values={{
              duration,
              resolution: selectedResolution,
              style: selectedStyle,
              negativePrompt,
              seed,
              cfgScale,
            }}
            onValuesChange={handleModelParamsChange}
            variant="dark"
          />

          <CharacterSelector
            characters={characters}
            charactersLoading={charactersLoading}
            selectedCharacters={selectedCharacters}
            onToggleCharacter={onToggleCharacter}
            guardedPush={guardedPush}
          />

          <SceneSelector
            scenes={scenes}
            scenesLoading={scenesLoading}
            selectedScene={selectedScene}
            onToggleScene={onToggleScene}
            guardedPush={guardedPush}
          />
        </div>
      </div>

      <AdvancedSettingsCard
        showAdvanced={showAdvanced}
        onToggleAdvanced={onToggleAdvanced}
        enableSmartOptimization={enableSmartOptimization}
        onSmartOptimizationChange={onSmartOptimizationChange}
        negativePrompt={negativePrompt}
        onNegativePromptChange={onNegativePromptChange}
        referenceImage={referenceImage}
        onReferenceImageChange={onReferenceImageChange}
        referenceVideo={referenceVideo}
        referenceVideoName={referenceVideoName}
        onUploadReferenceVideo={onUploadReferenceVideo}
        onRemoveReferenceVideo={onRemoveReferenceVideo}
      />

      <GenerateButton
        isGenerating={isGenerating}
        promptText={promptText}
        onGenerate={onGenerate}
      />

      {generatedPrompt && <GeneratedPromptCard generatedPrompt={generatedPrompt} />}
    </div>
  );
}
