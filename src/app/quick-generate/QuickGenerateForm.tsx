import { useId, useState } from "react";
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
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateAndGenerate = () => {
    const newErrors: Record<string, string> = {};
    if (!promptText.trim()) {
      newErrors.prompt = t("validation.promptRequired");
    }
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;
    onGenerate();
  };

  return (
    <div className="lg:col-span-2 space-y-6">
      <PromptCard
        promptText={promptText}
        onPromptTextChange={(value) => {
          onPromptTextChange(value);
          if (errors.prompt) setErrors((prev) => ({ ...prev, prompt: "" }));
        }}
        onOpenTemplateDialog={onOpenTemplateDialog}
        quickExamples={quickExamples}
        promptError={errors.prompt}
      />

      <div
        className="card !bg-card2"
      >
        <div className="px-4 pt-3 pb-1">
          <div className="text-lg font-semibold text-foreground">
            {t("quickGenerate.configVideoParams")}
          </div>
        </div>
        <div className="px-4 pb-4 space-y-6">
          <div className="space-y-2">
            <label htmlFor={videoModelInputId} className="text-[13px] text-foreground">
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
        onGenerate={validateAndGenerate}
      />

      {generatedPrompt && <GeneratedPromptCard generatedPrompt={generatedPrompt} />}
    </div>
  );
}
