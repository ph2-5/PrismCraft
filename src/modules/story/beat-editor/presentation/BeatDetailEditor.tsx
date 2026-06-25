import { useEffect, useState, useRef } from "react";
import { t } from "@/shared/constants";
import { resolveMediaUrl } from "@/shared/utils/image-url";
import { getBeatCharacterIds } from "@/domain/utils";
import {
  SHOT_SIZE_OPTIONS,
  CAMERA_MOVEMENT_OPTIONS,
} from "@/modules/shot";
import type {
  StoryBeat,
  Character,
  Scene,
  StoryElement,
  ShotInstructionTemplate,
  ElementType,
} from "@/domain/schemas";
import { PromptEditor, PromptFloatingBall } from "@/modules/story/prompt-editor";
import type { PromptEditorContext } from "@/modules/story/prompt-editor";
import { PromptPreview } from "@/modules/story/generation";
import { ElementBindingPanel } from "./ElementBindingPanel";
import { useConfirmDialog } from "@/shared/ui/confirm-dialog";
import { errorLogger } from "@/shared/error-logger";
import { useToastHelpers } from "@/shared/presentation/Toast";

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
  onPromptChange?: (context: PromptEditorContext, prompt: string) => void;
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
  const { confirm: confirmDialog, ConfirmDialogComponent } = useConfirmDialog();
  const { error: showError } = useToastHelpers();
  const [promptTab, setPromptTab] = useState<PromptEditorContext>("keyframe");
  const keyframeInputRef = useRef<HTMLInputElement>(null);
  const firstFrameInputRef = useRef<HTMLInputElement>(null);
  const lastFrameInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (
    e: React.ChangeEvent<HTMLInputElement>,
    handler?: (file: File) => void,
  ) => {
    const file = e.target.files?.[0];
    if (file && handler) {
      handler(file);
    }
    e.target.value = "";
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

  const handleOneClickGenerate = async () => {
    try {
      const hasKeyframe = !!beat.keyframe?.imageUrl;
      const hasFramePair =
        !!beat.framePair?.firstFrame?.imageUrl &&
        !!beat.framePair?.lastFrame?.imageUrl;
      const hasVideo = !!beat.videoGen?.videoUrl;
      if (!hasKeyframe && onGenerateKeyframe) await onGenerateKeyframe();
      if (!hasFramePair && onGenerateFramePair) await onGenerateFramePair();
      if (!hasVideo && onGenerateVideoNew) await onGenerateVideoNew();
    } catch (err) {
      const message = err instanceof Error ? err.message : t("error.keyframeBatchFailed");
      showError(t("error.keyframeBatchFailed"), message);
    }
  };

  const handleUpdateField = (
    field: keyof StoryBeat,
    value: StoryBeat[keyof StoryBeat],
  ) => {
    onUpdateBeat({ ...beat, [field]: value } as StoryBeat);
  };

  const selectedScene = scenes.find((scene) => scene.id === (beat.sceneId || beat.scene));
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

  // Shot instruction helpers
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

  const shotSizeLabel = (() => {
    const option = SHOT_SIZE_OPTIONS.find((o) => o.value === currentInstruction.shotSize);
    return option?.label || "";
  })();

  const cameraMovementLabel = (() => {
    const option = CAMERA_MOVEMENT_OPTIONS.find((o) => o.value === currentInstruction.cameraMovement);
    return option?.label || "";
  })();

  const durationLabel = beat.duration ?? 0;

  // Bound elements for binding count
  const boundElementIds = beat.elementIds || [];
  const boundElements = boundElementIds
    .map((id) => elements.find((e) => e.id === id))
    .filter((e): e is StoryElement => !!e);

  // Preview data
  const keyframeImage = resolveMediaUrl(beat.localKeyframePath, beat.keyframe?.imageUrl);
  const firstFrameImage = resolveMediaUrl(beat.localFirstFramePath, beat.framePair?.firstFrame?.imageUrl);
  const lastFrameImage = resolveMediaUrl(beat.localLastFramePath, beat.framePair?.lastFrame?.imageUrl);
  const videoUrl = resolveMediaUrl(beat.localVideoPath, beat.videoGen?.videoUrl);

  // Consistency check data
  const consistencyCheck = beat.consistencyCheck;
  const charIds = getBeatCharacterIds(beat);
  const boundCharacters = charIds
    .map((id) => characters.find((c) => c.id === id))
    .filter((c): c is Character => !!c);

  const handleDeleteClick = () => {
    confirmDialog({
      title: t("beat.deleteBeatTitle"),
      description: t("beat.deleteBeatDesc"),
      confirmText: t("common.delete"),
      variant: "danger",
    }).then((confirmed) => {
      if (confirmed) onDeleteBeat();
    }).catch((err) => {
      errorLogger.warn("[BeatDetailEditor] confirm dialog error", err);
    });
  };

  const handleMoveUp = () => {
    if (onMoveBeat && index > 0) {
      onMoveBeat(beat.id, "up");
    }
  };

  const handleMoveDown = () => {
    if (onMoveBeat && index < totalBeats - 1) {
      onMoveBeat(beat.id, "down");
    }
  };

  return (
    <div
      className="h-full flex flex-col"
      role="region"
      aria-label={t("beat.editBeatN", { n: index + 1 })}
    >
      {/* Beat Toolbar */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <div className="toolbar">
          <span
            className="badge badge-info"
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {index + 1}
          </span>
          <span style={{ fontWeight: 600, fontSize: 14 }}>
            {beat.title || t("beat.shotNumber", { number: index + 1 })}
          </span>
          <span style={{ fontSize: 12, color: "var(--muted-fg)" }}>
            {shotSizeLabel}
            {cameraMovementLabel ? ` · ${cameraMovementLabel}` : ""}
            {` · ${durationLabel}${t("beat.seconds")}`}
          </span>
        </div>
        <div className="toolbar">
          <button
            className="btn btn-outline btn-xs"
            onClick={onPrevBeat}
            disabled={index === 0}
            aria-label={t("aria.prevBeat")}
          >
            ←
          </button>
          <button
            className="btn btn-outline btn-xs"
            onClick={onNextBeat}
            disabled={index === totalBeats - 1}
            aria-label={t("aria.nextBeat")}
          >
            →
          </button>
          <button
            className="btn btn-outline btn-xs"
            onClick={handleMoveUp}
            disabled={index === 0}
            aria-label={t("aria.moveUpBeat")}
          >
            ↑
          </button>
          <button
            className="btn btn-outline btn-xs"
            onClick={handleMoveDown}
            disabled={index === totalBeats - 1}
            aria-label={t("aria.moveDownBeat")}
          >
            ↓
          </button>
          <button
            className="btn btn-danger btn-xs"
            onClick={handleDeleteClick}
            aria-label={t("common.delete")}
          >
            🗑
          </button>
        </div>
      </div>

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
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          {/* Prompt tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
            <button
              className={`top-tab ${promptTab === "keyframe" ? "active" : ""}`}
              onClick={() => setPromptTab("keyframe")}
              style={{ fontSize: 12, padding: "7px 12px" }}
            >
              {t("prompt.keyframePrompt")}
            </button>
            <button
              className={`top-tab ${promptTab === "firstFrame" ? "active" : ""}`}
              onClick={() => setPromptTab("firstFrame")}
              style={{ fontSize: 12, padding: "7px 12px" }}
            >
              {t("prompt.firstFramePrompt")}
            </button>
            <button
              className={`top-tab ${promptTab === "lastFrame" ? "active" : ""}`}
              onClick={() => setPromptTab("lastFrame")}
              style={{ fontSize: 12, padding: "7px 12px" }}
            >
              {t("prompt.lastFramePrompt")}
            </button>
            <button
              className={`top-tab ${promptTab === "video" ? "active" : ""}`}
              onClick={() => setPromptTab("video")}
              style={{ fontSize: 12, padding: "7px 12px" }}
            >
              {t("prompt.videoPrompt")}
            </button>
          </div>

          {/* Prompt editor card */}
          <div className="card2" style={{ padding: 12, flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 10, overflow: "hidden" }}>
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
            {/* Binding visual tags - shows bound characters/scenes inline */}
            {boundElements.length > 0 && (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", padding: "4px 0" }}>
                {boundElements.map((el) => {
                  const isCharacter = el.type === "character";
                  const isScene = (el as StoryElement).type === ("scene" as unknown as ElementType);
                  if (!isCharacter && !isScene) return null;
                  return (
                    <span key={el.id} className={`prompt-binding-tag ${isCharacter ? "char" : "scene"}`}>
                      {isCharacter ? "👤" : "🏙"} {el.name}
                    </span>
                  );
                })}
              </div>
            )}
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
                  ? `🖼 ${t("keyframe.generateKeyframe")}`
                  : promptTab === "video"
                    ? `🎬 ${t("beat.generateVideo")}`
                    : `🎞 ${t("keyframe.generateFramePair")}`}
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
                    {opt.label}
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
                    {opt.label}
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

          {/* Prompt Preview - shows final generated prompt */}
          <div className="card" style={{ padding: 10, flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-fg)", marginBottom: 6 }}>
              {t("beat.promptPreview")}
            </div>
            <PromptPreview
              beat={beat}
              elements={elements}
              allShots={allShots}
            />
          </div>
        </div>

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
        <div
          style={{
            width: 220,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {/* Hidden file inputs */}
          <input ref={keyframeInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileSelect(e, onUploadKeyframe ? (file) => onUploadKeyframe(beat.id, file) : undefined)} />
          <input ref={firstFrameInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileSelect(e, onUploadFirstFrame ? (file) => onUploadFirstFrame(beat.id, file) : undefined)} />
          <input ref={lastFrameInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileSelect(e, onUploadLastFrame ? (file) => onUploadLastFrame(beat.id, file) : undefined)} />
          <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => handleFileSelect(e, onUploadVideo ? (file) => onUploadVideo(beat.id, file) : undefined)} />

          {/* Keyframe preview */}
          <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-fg)" }}>
              {t("beat.keyframePreview")}
            </div>
            <div
              style={{
                width: "100%",
                aspectRatio: "16 / 9",
                background: keyframeImage ? "transparent" : "var(--card2)",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 36,
                opacity: keyframeImage ? 1 : 0.6,
                overflow: "hidden",
              }}
            >
              {keyframeImage ? (
                <img
                  src={keyframeImage}
                  alt={beat.title || ""}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <span>🌅</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={onGenerateKeyframe}
                disabled={generatingKeyframe}
              >
                {t("common.generate")}
              </button>
              <button
                className="btn btn-outline btn-xs"
                onClick={() => keyframeInputRef.current?.click()}
                aria-label={t("common.upload")}
              >
                📤
              </button>
              {onRegenerateKeyframe && keyframeImage && (
                <button
                  className="btn btn-outline btn-xs"
                  onClick={onRegenerateKeyframe}
                  disabled={generatingKeyframe}
                  aria-label={t("common.regenerate")}
                >
                  🔄
                </button>
              )}
            </div>
          </div>

          {/* First-last frame preview */}
          <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-fg)" }}>
              {t("beat.firstLastFrame")}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
              <div
                style={{
                  width: "100%",
                  aspectRatio: "16 / 9",
                  background: firstFrameImage ? "transparent" : "var(--card2)",
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  opacity: firstFrameImage ? 1 : 0.5,
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                {firstFrameImage ? (
                  <img
                    src={firstFrameImage}
                    alt="first frame"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <span>首帧</span>
                )}
              </div>
              <div
                style={{
                  width: "100%",
                  aspectRatio: "16 / 9",
                  background: lastFrameImage ? "transparent" : "var(--card2)",
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  opacity: lastFrameImage ? 1 : 0.5,
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                {lastFrameImage ? (
                  <img
                    src={lastFrameImage}
                    alt="last frame"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <span>尾帧</span>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={onGenerateFramePair}
                disabled={generatingKeyframe}
              >
                {t("common.generate")}
              </button>
              <button
                className="btn btn-outline btn-xs"
                onClick={() => firstFrameInputRef.current?.click()}
                aria-label={t("keyframe.uploadFirstFrame")}
              >
                📤
              </button>
              <button
                className="btn btn-outline btn-xs"
                onClick={() => lastFrameInputRef.current?.click()}
                aria-label={t("keyframe.uploadLastFrame")}
              >
                📥
              </button>
            </div>
          </div>

          {/* Video generation preview */}
          <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-fg)" }}>
              {t("beat.videoGeneration")}
            </div>
            <div
              style={{
                width: "100%",
                aspectRatio: "16 / 9",
                background: "var(--card2)",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 24,
                opacity: 0.4,
                overflow: "hidden",
              }}
            >
              {videoUrl ? (
                <video
                  src={videoUrl}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  controls
                />
              ) : (
                <span>▶️</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
              {imageModelId && (
                <button className="model-chip">
                  <span className="model-chip-dot video"></span> {imageModelId}
                </button>
              )}
              <button
                className="btn btn-primary btn-sm"
                onClick={onGenerateVideoNew}
                disabled={generatingKeyframe}
              >
                {t("common.generate")}
              </button>
              <button
                className="btn btn-outline btn-xs"
                onClick={() => videoInputRef.current?.click()}
                aria-label={t("common.upload")}
              >
                📤
              </button>
            </div>
          </div>

          {/* One-click generate */}
          <button
            className="btn btn-primary btn-sm"
            style={{ width: "100%", justifyContent: "center" }}
            onClick={handleOneClickGenerate}
            disabled={generatingKeyframe}
          >
            ✨ {t("keyframe.oneClickGenerate")}
          </button>
        </div>
      </div>
      {ConfirmDialogComponent}
    </div>
  );
}
