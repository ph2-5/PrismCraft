import { useState, useCallback, useMemo, useEffect, useRef, Fragment } from "react";
import { errorLogger } from "@/shared/error-logger";
import { isElectron } from "@/shared/utils/platform";
import { container } from "@/infrastructure/di";
import { t } from "@/shared/constants";
import { resolveMediaUrl } from "@/shared/utils/image-url";
import { getBeatCharacterIds } from "@/domain/utils";
import { SHOT_SIZE_OPTIONS } from "@/modules/shot";
import type { Character, Scene, StoryBeat, StoryElement } from "@/domain/schemas";
import type { BatchOptions, BatchResult } from "@/modules/story/generation";
import type { PromptEditorContext } from "@/modules/story/prompt-editor";
import { BeatListView } from "./BeatListView";
import { BeatDetailView } from "./BeatDetailView";

interface MinimalAsset {
  id: string;
  name: string;
  type: string;
  url?: string;
}

interface ProfessionalModeEditorProps {
  currentStory: { genre?: string; tone?: string; id?: string };
  beats: StoryBeat[];
  characters: Character[];
  scenes: Scene[];
  assets: MinimalAsset[];
  onUpdateBeat: (id: string, updates: Partial<StoryBeat>) => void;
  onAddBeat: (type?: StoryBeat["type"]) => void;
  onDeleteBeat: (beatId: string) => void;
  onMoveBeat: (beatId: string, direction: "up" | "down") => void;
  onReorderBeats?: (beats: StoryBeat[]) => void;
  onPlanStoryWithAI: () => Promise<void>;
  onOpenTemplateDialog: () => void;
  onOpenVersionDialog: () => void;
  isGenerating: boolean;
  isPlanningStory: boolean;
  generationEnhanced?: boolean;
  onToggleGenerationEnhanced?: (enabled: boolean) => void;
  onGenerateKeyframe?: (beatId: string) => Promise<StoryBeat | void>;
  onGenerateFramePair?: (beatId: string) => Promise<StoryBeat | void>;
  onGenerateVideoNew?: (beatId: string) => Promise<StoryBeat | void>;
  onRegenerateKeyframe?: (beatId: string) => Promise<void>;
  generatingKeyframe?: Set<string>;
  onUploadKeyframe?: (beatId: string, file: File) => void;
  onUploadFirstFrame?: (beatId: string, file: File) => void;
  onUploadLastFrame?: (beatId: string, file: File) => void;
  onUploadVideo?: (beatId: string, file: File) => void;
  onPromptChange?: (beatId: string, context: PromptEditorContext, prompt: string) => void;
  imageProviderId?: string;
  imageModelId?: string;
  onBatchGenerateKeyframes?: (beatIds?: string[], options?: BatchOptions) => Promise<BatchResult>;
  onBatchGenerateFramePairs?: (beatIds?: string[], options?: BatchOptions) => Promise<BatchResult>;
  onBatchGenerateVideos?: (beatIds?: string[], options?: BatchOptions) => Promise<BatchResult>;
  assetsLoading?: boolean;
}

