import { useState, useCallback, useMemo, useRef, useEffect, Fragment } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Clapperboard, Play, X } from "lucide-react";
import { t } from "@/shared/constants";
import { resolveMediaUrl } from "@/shared/utils/image-url";
import type { Character, Scene, StoryBeat } from "@/domain/schemas";
import type { BatchOptions, BatchResult } from "@/modules/storyboard/generation";
import type { PromptEditorContext } from "@/modules/storyboard/prompt-editor";
import { ShotTimeline } from "@/modules/shot";
import { useVideoTaskStore } from "@/modules/video";
import { BeatListView } from "./BeatListView";
import { BeatDetailView } from "./BeatDetailView";
import { BeatThumbnailCard } from "./BeatThumbnailCard";
import { StoryboardBottomInputBar } from "./StoryboardBottomInputBar";
import { useElementsSubscription } from "./use-elements-subscription";

/**
 * 可拖拽的分镜缩略图卡片（包装 BeatThumbnailCard + useSortable）。
 *
 * 使用 horizontalListSortingStrategy 支持水平时间轴拖拽排序。
 * 拖拽手柄为整个卡片（cursor: grab），点击仍可选择分镜。
 */
interface SortableBeatThumbnailCardProps {
  beat: StoryBeat;
  index: number;
  isSelected: boolean;
  characters: Character[];
  scenes: Scene[];
  isGenerating?: boolean;
  /** 视频生成进度（0-100），来自 VideoTask.progress */
  progress?: number;
  onClick: (beatId: string) => void;
}

function SortableBeatThumbnailCard({
  beat,
  index,
  isSelected,
  characters,
  scenes,
  isGenerating,
  progress,
  onClick,
}: SortableBeatThumbnailCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: beat.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <BeatThumbnailCard
      beat={beat}
      index={index}
      isSelected={isSelected}
      characters={characters}
      scenes={scenes}
      isGenerating={isGenerating}
      progress={progress}
      onClick={onClick}
      dragRef={setNodeRef}
      dragStyle={style}
      dragAttributes={attributes as unknown as Record<string, unknown>}
      dragListeners={listeners as unknown as Record<string, unknown>}
    />
  );
}

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
  onPlanStoryWithAI: (userPrompt?: string) => Promise<void>;
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

interface PreviewModalProps {
  beats: StoryBeat[];
  onClose: () => void;
}

