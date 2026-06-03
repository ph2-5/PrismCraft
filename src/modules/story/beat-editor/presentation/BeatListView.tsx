import { useCallback, useMemo, memo } from "react";
import { useVirtualList } from "@/shared/hooks/use-virtual-list";
import {
  Plus,
  Sparkles,
  Film,
  LayoutTemplate,
  BookOpen,
  AlertCircle,
  Image,
  Camera,
  Video,
  Loader2,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Switch } from "@/shared/ui/switch";
import { StatusBadge } from "@/shared/ui/status-badge";
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
import { BeatOverviewCard } from "./BeatOverviewCard";
import { confirm } from "@/shared/utils/confirm";
import { t } from "@/shared/constants";
import type { Character, Scene, StoryBeat } from "@/domain/schemas";

const SortableBeatCard = memo(function SortableBeatCard({
  beat,
  index,
  characters,
  scenes,
  onEditClick,
  onMoveBeat,
  onDeleteBeat,
  totalBeats,
  isSelected,
}: {
  beat: StoryBeat;
  index: number;
  characters: Character[];
  scenes: Scene[];
  onEditClick: (beat: StoryBeat) => void;
  onMoveBeat: (beatId: string, direction: "up" | "down") => void;
  onDeleteBeat: (beatId: string) => void;
  totalBeats: number;
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

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <BeatOverviewCard
        beat={beat}
        index={index}
        characters={characters}
        scenes={scenes}
        onEditClick={onEditClick}
        onMoveBeat={onMoveBeat}
        onDeleteBeat={onDeleteBeat}
        totalBeats={totalBeats}
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
  onMoveBeat,
  onDeleteBeat,
  onReorderBeats,
  onPlanStoryWithAI,
  onOpenTemplateDialog,
  onOpenVersionDialog,
  isPlanningStory,
  generationEnhanced,
  onToggleGenerationEnhanced,
  onBatchGenerateKeyframes,
  onBatchGenerateFramePairs,
  onBatchGenerateVideos,
  assetsLoading,
}: BeatListViewProps) {
  const totalDuration = useMemo(
    () => beats.reduce((sum, b) => sum + (b.duration || 0), 0),
    [beats],
  );

  const completedBeats = useMemo(
    () => beats.filter((b) => b.videoGen?.videoUrl).length,
    [beats],
  );

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
    <div className="w-[280px] shrink-0 flex flex-col border border-border rounded-lg bg-card overflow-hidden">
      <div className="px-3 py-2.5 border-b border-border shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Film className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">{t("beat.beatContent")}</span>
            <StatusBadge
              variant={
                completedBeats === beats.length && beats.length > 0
                  ? "success"
                  : "default"
              }
            >
              {completedBeats}/{beats.length}
            </StatusBadge>
          </div>
          <span className="text-xs text-muted-foreground">
            {t("beat.shotsCountShort", { count: beats.length, duration: totalDuration })}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="default"
            size="sm"
            onClick={onPlanStoryWithAI}
            disabled={isPlanningStory}
            className="gap-1 h-7 text-xs flex-1"
          >
            <Sparkles className="w-3 h-3" />
            {isPlanningStory ? t("beat.planning") : t("beat.aiPlanning")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onAddBeat}
            className="gap-1 h-7 text-xs"
          >
            <Plus className="w-3 h-3" />
            {t("beat.addButton")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenTemplateDialog}
            className="gap-1 h-7 text-xs"
          >
            <LayoutTemplate className="w-3 h-3" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenVersionDialog}
            className="gap-1 h-7 text-xs"
          >
            <BookOpen className="w-3 h-3" />
          </Button>
        </div>

        {beats.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                if (await confirm(t("confirm.batchGenerateAll", { count: beats.length, action: t("beat.batchGeneratePreview") }), t("beat.batchGeneratePreview"))) {
                  onBatchGenerateKeyframes?.();
                }
              }}
              disabled={isPlanningStory}
              className="gap-1 text-xs h-6 flex-1"
              title={t("beat.batchKeyframeTitle")}
            >
              <Image className="w-3 h-3" />
              {t("beat.keyframeButton")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                if (await confirm(t("confirm.batchGenerateAll", { count: beats.length, action: t("beat.batchFramePairTitle") }), t("beat.batchFramePairTitle"))) {
                  onBatchGenerateFramePairs?.();
                }
              }}
              disabled={isPlanningStory}
              className="gap-1 text-xs h-6 flex-1"
              title={t("beat.batchFramePairTitle")}
            >
              <Camera className="w-3 h-3" />
              {t("beat.framePairButton")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                if (await confirm(t("confirm.batchGenerateAll", { count: beats.length, action: t("beat.batchVideoTitle") }) + "\n" + t("batch.mayConsumeApiQuota"), t("beat.batchVideoTitle"))) {
                  onBatchGenerateVideos?.();
                }
              }}
              disabled={isPlanningStory}
              className="gap-1 text-xs h-6 flex-1"
              title={t("beat.batchVideoTitle")}
            >
              <Video className="w-3 h-3" />
              {t("beat.videoButton")}
            </Button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Switch
            checked={generationEnhanced}
            onCheckedChange={(checked) =>
              onToggleGenerationEnhanced?.(checked)
            }
            className="scale-75 origin-left"
          />
          <span className="text-xs text-muted-foreground">{t("beat.aiPlanningEnhanced")}</span>
          <button
            className="text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
            title={t("beat.aiPlanningEnhancedHint")}
          >
            <AlertCircle className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div ref={shouldVirtualize ? parentRef : undefined} className="flex-1 overflow-y-auto p-2">
        {assetsLoading ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-sm gap-2">
            <Loader2 className="w-6 h-6 animate-spin opacity-50" />
            <p>{t("beat.loadingAssets")}</p>
          </div>
        ) : beats.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <Film className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>{t("beat.noBeatsAdded")}</p>
            <p className="text-xs mt-1">{t("beat.clickAIOrAdd")}</p>
          </div>
        ) : shouldVirtualize ? (
          <div style={{ height: totalSize, position: "relative" }}>
            {virtualItems.map((virtualItem) => {
              const beat = beats[virtualItem.index];
              return (
                <div key={beat.id} style={{ position: "absolute", top: virtualItem.start, left: 0, width: "100%", height: virtualItem.size }}>
                  <BeatOverviewCard
                    beat={beat}
                    index={virtualItem.index}
                    characters={characters}
                    scenes={scenes}
                    onEditClick={onEditClick}
                    onMoveBeat={onMoveBeat}
                    onDeleteBeat={onDeleteBeat}
                    totalBeats={beats.length}
                    isSelected={editingBeatId === beat.id}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <DndContext
            sensors={dndSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={beats.map((b) => b.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1.5">
                {beats.map((beat, index) => (
                  <SortableBeatCard
                    key={beat.id}
                    beat={beat}
                    index={index}
                    characters={characters}
                    scenes={scenes}
                    onEditClick={onEditClick}
                    onMoveBeat={onMoveBeat}
                    onDeleteBeat={onDeleteBeat}
                    totalBeats={beats.length}
                    isSelected={editingBeatId === beat.id}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
