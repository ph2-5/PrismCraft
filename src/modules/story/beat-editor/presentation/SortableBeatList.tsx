"use client";

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
      style={style}
      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-colors cursor-pointer ${
        isSelected
          ? "border-blue-400 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-600"
          : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-gray-800"
      } ${isDragging ? "shadow-lg" : ""}`}
      onClick={() => onSelect(beat.id)}
    >
      <button
        className="p-1 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>

      <span className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-xs font-medium text-gray-600 dark:text-gray-400 shrink-0">
        {index + 1}
      </span>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {beat.title || `镜头 ${index + 1}`}
        </p>
        {beat.description && (
          <p className="text-xs text-gray-500 truncate mt-0.5">
            {beat.description}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {beat.shotType && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
            {beat.shotType}
          </span>
        )}
        <span className="flex items-center gap-0.5 text-xs text-gray-400">
          <Clock size={12} />
          {beat.duration || 5}s
        </span>
        {hasKeyframe && (
          <Image size={14} className="text-green-500" />
        )}
        {hasVideo && (
          <Video size={14} className="text-blue-500" />
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
      <div className="text-center py-12 text-gray-400">
        <Film size={40} className="mx-auto mb-2 opacity-50" />
        <p className="text-sm">暂无分镜</p>
        <p className="text-xs mt-1">添加分镜开始创作</p>
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
        <div className="space-y-1.5">
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