export function ProfessionalModeEditor({
  currentStory: _currentStory,
  beats,
  characters,
  scenes,
  assets,
  onUpdateBeat,
  onAddBeat,
  onDeleteBeat,
  onMoveBeat,
  onReorderBeats,
  onPlanStoryWithAI,
  onOpenTemplateDialog,
  onOpenVersionDialog,
  isGenerating: _isGenerating,
  isPlanningStory,
  generationEnhanced = true,
  onToggleGenerationEnhanced,
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
  onBatchGenerateKeyframes,
  onBatchGenerateFramePairs,
  onBatchGenerateVideos,
  assetsLoading = false,
}: ProfessionalModeEditorProps) {
  const [editingBeatId, setEditingBeatId] = useState<string | null>(null);
  const [elements, setElements] = useState<StoryElement[]>([]);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const pendingNewBeatRef = useRef<boolean>(false);

  const editingBeat = useMemo(
    () => beats.find((b) => b.id === editingBeatId) || null,
    [beats, editingBeatId],
  );

  const editingBeatIndex = useMemo(() => {
    if (!editingBeat) return -1;
    return beats.findIndex((b) => b.id === editingBeat.id);
  }, [editingBeat, beats]);

  useEffect(() => {
    if (pendingNewBeatRef.current && beats.length > 0) {
      pendingNewBeatRef.current = false;
      setEditingBeatId(beats[beats.length - 1]!.id);
    }
  }, [beats]);

  useEffect(() => {
    let cancelled = false;
    container.elementManager
      .then((em) => em.getAllElements())
      .then((els) => {
        if (!cancelled) setElements(els);
      })
      .catch((err: unknown) => {
        if (!isElectron()) return;
        errorLogger.warn(
          { code: "ElementLoadFailed", message: t("error.elementLoadFailed"), cause: err },
          { component: "ProfessionalModeEditor", source: "getAllElements" },
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    container.elementManager.then((em) => {
      if (cancelled) return;
      unsubscribe = em.subscribe(() => {
        em.getAllElements()
          .then((els) => {
            if (!cancelled) setElements(els);
          })
          .catch((err: unknown) => {
            errorLogger.warn(
              { code: "ElementSubscribeFailed", message: t("error.elementSubscribeFailed"), cause: err },
              { component: "ProfessionalModeEditor", source: "subscribe" },
            );
          });
      });
    }).catch((err: unknown) => {
      if (!cancelled) {
        errorLogger.warn(
          { code: "ElementManagerLoadFailed", message: t("error.elementLoadFailed"), cause: err },
          { component: "ProfessionalModeEditor", source: "elementManager" },
        );
      }
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const handleAddBeat = useCallback(() => {
    pendingNewBeatRef.current = true;
    onAddBeat("scene");
  }, [onAddBeat]);

  const handleUpdateBeat = useCallback(
    (updatedBeat: StoryBeat) => {
      onUpdateBeat(updatedBeat.id, updatedBeat);
    },
    [onUpdateBeat],
  );

  const handleDeleteBeat = useCallback(() => {
    if (!editingBeat) return;
    onDeleteBeat(editingBeat.id);
    setEditingBeatId(null);
  }, [editingBeat, onDeleteBeat]);

  const handlePrevBeat = useCallback(() => {
    if (editingBeatIndex > 0) {
      setEditingBeatId(beats[editingBeatIndex - 1]!.id);
    }
  }, [editingBeatIndex, beats]);

  const handleNextBeat = useCallback(() => {
    if (editingBeatIndex < beats.length - 1) {
      setEditingBeatId(beats[editingBeatIndex + 1]!.id);
    }
  }, [editingBeatIndex, beats]);

  const handleGenerateKeyframe = useCallback(() => {
    if (editingBeat && onGenerateKeyframe) {
      return onGenerateKeyframe(editingBeat.id);
    }
    return Promise.resolve();
  }, [editingBeat, onGenerateKeyframe]);

  const handleGenerateFramePair = useCallback(() => {
    if (editingBeat && onGenerateFramePair) {
      return onGenerateFramePair(editingBeat.id);
    }
    return Promise.resolve();
  }, [editingBeat, onGenerateFramePair]);

  const handleGenerateVideoNew = useCallback(() => {
    if (editingBeat && onGenerateVideoNew) {
      return onGenerateVideoNew(editingBeat.id);
    }
    return Promise.resolve();
  }, [editingBeat, onGenerateVideoNew]);

  const handleRegenerateKeyframe = useCallback(() => {
    if (editingBeat && onRegenerateKeyframe) {
      return onRegenerateKeyframe(editingBeat.id);
    }
    return Promise.resolve();
  }, [editingBeat, onRegenerateKeyframe]);

  const getShotSizeLabel = useCallback((beat: StoryBeat) => {
    const shotSize = beat.shotInstruction?.shotSize || beat.shotType;
    if (!shotSize) return "";
    const option = SHOT_SIZE_OPTIONS.find((o) => o.value === shotSize);
    return option ? t(option.labelKey) : String(shotSize);
  }, []);

  const renderTimelineCard = useCallback(
    (beat: StoryBeat, index: number) => {
      const keyframeImage = resolveMediaUrl(beat.localKeyframePath, beat.keyframe?.imageUrl);
      const charIds = getBeatCharacterIds(beat);
      const charNames = charIds
        .map((id: string) => characters.find((c) => c.id === id)?.name)
        .filter((n): n is string => Boolean(n));
      const sceneName = beat.sceneId
        ? scenes.find((s) => s.id === beat.sceneId)?.name
        : null;
      const shotLabel = getShotSizeLabel(beat);
      const isSelected = editingBeatId === beat.id;
      const isGenerating = generatingKeyframe?.has(beat.id) ?? false;
      const generationStatus = beat.generationStatus || beat.videoGen?.status;
      const isVideoGenerating = isGenerating || generationStatus === "generating" || generationStatus === "pending";

      return (
        <div
          key={beat.id}
          className={`timeline-card ${isSelected ? "selected" : ""}`}
          onClick={() => setEditingBeatId(beat.id)}
        >
          <div className="tc-thumb">
            {isVideoGenerating ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 4, width: "100%", height: "100%" }}>
                <span style={{ fontSize: 20 }}>⚡</span>
                <span style={{ fontSize: 10, color: "var(--muted-fg)" }}>{t("beat.generating")}</span>
                <div className="progress-bar" style={{ width: 60 }}>
                  <div className="progress-fill" style={{ width: "67%" }}></div>
                </div>
              </div>
            ) : keyframeImage ? (
              <img
                src={keyframeImage}
                alt={beat.title || ""}
                style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "8px 8px 0 0" }}
              />
            ) : (
              <span style={{ fontSize: 24, opacity: 0.6 }} aria-hidden="true">🌅</span>
            )}
            <div className="tc-bindings">
              {charNames.map((name: string, idx: number) => (
                <span key={`char-${idx}`} className="tc-bind-tag">👤{name}</span>
              ))}
              {sceneName && (
                <span className="tc-bind-tag">🏙{sceneName}</span>
              )}
            </div>
          </div>
          <div className="tc-info">
            <div className="tc-title">
              {index + 1} · {beat.title || t("beat.shotNumber", { number: index + 1 })}
            </div>
            <div className="tc-dur">
              {beat.duration ?? 0}s{shotLabel ? ` · ${shotLabel}` : ""}
            </div>
          </div>
        </div>
      );
    },
    [characters, scenes, editingBeatId, generatingKeyframe, getShotSizeLabel, t],
  );

  return (
    <div className="flex flex-col h-full">
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <BeatListView
          beats={beats}
          characters={characters}
          scenes={scenes}
          editingBeatId={editingBeatId}
          onEditClick={(beat) => setEditingBeatId(beat.id)}
          onAddBeat={handleAddBeat}
          onMoveBeat={onMoveBeat}
          onDeleteBeat={onDeleteBeat}
          onReorderBeats={onReorderBeats}
          onPlanStoryWithAI={onPlanStoryWithAI}
          onOpenTemplateDialog={onOpenTemplateDialog}
          onOpenVersionDialog={onOpenVersionDialog}
          isPlanningStory={isPlanningStory}
          generationEnhanced={generationEnhanced}
          onToggleGenerationEnhanced={onToggleGenerationEnhanced}
          onBatchGenerateKeyframes={() => onBatchGenerateKeyframes?.()}
          onBatchGenerateFramePairs={() => onBatchGenerateFramePairs?.()}
          onBatchGenerateVideos={() => onBatchGenerateVideos?.()}
          assetsLoading={assetsLoading}
        />

        <BeatDetailView
          editingBeat={editingBeat}
          editingBeatIndex={editingBeatIndex}
          totalBeats={beats.length}
          characters={characters}
          scenes={scenes}
          elements={elements}
          assets={assets}
          allShots={beats}
          onClose={() => setEditingBeatId(null)}
          onPrevBeat={handlePrevBeat}
          onNextBeat={handleNextBeat}
          onMoveBeat={onMoveBeat}
          onUpdateBeat={handleUpdateBeat}
          onDeleteBeat={handleDeleteBeat}
          onGenerateKeyframe={handleGenerateKeyframe}
          onGenerateFramePair={handleGenerateFramePair}
          onGenerateVideoNew={handleGenerateVideoNew}
          onRegenerateKeyframe={handleRegenerateKeyframe}
          generatingKeyframe={editingBeat ? (generatingKeyframe?.has(editingBeat.id) ?? false) : false}
          onUploadKeyframe={onUploadKeyframe}
          onUploadFirstFrame={onUploadFirstFrame}
          onUploadLastFrame={onUploadLastFrame}
          onUploadVideo={onUploadVideo}
          onPromptChange={onPromptChange && editingBeat ? (context, prompt) => onPromptChange(editingBeat.id, context, prompt) : undefined}
          imageProviderId={imageProviderId}
          imageModelId={imageModelId}
        />
      </div>

      <div className="timeline-panel">
        <div className="timeline-header">
          <span style={{ fontSize: 12, fontWeight: 600 }}>{t("story.timeline")}</span>
          <div className="toolbar">
            <button
              className="btn btn-outline btn-xs"
              onClick={() => onBatchGenerateVideos?.()}
              disabled={isPlanningStory || beats.length === 0}
            >
              🎬 {t("story.generateAllVideos")}
            </button>
            <button
              className="btn btn-outline btn-xs"
              onClick={() => setShowPreviewModal(true)}
              disabled={beats.length === 0}
            >
              ▶ {t("story.preview")}
            </button>
          </div>
        </div>
        <div className="timeline-scroll">
          {beats.map((beat, index) => {
            const prevBeat = index > 0 ? beats[index - 1] : null;
            const hasKeyframe = !!beat.keyframe?.imageUrl;
            const prevHasKeyframe = prevBeat ? !!prevBeat.keyframe?.imageUrl : false;
            const isLinked =
              hasKeyframe &&
              prevHasKeyframe &&
              beat.keyframe?.referencedPrevKeyframe === prevBeat?.id;
            const linkColor = isLinked
              ? "var(--primary)"
              : hasKeyframe && prevHasKeyframe
                ? "var(--warning)"
                : "var(--border)";
            const linkStyle: React.CSSProperties = isLinked
              ? { background: linkColor }
              : { background: `repeating-linear-gradient(90deg, ${linkColor} 0 4px, transparent 4px 8px)` };
            return (
              <Fragment key={beat.id}>
                {index > 0 && (
                  <div
                    style={{
                      width: 12,
                      height: 2,
                      flexShrink: 0,
                      alignSelf: "center",
                      ...linkStyle,
                    }}
                    title={
                      isLinked
                        ? t("keyframe.linked")
                        : hasKeyframe && prevHasKeyframe
                          ? t("keyframe.chainBroken")
                          : t("keyframe.beatNoPreview")
                    }
                  />
                )}
                {renderTimelineCard(beat, index)}
              </Fragment>
            );
          })}
          <div
            className="timeline-card"
            style={{ borderStyle: "dashed", display: "flex", alignItems: "center", justifyContent: "center", minWidth: 60, cursor: "pointer" }}
            onClick={handleAddBeat}
          >
            <div style={{ fontSize: 20, color: "var(--muted-fg)" }}>+</div>
          </div>
        </div>
      </div>

      {/* Preview Modal - shows all generated videos */}
      {showPreviewModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
          onClick={() => setShowPreviewModal(false)}
        >
          <div
            className="card"
            style={{
              maxWidth: 900,
              width: "90%",
              maxHeight: "80vh",
              overflowY: "auto",
              padding: 16,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{t("story.preview")}</span>
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => setShowPreviewModal(false)}
              >
                ✕
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
              {beats.filter((b) => b.videoGen?.videoUrl).length === 0 ? (
                <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: 24, color: "var(--muted-fg)" }}>
                  {t("story.noVideosToPreview")}
                </div>
              ) : (
                beats
                  .filter((b) => b.videoGen?.videoUrl)
                  .map((beat, idx) => {
                    const videoUrl = resolveMediaUrl(beat.localVideoPath, beat.videoGen?.videoUrl);
                    return (
                      <div key={beat.id} className="card2" style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                        <video
                          src={videoUrl}
                          controls
                          style={{ width: "100%", aspectRatio: "16 / 9", borderRadius: 6, background: "var(--card2)" }}
                        />
                        <div style={{ fontSize: 12, fontWeight: 600 }}>
                          {idx + 1} · {beat.title || t("beat.shotNumber", { number: idx + 1 })}
                        </div>
                        <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>
                          {beat.duration ?? 0}s
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
