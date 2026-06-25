import {
  Sparkles,
  User,
  Wand2,
  RefreshCw,
  CheckCircle2,
  Plus,
  LayoutTemplate,
  Image,
} from "lucide-react";
import { t } from "@/shared/constants";
import { ModelSelector } from "@/modules/prompt";
import type { Character, Scene, ModelSelection } from "@/domain/schemas";
import { AdvancedSettingsCard } from "./AdvancedSettingsCard";
import {
  ModelParameterPanel,
  type ModelParameterValues,
} from "@/shared/presentation/ModelParameterPanel";

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

  return (
    <div className="lg:col-span-2 space-y-6">
      <div
        className="card"
        style={{
          padding: 16,
          border: "2px solid rgba(91, 33, 116, 0.3)",
          background: "rgba(15, 23, 42, 0.8)",
          backdropFilter: "blur(8px)",
        }}
      >
        <div style={{ padding: "12px 16px 4px" }}>
          <div className="flex items-center justify-between">
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 20,
                  fontWeight: 600,
                  color: "var(--fg)",
                }}
              >
                <Sparkles className="w-5 h-5 text-purple-400" />
                {t("quickGenerate.describeVideo")}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--muted-fg)",
                  marginTop: 4,
                }}
              >
                {t("quickGenerate.describeVideoDesc")}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-outline"
              onClick={onOpenTemplateDialog}
            >
              <LayoutTemplate className="w-4 h-4" />
              {t("quickGenerate.selectTemplate")}
            </button>
          </div>
        </div>
        <div style={{ padding: "0 16px 16px" }} className="space-y-4">
          <textarea
            className="textarea"
            style={{ fontSize: 12, minHeight: "8rem", resize: "vertical" }}
            aria-label={t("quickGenerate.describeVideo")}
            value={promptText}
            onChange={(e) => onPromptTextChange(e.target.value)}
            placeholder={t("story.quickPromptPlaceholder")}
          />
          <p className="text-sm text-slate-500">
            {t("quickGenerate.promptHint")}
          </p>

          <div className="pt-4">
            <label
              style={{
                display: "block",
                fontSize: 12,
                color: "var(--muted-fg)",
                marginBottom: 8,
              }}
            >
              {t("quickGenerate.quickTry")}
            </label>
            <div className="flex flex-wrap gap-2">
              {quickExamples.map((example) => (
                <button
                  key={example}
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{ fontSize: 11 }}
                  onClick={() => onPromptTextChange(example)}
                >
                  {example.length > 20 ? `${example.slice(0, 20)}...` : example}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div
        className="card"
        style={{
          padding: 16,
          border: "1px solid var(--border)",
          background: "rgba(15, 23, 42, 0.6)",
        }}
      >
        <div style={{ padding: "12px 16px 4px" }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: "var(--fg)" }}>
            {t("quickGenerate.configVideoParams")}
          </div>
        </div>
        <div style={{ padding: "0 16px 16px" }} className="space-y-6">
          <div className="space-y-2">
            <label style={{ fontSize: 13, color: "var(--fg)" }}>
              {t("quickGenerate.videoModel")}
            </label>
            <ModelSelector
              capability="video"
              value={selectedVideoModel}
              onChange={onSelectedVideoModelChange}
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

          <div className="space-y-2">
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                color: "var(--fg)",
              }}
            >
              <User className="w-4 h-4" />
              {t("quickGenerate.lockMainCharacter")}
            </label>
            {charactersLoading ? (
              <div className="flex items-center gap-2 p-3">
                <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{t("scene.loadingCharacters")}</span>
              </div>
            ) : characters.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {characters.map((char) => (
                  <button
                    key={char.id}
                    onClick={() => onToggleCharacter(char.id)}
                    className={`
                      flex items-center gap-2 p-2 rounded-lg border-2 transition-all
                      ${
                        selectedCharacters.includes(char.id)
                          ? "border-purple-500 bg-purple-900/40"
                          : "border-slate-700 bg-slate-800/50 hover:border-slate-600"
                      }
                    `}
                  >
                    {char.generatedImage && (
                      <img
                        src={char.generatedImage}
                        alt={char.name}
                        className="w-8 h-8 rounded object-cover"
                      />
                    )}
                    <span className="text-sm text-slate-300">
                      {char.name}
                    </span>
                    {selectedCharacters.includes(char.id) && (
                      <CheckCircle2 className="w-4 h-4 text-purple-400" />
                    )}
                  </button>
                ))}
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{ borderStyle: "dashed", borderColor: "var(--muted)" }}
                  onClick={() => guardedPush("/characters")}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  {t("quickGenerate.newCharacter")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{
                  borderStyle: "dashed",
                  borderColor: "var(--muted)",
                  width: "100%",
                }}
                onClick={() => guardedPush("/characters")}
              >
                <Plus className="w-4 h-4 mr-1" />
                {t("scene.createCharacterHint")}
              </button>
            )}
          </div>

          <div className="space-y-2">
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                color: "var(--fg)",
              }}
            >
              <Image className="w-4 h-4" />
              {t("quickGenerate.lockScene")}
            </label>
            {scenesLoading ? (
              <div className="flex items-center gap-2 p-3">
                <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{t("scene.loadingScenes")}</span>
              </div>
            ) : scenes.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {scenes.map((scene) => (
                  <button
                    key={scene.id}
                    onClick={() => onToggleScene(scene.id)}
                    className={`
                      flex items-center gap-2 p-2 rounded-lg border-2 transition-all
                      ${
                        selectedScene === scene.id
                          ? "border-blue-500 bg-blue-900/40"
                          : "border-slate-700 bg-slate-800/50 hover:border-slate-600"
                      }
                    `}
                  >
                    {scene.generatedImage && (
                      <img
                        src={scene.generatedImage}
                        alt={scene.name}
                        className="w-8 h-8 rounded object-cover"
                      />
                    )}
                    <span className="text-sm text-slate-300">
                      {scene.name}
                    </span>
                    {selectedScene === scene.id && (
                      <CheckCircle2 className="w-4 h-4 text-blue-400" />
                    )}
                  </button>
                ))}
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{ borderStyle: "dashed", borderColor: "var(--muted)" }}
                  onClick={() => guardedPush("/scenes")}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  {t("scene.createNewScene")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{
                  borderStyle: "dashed",
                  borderColor: "var(--muted)",
                  width: "100%",
                }}
                onClick={() => guardedPush("/scenes")}
              >
                <Plus className="w-4 h-4 mr-1" />
                {t("scene.createSceneHint")}
              </button>
            )}
          </div>
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

      <button
        type="button"
        className="btn btn-primary"
        style={{
          width: "100%",
          height: 56,
          fontSize: 18,
          fontWeight: 600,
          background: "linear-gradient(to right, #9333ea, #db2777)",
        }}
        onClick={onGenerate}
        disabled={isGenerating || !promptText.trim()}
      >
        {isGenerating ? (
          <>
            <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
            {t("task.generatingVideo")}
          </>
        ) : (
          <>
            <Wand2 className="w-5 h-5 mr-2" />
            {t("task.generateVideoNow")}
          </>
        )}
      </button>

      {generatedPrompt && (
        <div
          className="card"
          style={{
            padding: 16,
            border: "1px solid var(--border)",
            background: "var(--card)",
          }}
        >
          <div style={{ padding: "12px 16px 4px" }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "var(--fg)",
              }}
            >
              {t("task.actualPromptSent")}
            </div>
          </div>
          <div style={{ padding: "0 16px 16px" }}>
            <p
              className="whitespace-pre-wrap break-all max-h-32 overflow-y-auto"
              style={{ fontSize: 12, color: "var(--muted-fg)" }}
            >
              {generatedPrompt}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
