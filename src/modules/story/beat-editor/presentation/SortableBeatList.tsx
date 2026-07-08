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
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Film, Clock, Image, Video } from "lucide-react";
import type { StoryBeat } from "@/domain/schemas";
import { t } from "@/shared/constants";

interface SortableBeatListProps {
  beats: StoryBeat[];
  onReorder: (beats: StoryBeat[]) => void;
  onSelectBeat: (beatId: string) => void;
  selectedBeatId?: string;
}

function SortableBeatItem({
  beat,
  index,
  onSelect,
  isSelected,
}: {
  beat: StoryBeat;
  index: number;
  onSelect: (id: string) => void;
  isSelected: boolean;
}) {
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

  const hasKeyframe = !!beat.keyframe?.imageUrl;
  const hasVideo = !!beat.videoGen?.videoUrl;

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 12px",
        borderRadius: 8,
        border: `1px solid ${isSelected ? "var(--primary)" : "var(--border)"}`,
        background: isSelected ? "rgba(var(--primary-rgb), 0.08)" : "var(--card)",
        cursor: "pointer",
        transition: "border-color 0.15s, background 0.15s",
        boxShadow: isDragging ? "0 4px 12px rgba(0,0,0,0.15)" : undefined,
      }}
      onClick={() => onSelect(beat.id)}
    >
      <button
        style={{
          padding: 4,
          cursor: "grab",
          color: "var(--muted-fg)",
          touchAction: "none",
          background: "transparent",
          border: "none",
        }}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>

      <span
        style={{
          width: 24,
          height: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "50%",
          background: "var(--muted)",
          fontSize: 11,
          fontWeight: 500,
          color: "var(--muted-fg)",
          flexShrink: 0,
        }}
      >
        {index + 1}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--fg)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {beat.title || t("beat.shotNumber", { number: index + 1 })}
        </p>
        {beat.description && (
          <p
            style={{
              fontSize: 11,
              color: "var(--muted-fg)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              marginTop: 2,
            }}
          >
            {beat.description}
          </p>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {beat.shotType && (
          <span className="badge badge-info" style={{ fontSize: 10 }}>
            {beat.shotType}
          </span>
        )}
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            fontSize: 11,
            color: "var(--muted-fg)",
          }}
        >
          <Clock size={12} />
          {beat.duration || 5}s
        </span>
        {hasKeyframe && (
          <Image size={14} style={{ color: "var(--success)" }} />
        )}
        {hasVideo && (
          <Video size={14} style={{ color: "var(--primary)" }} />
        )}
      </div>
    </div>
  );
}

export default function SortableBeatList({
  beats,
  onReorder,
  onSelectBeat,
  selectedBeatId,
}: SortableBeatListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = beats.findIndex((b) => b.id === active.id);
    const newIndex = beats.findIndex((b) => b.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(beats, oldIndex, newIndex).map(
      (beat, index) => ({
        ...beat,
        order: index,
        sequence: index,
      }),
    );
    onReorder(reordered);
  };

  if (beats.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "48px 0",
          color: "var(--muted-fg)",
        }}
      >
        <Film size={40} style={{ margin: "0 auto 8px", opacity: 0.5 }} />
        <p style={{ fontSize: 13 }}>{t("beat.noBeatsYet")}</p>
        <p style={{ fontSize: 12, marginTop: 4 }}>{t("beat.addBeatsToStart")}</p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={beats.map((b) => b.id)}
        strategy={verticalListSortingStrategy}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <p style={{ fontSize: 11, color: "var(--muted-fg)", marginBottom: 4 }}>
            {t("beat.dragToReorder")}
          </p>
          {beats.map((beat, index) => (
            <SortableBeatItem
              key={beat.id}
              beat={beat}
              index={index}
              onSelect={onSelectBeat}
              isSelected={selectedBeatId === beat.id}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
