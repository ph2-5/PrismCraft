import { useState } from "react";
import { Image as ImageIcon, Clapperboard, Film } from "lucide-react";
import { t } from "@/shared/constants";
import { Tabs } from "@/shared/presentation/Tabs";
import { SHOT_SIZE_OPTIONS, CAMERA_MOVEMENT_OPTIONS } from "@/modules/shot";
import type {
  StoryBeat,
  Character,
  Scene,
  StoryElement,
  ShotInstructionTemplate,
} from "@/domain/schemas";
import { PromptEditor, PromptFloatingBall } from "@/modules/storyboard/prompt-editor";
import type { PromptEditorContext } from "@/modules/storyboard/prompt-editor";
import { PromptPreview } from "@/modules/storyboard/generation";
import { useToastHelpers } from "@/shared/presentation/Toast";

interface BeatPromptPanelProps {
  beat: StoryBeat;
  characters: Character[];
  scenes: Scene[];
  elements: StoryElement[];
  allShots: StoryBeat[];
  onUpdateBeat: (updatedBeat: StoryBeat) => void;
  onPromptChange?: (context: PromptEditorContext, prompt: string) => void;
  onGenerateKeyframe?: () => Promise<StoryBeat | void>;
  onGenerateFramePair?: () => Promise<StoryBeat | void>;
  onGenerateVideoNew?: () => Promise<StoryBeat | void>;
  generatingKeyframe?: boolean;
  imageProviderId?: string;
  imageModelId?: string;
}

