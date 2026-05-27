"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
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
import { errorLogger } from "@/shared/error-logger";
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
import { BeatDetailEditor } from "./BeatDetailEditor";
import { container } from "@/infrastructure/di";
import type { Character, Scene, StoryBeat, StoryElement } from "@/domain/schemas";
import type { BatchOptions, BatchResult } from "@/modules/story/generation";
import type { PromptEditorContext } from "@/modules/story/prompt-editor";

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

function SortableBeatCard({
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
  const pendingNewBeatRef = useRef<boolean>(false);

  const editingBeat = useMemo(
    () => beats.find((b) => b.id === editingBeatId) || null,
    [beats, editingBeatId],
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

  useEffect(() => {
    if (pendingNewBeatRef.current && beats.length > 0) {
      pendingNewBeatRef.current = false;
      setEditingBeatId(beats[beats.length - 1].id);
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
        errorLogger.warn(
          { code: "ElementLoadFailed", message: "元素加载失败", cause: err },
          { component: "ProfessionalModeEditor", source: "getAllElements" },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [beats, characters, scenes]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    container.elementManager.then((em) => {
      unsubscribe = em.subscribe(() => {
        em.getAllElements()
          .then((els) => {
            setElements(els);
          })
          .catch((err: unknown) => {
            errorLogger.warn(
              { code: "ElementSubscribeFailed", message: "订阅更新元素失败", cause: err },
              { component: "ProfessionalModeEditor", source: "subscribe" },
            );
          });
      });
    });
    return () => {
      unsubscribe?.();
    };
  }, []);

  const totalDuration = useMemo(
    () => beats.reduce((sum, b) => sum + (b.duration || 0), 0),
    [beats],
  );

  const completedBeats = useMemo(
    () => beats.filter((b) => b.videoGen?.videoUrl).length,
    [beats],
  );

  const editingBeatIndex = useMemo(() => {
    if (!editingBeat) return -1;
    return beats.findIndex((b) => b.id === editingBeat.id);
  }, [editingBeat, beats]);

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
      setEditingBeatId(beats[editingBeatIndex - 1].id);
    }
  }, [editingBeatIndex, beats]);

  const handleNextBeat = useCallback(() => {
    if (editingBeatIndex < beats.length - 1) {
      setEditingBeatId(beats[editingBeatIndex + 1].id);
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

  return (
    <div className="flex gap-3 h-full">
      {/* Left: Beat List */}
      <div className="w-[280px] shrink-0 flex flex-col border border-border rounded-lg bg-card overflow-hidden">
        {/* Compact Header */}
        <div className="px-3 py-2.5 border-b border-border shrink-0 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Film className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">分镜</span>
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
              {beats.length}镜 · {totalDuration}s
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
              {isPlanningStory ? "规划中..." : "AI规划"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddBeat}
              className="gap-1 h-7 text-xs"
            >
              <Plus className="w-3 h-3" />
              添加
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
                  if (await confirm(`确定为所有 ${beats.length} 个分镜批量生成预览图吗？`, "批量生成预览图")) {
                    onBatchGenerateKeyframes?.();
                  }
                }}
                disabled={isPlanningStory}
                className="gap-1 text-xs h-6 flex-1"
                title="批量生成预览图"
              >
                <Image className="w-3 h-3" />
                预览图
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  if (await confirm(`确定为所有 ${beats.length} 个分镜批量生成首尾帧吗？`, "批量生成首尾帧")) {
                    onBatchGenerateFramePairs?.();
                  }
                }}
                disabled={isPlanningStory}
                className="gap-1 text-xs h-6 flex-1"
                title="批量生成首尾帧"
              >
                <Camera className="w-3 h-3" />
                首尾帧
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  if (await confirm(`确定为所有 ${beats.length} 个分镜批量生成视频吗？\n这可能消耗较多 API 额度。`, "批量生成视频")) {
                    onBatchGenerateVideos?.();
                  }
                }}
                disabled={isPlanningStory}
                className="gap-1 text-xs h-6 flex-1"
                title="批量生成视频"
              >
                <Video className="w-3 h-3" />
                视频
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
            <span className="text-xs text-muted-foreground">AI规划增强</span>
            <button
              className="text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
              title="开启后，AI规划分镜时将使用 Few-shot 示例引导和 Schema 硬约束校验"
            >
              <AlertCircle className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Beat list */}
        <div className="flex-1 overflow-y-auto p-2">
          {assetsLoading ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-sm gap-2">
              <Loader2 className="w-6 h-6 animate-spin opacity-50" />
              <p>加载素材中...</p>
            </div>
          ) : beats.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Film className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>还没有添加镜头</p>
              <p className="text-xs mt-1">点击 AI规划 或 添加 开始</p>
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
                      onEditClick={(beat) => setEditingBeatId(beat.id)}
                      onMoveBeat={onMoveBeat}
                      onDeleteBeat={onDeleteBeat}
                      totalBeats={beats.length}
                      isSelected={editingBeat?.id === beat.id}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      {/* Right: Beat Detail */}
      <div className="flex-1 min-w-0 border border-border rounded-lg bg-card overflow-hidden">
        {editingBeat ? (
          <BeatDetailEditor
            beat={editingBeat}
            index={editingBeatIndex}
            totalBeats={beats.length}
            characters={characters}
            scenes={scenes}
            elements={elements}
            assets={assets}
            allShots={beats}
            onClose={() => setEditingBeatId(null)}
            onPrevBeat={handlePrevBeat}
            onNextBeat={handleNextBeat}
            onUpdateBeat={handleUpdateBeat}
            onDeleteBeat={handleDeleteBeat}
            onGenerateKeyframe={handleGenerateKeyframe}
            onGenerateFramePair={handleGenerateFramePair}
            onGenerateVideoNew={handleGenerateVideoNew}
            onRegenerateKeyframe={handleRegenerateKeyframe}
            generatingKeyframe={generatingKeyframe?.has(editingBeat.id) ?? false}
            onUploadKeyframe={onUploadKeyframe}
            onUploadFirstFrame={onUploadFirstFrame}
            onUploadLastFrame={onUploadLastFrame}
            onUploadVideo={onUploadVideo}
            onPromptChange={onPromptChange ? (context, prompt) => onPromptChange(editingBeat.id, context, prompt) : undefined}
            imageProviderId={imageProviderId}
            imageModelId={imageModelId}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Film className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">选择左侧分镜查看详情</p>
              <p className="text-xs mt-1">或点击 AI规划 自动生成分镜</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
