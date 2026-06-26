import { useEffect, useRef } from "react";
import { t } from "@/shared/constants";
import { getBeatCharacterIds } from "@/domain/utils";
import type {
  StoryBeat,
  Character,
  Scene,
  StoryElement,
} from "@/domain/schemas";
import { ElementBindingPanel } from "./ElementBindingPanel";
import { BeatNavigation } from "./BeatNavigation";
import { BeatPromptPanel } from "./BeatPromptPanel";
import { BeatGenerationPanel } from "./BeatGenerationPanel";
import { BeatUploadPanel, type BeatUploadPanelHandle } from "./BeatUploadPanel";

interface MinimalAsset {
  id: string;
  name: string;
  type: string;
  url?: string;
}

interface BeatDetailEditorProps {
  beat: StoryBeat;
  index: number;
  totalBeats: number;
  characters: Character[];
  scenes: Scene[];
  elements: StoryElement[];
  assets: MinimalAsset[];
  allShots: StoryBeat[];
  onClose: () => void;
  onPrevBeat: () => void;
  onNextBeat: () => void;
  onMoveBeat?: (beatId: string, direction: "up" | "down") => void;
  onUpdateBeat: (updatedBeat: StoryBeat) => void;
  onDeleteBeat: () => void;
  onGenerateKeyframe?: () => Promise<StoryBeat | void>;
  onGenerateFramePair?: () => Promise<StoryBeat | void>;
  onGenerateVideoNew?: () => Promise<StoryBeat | void>;
  onRegenerateKeyframe?: () => Promise<void>;
  generatingKeyframe?: boolean;
  onUploadKeyframe?: (beatId: string, file: File) => void;
  onUploadFirstFrame?: (beatId: string, file: File) => void;
  onUploadLastFrame?: (beatId: string, file: File) => void;
  onUploadVideo?: (beatId: string, file: File) => void;
  onPromptChange?: (context: import("@/modules/story/prompt-editor").PromptEditorContext, prompt: string) => void;
  imageProviderId?: string;
  imageModelId?: string;
}