export function BeatPromptPanel({
  beat,
  characters,
  scenes,
  elements,
  allShots,
  onUpdateBeat,
  onPromptChange,
  onGenerateKeyframe,
  onGenerateFramePair,
  onGenerateVideoNew,
  generatingKeyframe,
  imageProviderId,
  imageModelId,
}: BeatPromptPanelProps) {
  const { error: showError } = useToastHelpers();
  const [promptTab, setPromptTab] = useState<PromptEditorContext>("keyframe");

  const handleUpdateField = (
    field: keyof StoryBeat,
    value: StoryBeat[keyof StoryBeat],
  ) => {
    onUpdateBeat({ ...beat, [field]: value } as StoryBeat);
  };

  const handleConfirmKeyframeGenerate = async (
    _context: PromptEditorContext,
    _prompt: string,
  ) => {
    try {
      await (onGenerateKeyframe || (async () => {}))();
    } catch (err) {
      const message = err instanceof Error ? err.message : t("error.keyframeBatchFailed");
      showError(t("error.keyframeBatchFailed"), message);
    }
  };

  const handleConfirmFramePairGenerate = async (
    _context: PromptEditorContext,
    _prompt: string,
  ) => {
    try {
      await (onGenerateFramePair || (async () => {}))();
    } catch (err) {
      const message = err instanceof Error ? err.message : t("error.keyframeBatchFailed");
      showError(t("error.keyframeBatchFailed"), message);
    }
  };

  const handleConfirmVideoGenerate = async (
    _context: PromptEditorContext,
    _prompt: string,
  ) => {
    try {
      await (onGenerateVideoNew || (async () => {}))();
    } catch (err) {
      const message = err instanceof Error ? err.message : t("error.videoGenerateFailed");
      showError(t("error.videoGenerateFailed"), message);
    }
  };

  const currentInstruction: ShotInstructionTemplate = beat.shotInstruction || {
    shotSize: "medium" as ShotInstructionTemplate["shotSize"],
    cameraMovement: "static" as ShotInstructionTemplate["cameraMovement"],
    cameraAngle: "eye_level" as ShotInstructionTemplate["cameraAngle"],
  };

  const handleUpdateShotInstruction = (
    partial: Partial<ShotInstructionTemplate>,
  ) => {
    handleUpdateField("shotInstruction", {
      ...currentInstruction,
      ...partial,
    });
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, minWidth: 0, minHeight: 0, height: "100%" }}>
      {/* Prompt tabs */}
      <Tabs
        tabs={[
          { id: "keyframe", label: t("prompt.keyframePrompt") },
          { id: "firstFrame", label: t("prompt.firstFramePrompt") },
          { id: "lastFrame", label: t("prompt.lastFramePrompt") },
          { id: "video", label: t("prompt.videoPrompt") },
        ]}
        activeTab={promptTab}
        onChange={(id) => setPromptTab(id as PromptEditorContext)}
      />

      {/* Prompt editor card (flex:1, can grow) */}
      <div className="card2" style={{ padding: 12, flex: 1, minHeight: 180, display: "flex", flexDirection: "column", gap: 10, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-fg)" }}>{t("beat.promptLabel")}</span>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          <PromptEditor
            beat={beat}
            context={promptTab}
            keyframeImageUrl={beat.keyframe?.imageUrl}
            onPromptChange={onPromptChange}
            onConfirmGenerate={
              promptTab === "keyframe"
                ? handleConfirmKeyframeGenerate
                : promptTab === "video"
                  ? handleConfirmVideoGenerate
                  : handleConfirmFramePairGenerate
            }
            providerId={imageProviderId}
            modelId={imageModelId}
            characters={characters}
            scenes={scenes}
          />
        </div>
        {/* Toolbar: model chip + generate button */}
        <div className="toolbar">
          {imageModelId && (
            <button className="model-chip">
              <span className={`model-chip-dot ${promptTab === "keyframe" ? "img" : "video"}`}></span> {imageModelId}
            </button>
          )}
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              if (promptTab === "keyframe") {
                handleConfirmKeyframeGenerate("keyframe", "");
              } else if (promptTab === "video") {
                handleConfirmVideoGenerate("video", "");
              } else {
                handleConfirmFramePairGenerate(promptTab, "");
              }
            }}
            disabled={generatingKeyframe}
          >
            {promptTab === "keyframe"
              ? <><ImageIcon style={{ width: 12, height: 12, display: "inline", verticalAlign: "middle" }} /> {t("keyframe.generateKeyframe")}</>
              : promptTab === "video"
                ? <><Clapperboard style={{ width: 12, height: 12, display: "inline", verticalAlign: "middle" }} /> {t("beat.generateVideo")}</>
                : <><Film style={{ width: 12, height: 12, display: "inline", verticalAlign: "middle" }} /> {t("keyframe.generateFramePair")}</>}
          </button>
        </div>
      </div>

      {/* Shot Properties card */}
      <div className="card" style={{ padding: 10, flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-fg)", marginBottom: 6 }}>
          {t("beat.shotProperties")}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          <select
            className="select"
            style={{ fontSize: 12, padding: 6 }}
            value={currentInstruction.shotSize}
            onChange={(e) =>
              handleUpdateShotInstruction({
                shotSize: e.target.value as ShotInstructionTemplate["shotSize"],
              })
            }
          >
            {SHOT_SIZE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </option>
            ))}
          </select>
          <select
            className="select"
            style={{ fontSize: 12, padding: 6 }}
            value={currentInstruction.cameraMovement}
            onChange={(e) =>
              handleUpdateShotInstruction({
                cameraMovement: e.target.value as ShotInstructionTemplate["cameraMovement"],
              })
            }
          >
            {CAMERA_MOVEMENT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </option>
            ))}
          </select>
          <input
            className="input"
            style={{ padding: 6, fontSize: 12 }}
            value={beat.duration ?? 0}
            type="number"
            min={1}
            onChange={(e) =>
              handleUpdateField("duration", parseInt(e.target.value) || 0)
            }
            placeholder={t("beat.seconds")}
          />
        </div>
      </div>

      {/* PromptFloatingBall - AI prompt generation */}
      <PromptFloatingBall
        beat={beat}
        context={promptTab}
        keyframeImageUrl={beat.keyframe?.imageUrl}
        onPromptGenerated={() => {}}
        providerId={imageProviderId}
        modelId={imageModelId}
        characters={characters}
        scenes={scenes}
      />

      {/* Prompt Preview - maxHeight limited to avoid squeezing editor */}
      <div style={{ flexShrink: 0, maxHeight: 240, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <PromptPreview
          beat={beat}
          elements={elements}
          allShots={allShots}
        />
      </div>
    </div>
  );
}