function PreviewModal({ beats, onClose }: PreviewModalProps) {
  const videos = beats.filter((b) => b.videoGen?.videoUrl);
  return (
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
      role="dialog"
      aria-modal="true"
      aria-label={t("story.preview")}
      tabIndex={-1}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
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
            onClick={onClose}
            aria-label={t("aria.close")}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
          {videos.length === 0 ? (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: 24, color: "var(--muted-fg)" }}>
              {t("story.noVideosToPreview")}
            </div>
          ) : (
            videos.map((beat, idx) => {
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
  );
}

interface BeatTimelineSectionProps {
  beats: StoryBeat[];
  characters: Character[];
  scenes: Scene[];
  editingBeatId: string | null;
  generatingKeyframe?: Set<string>;
  progressByBeat: Map<string, number>;
  isPlanningStory: boolean;
  onAddBeat: () => void;
  onBatchGenerateVideos: () => void;
  onOpenPreview: () => void;
  onBeatClick: (beatId: string) => void;
  onDragEnd: (event: DragEndEvent) => void;
}

function BeatTimelineSection({
  beats,
  characters,
  scenes,
  editingBeatId,
  generatingKeyframe,
  progressByBeat,
  isPlanningStory,
  onAddBeat,
  onBatchGenerateVideos,
  onOpenPreview,
  onBeatClick,
  onDragEnd,
}: BeatTimelineSectionProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  return (
    <ShotTimeline
      isEmpty={beats.length === 0}
      onAddBeat={onAddBeat}
      toolbar={
        <>
          <button
            className="btn btn-outline btn-xs"
            onClick={onBatchGenerateVideos}
            disabled={isPlanningStory || beats.length === 0}
            title={t("story.generateAllVideos")}
          >
            <Clapperboard style={{ width: 12, height: 12, display: "inline", verticalAlign: "middle" }} aria-hidden="true" /> {t("story.generateAllVideos")}
          </button>
          <button
            className="btn btn-outline btn-xs"
            onClick={onOpenPreview}
            disabled={beats.length === 0}
            title={t("story.preview")}
          >
            <Play style={{ width: 12, height: 12, display: "inline", verticalAlign: "middle" }} aria-hidden="true" /> {t("story.preview")}
          </button>
        </>
      }
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={beats.map((b) => b.id)}
          strategy={horizontalListSortingStrategy}
        >
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
                <SortableBeatThumbnailCard
                  beat={beat}
                  index={index}
                  isSelected={editingBeatId === beat.id}
                  characters={characters}
                  scenes={scenes}
                  isGenerating={generatingKeyframe?.has(beat.id) ?? false}
                  progress={progressByBeat.get(beat.id)}
                  onClick={onBeatClick}
                />
              </Fragment>
            );
          })}
        </SortableContext>
      </DndContext>
    </ShotTimeline>
  );
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
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const pendingNewBeatRef = useRef<boolean>(false);
  const elements = useElementsSubscription();

  // 视频任务进度查询：先通过 selector 获取 allTasks 引用（Zustand 用 Object.is 比较，稳定），
  // 再用 useMemo 派生 beatId → progress 的 Map。
  // 注意：不能在 selector 内直接返回新 Map，否则 Zustand v5 + useSyncExternalStore 会因
  // 每次返回新引用而判定 store 持续变化，触发 "Maximum update depth exceeded" 无限循环。
  const allTasks = useVideoTaskStore((s) => s.allTasks);
  const progressByBeat = useMemo(() => {
    const map = new Map<string, number>();
    for (const task of allTasks) {
      if (task.beatId && typeof task.progress === "number") {
        map.set(task.beatId, task.progress);
      }
    }
    return map;
  }, [allTasks]);

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

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = beats.findIndex((b) => b.id === active.id);
      const newIndex = beats.findIndex((b) => b.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(beats, oldIndex, newIndex).map((beat, index) => ({
        ...beat,
        order: index,
        sequence: index,
      }));
      onReorderBeats?.(reordered);
    },
    [beats, onReorderBeats],
  );

  const handleBatchGenerateVideos = useCallback(() => {
    onBatchGenerateVideos?.();
  }, [onBatchGenerateVideos]);

  const handleOpenPreview = useCallback(() => setShowPreviewModal(true), []);
  const handleClosePreview = useCallback(() => setShowPreviewModal(false), []);

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

      <BeatTimelineSection
        beats={beats}
        characters={characters}
        scenes={scenes}
        editingBeatId={editingBeatId}
        generatingKeyframe={generatingKeyframe}
        progressByBeat={progressByBeat}
        isPlanningStory={isPlanningStory}
        onAddBeat={handleAddBeat}
        onBatchGenerateVideos={handleBatchGenerateVideos}
        onOpenPreview={handleOpenPreview}
        onBeatClick={setEditingBeatId}
        onDragEnd={handleDragEnd}
      />

      {/* Task 2B.11：底部 AI 输入栏（匹配 design-preview.html #bottom-bar-storyboard） */}
      <StoryboardBottomInputBar
        modelId={imageModelId}
        isGenerating={isPlanningStory}
        onGenerate={(prompt) => {
          // 将底部输入栏收集的用户描述作为 userPrompt 传给 AI 规划管道
          void onPlanStoryWithAI(prompt);
        }}
      />

      {/* Preview Modal - shows all generated videos */}
      {showPreviewModal && (
        <PreviewModal beats={beats} onClose={handleClosePreview} />
      )}
    </div>
  );
}