export function BeatDetailEditor({
  beat,
  index,
  totalBeats,
  characters,
  scenes,
  elements,
  assets,
  allShots,
  onClose,
  onPrevBeat,
  onNextBeat,
  onMoveBeat,
  onUpdateBeat,
  onDeleteBeat,
  onGenerateKeyframe,
  onGenerateFramePair,
  onGenerateVideoNew,
  onRegenerateKeyframe,
  generatingKeyframe,
  onUploadKeyframe,
  onUploadFirstFrame,
  onUploadLastFrame,
  onUploadVideo,
  onPromptChange,
  imageProviderId,
  imageModelId,
}: BeatDetailEditorProps) {
  const uploadPanelHandle = useRef<BeatUploadPanelHandle>(null);

  const selectedScene = scenes.find((scene) => scene.id === beat.sceneId);
  const _prevBeat = index > 0 ? allShots[index - 1]! : null;
  void _prevBeat;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const target = e.target as HTMLElement;
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable
        ) {
          (target as HTMLInputElement).blur();
          return;
        }
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Consistency check data
  const consistencyCheck = beat.consistencyCheck;
  const charIds = getBeatCharacterIds(beat);
  const boundCharacters = charIds
    .map((id) => characters.find((c) => c.id === id))
    .filter((c): c is Character => !!c);

  // Bound elements for binding count
  const boundElementIds = beat.elementIds || [];
  const boundElements = boundElementIds
    .map((id) => elements.find((e) => e.id === id))
    .filter((e): e is StoryElement => !!e);

  return (
    <div
      className="h-full flex flex-col"
      role="region"
      aria-label={t("beat.editBeatN", { n: index + 1 })}
    >
      <BeatNavigation
        beat={beat}
        index={index}
        totalBeats={totalBeats}
        onPrevBeat={onPrevBeat}
        onNextBeat={onNextBeat}
        onMoveBeat={onMoveBeat}
        onDeleteBeat={onDeleteBeat}
      />

      {/* Three-column editor */}
      <div
        style={{
          flex: 1,
          display: "flex",
          padding: 12,
          gap: 12,
          overflowY: "auto",
          minHeight: 0,
        }}
      >
        {/* COLUMN 1: Prompt editor (3-tab) + Shot properties */}
        <BeatPromptPanel
          beat={beat}
          characters={characters}
          scenes={scenes}
          elements={elements}
          allShots={allShots}
          onUpdateBeat={onUpdateBeat}
          onPromptChange={onPromptChange}
          onGenerateKeyframe={onGenerateKeyframe}
          onGenerateFramePair={onGenerateFramePair}
          onGenerateVideoNew={onGenerateVideoNew}
          generatingKeyframe={generatingKeyframe}
          imageProviderId={imageProviderId}
          imageModelId={imageModelId}
        />

        {/* COLUMN 2: Element binding + consistency check */}
        <div
          style={{
            width: 300,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            overflowY: "auto",
          }}
        >
          {/* Section header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div className="section-label" style={{ marginBottom: 0 }}>
              <span className="dot ok"></span> {t("beat.elementBinding")}
            </div>
            <span className="badge badge-info">
              {t("beat.boundCount", { count: boundElements.length })}
            </span>
          </div>

          {/* Element binding panel - existing business logic */}
          <ElementBindingPanel
            beat={beat}
            elements={elements}
            characters={characters}
            scenes={scenes}
            assets={assets}
            onUpdateBeat={onUpdateBeat}
          />

          {/* Divider */}
          <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }}></div>

          {/* Consistency check */}
          <div className="section-label">
            <span className="dot ok"></span> {t("beat.consistencyCheck")}
          </div>
          <div className="card" style={{ padding: 10, fontSize: 12 }}>
            {consistencyCheck && consistencyCheck.characterScores.length > 0 ? (
              consistencyCheck.characterScores.map((score) => {
                const isPass = score.score >= 0.8;
                return (
                  <div key={score.elementId}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span>👤 {score.elementName}</span>
                      <span style={{ color: isPass ? "var(--success)" : "var(--warning)" }}>
                        {isPass ? "✓" : "⚠"} {(score.score * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="progress-bar" style={{ marginBottom: 8 }}>
                      <div
                        className="progress-fill"
                        style={{ width: `${score.score * 100}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })
            ) : boundCharacters.length === 0 ? (
              <div style={{ color: "var(--muted-fg)", textAlign: "center", padding: "8px 0" }}>
                {t("beat.unboundCharacter")}
              </div>
            ) : (
              boundCharacters.map((char) => (
                <div key={char.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span>👤 {char.name}</span>
                    <span style={{ color: "var(--muted-fg)" }}>—</span>
                  </div>
                  <div className="progress-bar" style={{ marginBottom: 8 }}>
                    <div className="progress-fill" style={{ width: "0%" }}></div>
                  </div>
                </div>
              ))
            )}
            {selectedScene && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>🏙 {selectedScene.name}</span>
                  <span style={{ color: "var(--success)" }}>
                    {consistencyCheck ? "✓" : "—"}
                  </span>
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: consistencyCheck ? `${consistencyCheck.overallScore * 100}%` : "0%" }}
                  ></div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* COLUMN 3: Preview cards with full operations */}
        <BeatGenerationPanel
          beat={beat}
          onGenerateKeyframe={onGenerateKeyframe}
          onGenerateFramePair={onGenerateFramePair}
          onGenerateVideoNew={onGenerateVideoNew}
          onRegenerateKeyframe={onRegenerateKeyframe}
          generatingKeyframe={generatingKeyframe}
          imageModelId={imageModelId}
          uploadPanelHandle={uploadPanelHandle}
        />
      </div>

      {/* Hidden file inputs - rendered once and triggered via ref */}
      <BeatUploadPanel
        ref={uploadPanelHandle}
        beatId={beat.id}
        onUploadKeyframe={onUploadKeyframe}
        onUploadFirstFrame={onUploadFirstFrame}
        onUploadLastFrame={onUploadLastFrame}
        onUploadVideo={onUploadVideo}
      />
    </div>
  );
}
