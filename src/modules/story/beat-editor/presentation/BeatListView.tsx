import { useCallback, memo } from "react";
import { useVirtualList } from "@/shared/hooks/use-virtual-list";
import {
  Plus,
  Film,
  Loader2,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { t } from "@/shared/constants";
import { getBeatCharacterIds } from "@/domain/utils";
import { SHOT_SIZE_OPTIONS } from "@/modules/shot";
import type { Character, Scene, StoryBeat } from "@/domain/schemas";

interface BeatCardProps {
  beat: StoryBeat;
  index: number;
  characters: Character[];
  scenes: Scene[];
  onEditClick: (beat: StoryBeat) => void;
  isSelected: boolean;
}

function BeatCard({ beat, index, characters, scenes, onEditClick, isSelected }: BeatCardProps) {
  const charIds = getBeatCharacterIds(beat);
  const charNames = charIds
    .map((id: string) => characters.find((c) => c.id === id)?.name)
    .filter((n): n is string => Boolean(n));
  const sceneName = (beat.sceneId || beat.scene)
    ? scenes.find((s) => s.id === (beat.sceneId || beat.scene))?.name
    : null;

  const shotSize = beat.shotInstruction?.shotSize || beat.shotType;
  const shotLabel = shotSize
    ? SHOT_SIZE_OPTIONS.find((o) => o.value === shotSize)?.label || String(shotSize)
    : "";

  const hasVideo = !!beat.videoGen?.videoUrl;
  const hasKeyframe = !!beat.keyframe?.imageUrl;
  const hasFramePair = !!beat.framePair?.firstFrame?.imageUrl;

  const statusBadge = hasVideo
    ? <span className="badge badge-success">✓</span>
    : hasFramePair
      ? <span className="badge badge-success">✓</span>
      : hasKeyframe
        ? <span className="badge badge-success">✓</span>
        : <span className="badge badge-info">⏳</span>;

  return (
    <div
      className="card"
      style={{
        padding: "10px 12px",
        cursor: "pointer",
        borderColor: isSelected ? "var(--primary)" : undefined,
      }}
      onClick={() => onEditClick(beat)}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          className="badge badge-info"
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {index + 1}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {beat.title || t("beat.shotNumber", { number: index + 1 })}
          </div>
          {(beat.content || beat.description) && (
            <div
              style={{
                fontSize: 11,
                color: "var(--muted-fg)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {beat.content || beat.description}
            </div>
          )}
        </div>
        {statusBadge}
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
        {shotLabel && (
          <span
            style={{
              fontSize: 10,
              padding: "2px 6px",
              borderRadius: 4,
              background: "var(--muted)",
              color: "var(--muted-fg)",
            }}
          >
            {shotLabel}·{beat.duration ?? 0}s
          </span>
        )}
        {charNames.length > 0 ? (
          charNames.map((name: string, idx: number) => (
            <span
              key={`char-${idx}`}
              className="badge badge-info"
              style={{ fontSize: 10, padding: "2px 6px" }}
            >
              👤{name}
            </span>
          ))
        ) : (
          <span
            className="badge"
            style={{
              fontSize: 10,
              padding: "2px 6px",
              color: "var(--warning)",
              border: "1px dashed var(--warning)",
            }}
          >
            {t("beat.unboundCharacter")}
          </span>
        )}
        {sceneName ? (
          <span
            className="badge badge-success"
            style={{ fontSize: 10, padding: "2px 6px" }}
          >
            🏙{sceneName}
          </span>
        ) : (
          <span
            className="badge"
            style={{
              fontSize: 10,
              padding: "2px 6px",
              color: "var(--warning)",
              border: "1px dashed var(--warning)",
            }}
          >
            {t("beat.unboundScene")}
          </span>
        )}
      </div>
    </div>
  );
}

const SortableBeatCard = memo(function SortableBeatCard({
  beat,
  index,
  characters,
  scenes,
  onEditClick,
  isSelected,
}: BeatCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: beat.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <BeatCard
        beat={beat}
        index={index}
        characters={characters}
        scenes={scenes}
        onEditClick={onEditClick}
        isSelected={isSelected}
      />
    </div>
  );
});

interface BeatListViewProps {
  beats: StoryBeat[];
  characters: Character[];
  scenes: Scene[];
  editingBeatId: string | null;
  onEditClick: (beat: StoryBeat) => void;
  onAddBeat: () => void;
  onMoveBeat: (beatId: string, direction: "up" | "down") => void;
  onDeleteBeat: (beatId: string) => void;
  onReorderBeats?: (beats: StoryBeat[]) => void;
  onPlanStoryWithAI: () => Promise<void>;
  onOpenTemplateDialog: () => void;
  onOpenVersionDialog: () => void;
  isPlanningStory: boolean;
  generationEnhanced: boolean;
  onToggleGenerationEnhanced?: (enabled: boolean) => void;
  onBatchGenerateKeyframes?: () => void;
  onBatchGenerateFramePairs?: () => void;
  onBatchGenerateVideos?: () => void;
  assetsLoading: boolean;
}

export function BeatListView({
  beats,
  characters,
  scenes,
  editingBeatId,
  onEditClick,
  onAddBeat,
  onMoveBeat: _onMoveBeat,
  onDeleteBeat: _onDeleteBeat,
  onReorderBeats,
  onPlanStoryWithAI: _onPlanStoryWithAI,
  onOpenTemplateDialog: _onOpenTemplateDialog,
  onOpenVersionDialog: _onOpenVersionDialog,
  isPlanningStory: _isPlanningStory,
  generationEnhanced: _generationEnhanced,
  onToggleGenerationEnhanced: _onToggleGenerationEnhanced,
  onBatchGenerateKeyframes: _onBatchGenerateKeyframes,
  onBatchGenerateFramePairs: _onBatchGenerateFramePairs,
  onBatchGenerateVideos: _onBatchGenerateVideos,
  assetsLoading,
}: BeatListViewProps) {
  const dndSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !onReorderBeats) return;
      const oldIndex = beats.findIndex((b) => b.id === active.id);
      const newIndex = beats.findIndex((b) => b.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(beats, oldIndex, newIndex).map(
        (beat, index) => ({ ...beat, order: index, sequence: index }),
      );
      onReorderBeats(reordered);
    },
    [beats, onReorderBeats],
  );

  const shouldVirtualize = beats.length > 20;

  const { parentRef, virtualItems, totalSize } = useVirtualList({
    items: beats,
    estimateSize: 80,
    overscan: 5,
  });

  return (
    <div
      style={{
        width: 340,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        padding: 16,
        gap: 10,
        borderRight: "1px solid var(--border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>
          {t("beat.beatList")}{" "}
          <span style={{ color: "var(--muted-fg)", fontWeight: 400, fontSize: 12 }}>
            {beats.length}
          </span>
        </span>
        <button className="btn btn-primary btn-sm" onClick={onAddBeat}>
          <Plus style={{ width: 14, height: 14 }} />
          {t("beat.addButton")}
        </button>
      </div>

      {assetsLoading ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 0", color: "var(--muted-fg)", fontSize: 13, gap: 8 }}>
          <Loader2 style={{ width: 24, height: 24, animation: "spin 1s linear infinite", opacity: 0.5 }} />
          <p>{t("beat.loadingAssets")}</p>
        </div>
      ) : beats.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: "var(--muted-fg)", fontSize: 13 }}>
          <Film style={{ width: 32, height: 32, margin: "0 auto 8px", opacity: 0.3 }} />
          <p>{t("beat.noBeatsAdded")}</p>
          <p style={{ fontSize: 11, marginTop: 4 }}>{t("beat.clickAIOrAdd")}</p>
        </div>
      ) : shouldVirtualize ? (
        <div ref={parentRef} style={{ flex: 1, overflowY: "auto" }}>
          <div style={{ height: totalSize, position: "relative" }}>
            {virtualItems.map((virtualItem) => {
              const beat = beats[virtualItem.index]!;
              return (
                <div
                  key={beat.id}
                  style={{
                    position: "absolute",
                    top: virtualItem.start,
                    left: 0,
                    width: "100%",
                    height: virtualItem.size,
                  }}
                >
                  <BeatCard
                    beat={beat}
                    index={virtualItem.index}
                    characters={characters}
                    scenes={scenes}
                    onEditClick={onEditClick}
                    isSelected={editingBeatId === beat.id}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div ref={shouldVirtualize ? parentRef : undefined} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          <DndContext
            sensors={dndSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={beats.map((b) => b.id)}
              strategy={verticalListSortingStrategy}
            >
              {beats.map((beat, index) => (
                <SortableBeatCard
                  key={beat.id}
                  beat={beat}
                  index={index}
                  characters={characters}
                  scenes={scenes}
                  onEditClick={onEditClick}
                  isSelected={editingBeatId === beat.id}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  );
}
