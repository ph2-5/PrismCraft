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
import { t } from "@/shared/constants";
import type { Character, Scene } from "@/domain/schemas";

interface PromptCardProps {
  promptText: string;
  onPromptTextChange: (value: string) => void;
  onOpenTemplateDialog: () => void;
  quickExamples: string[];
}

export function PromptCard({
  promptText,
  onPromptTextChange,
  onOpenTemplateDialog,
  quickExamples,
}: PromptCardProps) {
  return (
    <div
      className="card"
      style={{
        padding: 16,
        border: "2px solid var(--border)",
        background: "var(--card2)",
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
              <Sparkles className="w-5 h-5 text-primary" />
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
        <p className="text-sm text-muted-foreground">
          {t("quickGenerate.promptHint")}
        </p>

        <div className="pt-4">
          <span
            style={{
              display: "block",
              fontSize: 12,
              color: "var(--muted-fg)",
              marginBottom: 8,
            }}
          >
            {t("quickGenerate.quickTry")}
          </span>
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
  );
}

interface GenerateButtonProps {
  isGenerating: boolean;
  promptText: string;
  onGenerate: () => void;
}

export function GenerateButton({
  isGenerating,
  promptText,
  onGenerate,
}: GenerateButtonProps) {
  return (
    <button
      type="button"
      className="btn btn-primary"
      style={{
        width: "100%",
        height: 56,
        fontSize: 18,
        fontWeight: 600,
        background: "var(--primary)",
      }}
      onClick={onGenerate}
      disabled={isGenerating || !promptText.trim()}
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
  );
}

interface GeneratedPromptCardProps {
  generatedPrompt: string;
}

export function GeneratedPromptCard({ generatedPrompt }: GeneratedPromptCardProps) {
  return (
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
  );
}
