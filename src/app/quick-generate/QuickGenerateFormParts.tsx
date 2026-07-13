import {
  Sparkles,
  LayoutTemplate,
  User,
  Loader2,
  CheckCircle2,
  Plus,
  Image,
  Wand2,
} from "lucide-react";
import { useId } from "react";
import { t } from "@/shared/constants";
import { useGenerationStage } from "@/shared/presentation/use-generation-stage";
import type { Character, Scene } from "@/domain/schemas";

interface PromptCardProps {
  promptText: string;
  onPromptTextChange: (value: string) => void;
  onOpenTemplateDialog: () => void;
  quickExamples: string[];
  promptError?: string;
}

export function PromptCard({
  promptText,
  onPromptTextChange,
  onOpenTemplateDialog,
  quickExamples,
  promptError,
}: PromptCardProps) {
  const promptErrorId = useId();
  return (
    <div
      className="card !border-2 !bg-card2 backdrop-blur"
    >
      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center justify-between">
          <div>
            <div
              className="flex items-center gap-2 text-xl font-semibold text-foreground"
            >
              <Sparkles className="w-5 h-5 text-primary" />
              {t("quickGenerate.describeVideo")}
            </div>
            <div
              className="text-[13px] text-muted-foreground mt-1"
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
      <div className="px-4 pb-4 space-y-4">
        <textarea
          className="textarea !text-xs min-h-32 resize-y"
          aria-label={t("quickGenerate.describeVideo")}
          value={promptText}
          onChange={(e) => onPromptTextChange(e.target.value)}
          placeholder={t("story.quickPromptPlaceholder")}
          required
          aria-invalid={!!promptError}
          aria-errormessage={promptError ? promptErrorId : undefined}
        />
        {promptError && (
          <p id={promptErrorId} role="alert" className="text-xs text-destructive">
            {promptError}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          {t("quickGenerate.promptHint")}
        </p>

        <div className="pt-4">
          <span
            className="block text-xs text-muted-foreground mb-2"
          >
            {t("quickGenerate.quickTry")}
          </span>
          <div className="flex flex-wrap gap-2">
            {quickExamples.map((example) => (
              <button
                key={example}
                type="button"
                className="btn btn-outline btn-sm !text-[11px]"
                onClick={() => onPromptTextChange(example)}
              >
                {example.length > 20 ? `${example.slice(0, 20)}...` : example}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface CharacterSelectorProps {
  characters: Character[];
  charactersLoading: boolean;
  selectedCharacters: string[];
  onToggleCharacter: (charId: string) => void;
  guardedPush: (path: string) => void;
}

export function CharacterSelector({
  characters,
  charactersLoading,
  selectedCharacters,
  onToggleCharacter,
  guardedPush,
}: CharacterSelectorProps) {
  return (
    <div className="space-y-2">
      <span
        className="flex items-center gap-2 text-[13px] text-foreground"
      >
        <User className="w-4 h-4" />
        {t("quickGenerate.lockMainCharacter")}
      </span>
      {charactersLoading ? (
        <div className="flex items-center gap-2 p-3">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
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
                    ? "border-primary bg-primary/20"
                    : "border-border bg-card2 hover:border-primary/50"
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
              <span className="text-sm text-muted-foreground">
                {char.name}
              </span>
              {selectedCharacters.includes(char.id) && (
                <CheckCircle2 className="w-4 h-4 text-primary" />
              )}
            </button>
          ))}
          <button
            type="button"
            className="btn btn-outline btn-sm !border-dashed !border-muted"
            onClick={() => guardedPush("/characters")}
          >
            <Plus className="w-4 h-4 mr-1" />
            {t("quickGenerate.newCharacter")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-outline btn-sm !border-dashed !border-muted w-full"
          onClick={() => guardedPush("/characters")}
        >
          <Plus className="w-4 h-4 mr-1" />
          {t("scene.createCharacterHint")}
        </button>
      )}
    </div>
  );
}

interface SceneSelectorProps {
  scenes: Scene[];
  scenesLoading: boolean;
  selectedScene: string | null;
  onToggleScene: (sceneId: string) => void;
  guardedPush: (path: string) => void;
}

export function SceneSelector({
  scenes,
  scenesLoading,
  selectedScene,
  onToggleScene,
  guardedPush,
}: SceneSelectorProps) {
  return (
    <div className="space-y-2">
      <span
        className="flex items-center gap-2 text-[13px] text-foreground"
      >
        <Image className="w-4 h-4" />
        {t("quickGenerate.lockScene")}
      </span>
      {scenesLoading ? (
        <div className="flex items-center gap-2 p-3">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
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
                    ? "border-primary bg-primary/20"
                    : "border-border bg-card2 hover:border-primary/50"
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
              <span className="text-sm text-muted-foreground">
                {scene.name}
              </span>
              {selectedScene === scene.id && (
                <CheckCircle2 className="w-4 h-4 text-primary" />
              )}
            </button>
          ))}
          <button
            type="button"
            className="btn btn-outline btn-sm !border-dashed !border-muted"
            onClick={() => guardedPush("/scenes")}
          >
            <Plus className="w-4 h-4 mr-1" />
            {t("scene.createNewScene")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-outline btn-sm !border-dashed !border-muted w-full"
          onClick={() => guardedPush("/scenes")}
        >
          <Plus className="w-4 h-4 mr-1" />
          {t("scene.createSceneHint")}
        </button>
      )}
    </div>
  );
}

interface GenerateButtonProps {
  isGenerating: boolean;
  onGenerate: () => void;
}

export function GenerateButton({
  isGenerating,
  onGenerate,
}: GenerateButtonProps) {
  const { stageLabel } = useGenerationStage(isGenerating, {
    initialKey: "generate.stage.videoInitial",
  });

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        className="btn btn-primary w-full h-14 !text-lg !font-semibold"
        onClick={onGenerate}
        disabled={isGenerating}
        aria-live="polite"
      >
        {isGenerating ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            {t("task.generatingVideo")}
          </>
        ) : (
          <>
            <Wand2 className="w-5 h-5 mr-2" />
            {t("task.generateVideoNow")}
          </>
        )}
      </button>
      {isGenerating && (
        <div
          role="status"
          aria-live="polite"
          className="text-xs text-muted-foreground text-center"
        >
          {stageLabel}
        </div>
      )}
    </div>
  );
}

interface GeneratedPromptCardProps {
  generatedPrompt: string;
}

export function GeneratedPromptCard({ generatedPrompt }: GeneratedPromptCardProps) {
  return (
    <div
      className="card"
    >
      <div className="px-4 pt-3 pb-1">
        <div
          className="text-sm font-medium text-foreground"
        >
          {t("task.actualPromptSent")}
        </div>
      </div>
      <div className="px-4 pb-4">
        <p
          className="whitespace-pre-wrap break-all max-h-32 overflow-y-auto text-xs text-muted-foreground"
        >
          {generatedPrompt}
        </p>
      </div>
    </div>
  );
}
