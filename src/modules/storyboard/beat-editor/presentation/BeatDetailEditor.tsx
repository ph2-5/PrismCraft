import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { t } from "@/shared/constants";
import { getBeatCharacterIds } from "@/domain/utils";
import {
  recommendShotBySceneVariant,
  getRecommendationLabels,
  recommendationToShotInstruction,
  type ShotRecommendation,
} from "@/modules/shot";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { getModelCapabilities } from "@/shared/model-capabilities";
import type {
  StoryBeat,
  Character,
  Scene,
  StoryElement,
  BlockoutScene,
} from "@/domain/schemas";
import type { ExportedAsset } from "@/modules/blockout-3d";
import { BeatNavigation } from "./BeatNavigation";
import { BeatUploadPanel, type BeatUploadPanelHandle } from "./BeatUploadPanel";
import {
  BeatEditorTabBar,
  EditTabContent,
  Blockout3DTabPanel,
} from "./BeatDetailEditorParts";
import type { MinimalAsset } from "./types";

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
  onPromptChange?: (context: import("@/modules/storyboard/prompt-editor").PromptEditorContext, prompt: string) => void;
  imageProviderId?: string;
  imageModelId?: string;
}

// Task 2A.21：探测当前模型是否支持 3D 白模输入（Seedance 2.5 等）
function useModelSupports3D(imageModelId?: string): boolean {
  return useMemo(() => {
    if (!imageModelId) return false;
    try {
      const caps = getModelCapabilities(imageModelId);
      return caps?.supports3DPreview === true;
    } catch {
      return false;
    }
  }, [imageModelId]);
}

// Esc 键关闭编辑器（焦点在输入控件内时先 blur）
function useEscapeToClose(onClose: () => void) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
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
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
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
  const { error: showError, success: showSuccess } = useToastHelpers();
  const [refVideoExpanded, setRefVideoExpanded] = useState(false);
  // Task 2A.21：分镜编辑器 Tab 切换（编辑 / 3D 白模）
  const [activeTab, setActiveTab] = useState<"edit" | "blockout3d">("edit");

  const selectedScene = scenes.find((scene) => scene.id === beat.sceneId);
  const _prevBeat = index > 0 ? allShots[index - 1]! : null;
  void _prevBeat;

  const modelSupports3D = useModelSupports3D(imageModelId);

  // Task 2A.21：场景数据变更回调（持久化到 beat.blockout3D）
  const handleBlockoutSceneChange = useCallback((scene: BlockoutScene) => {
    onUpdateBeat({ ...beat, blockout3D: scene });
  }, [beat, onUpdateBeat]);

  // Task 2A.21：导出完成回调（暂仅 toast 提示，未来可持久化为 GenerationAsset）
  const handleBlockoutExportComplete = useCallback((asset: ExportedAsset) => {
    showSuccess(t("blockout.exportComplete", { type: asset.type }));
  }, [showSuccess]);

  // Task 2B.12：场景变体 → 镜头推荐
  // 仅当 beat 绑定了场景且场景含 mood 字段时计算推荐
  const shotRecommendation: ShotRecommendation | null = useMemo(() => {
    if (!selectedScene || !selectedScene.mood) return null;
    return recommendShotBySceneVariant({
      mood: selectedScene.mood,
      weather: selectedScene.weather,
      lighting: selectedScene.lighting,
    });
  }, [selectedScene]);

  const recommendationLabels = useMemo(() => {
    if (!shotRecommendation) return null;
    return getRecommendationLabels(shotRecommendation);
  }, [shotRecommendation]);

  // 应用推荐：将推荐结果写入 beat.shotInstruction
  const handleApplyRecommendation = useCallback(() => {
    if (!shotRecommendation) return;
    const newInstruction = recommendationToShotInstruction(shotRecommendation);
    onUpdateBeat({
      ...beat,
      shotInstruction: newInstruction,
    });
    showSuccess(t("beat.recommendationApplied"));
  }, [shotRecommendation, beat, onUpdateBeat, showSuccess]);

  useEscapeToClose(onClose);

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

  const handleRefVideoError = useCallback(
    (title: string, message: string) => showError(title, message),
    [showError],
  );

  const tabContent: ReactNode = activeTab === "edit" ? (
    <EditTabContent
      beat={beat}
      characters={characters}
      scenes={scenes}
      elements={elements}
      assets={assets}
      allShots={allShots}
      onUpdateBeat={onUpdateBeat}
      onPromptChange={onPromptChange}
      onGenerateKeyframe={onGenerateKeyframe}
      onGenerateFramePair={onGenerateFramePair}
      onGenerateVideoNew={onGenerateVideoNew}
      onRegenerateKeyframe={onRegenerateKeyframe}
      generatingKeyframe={generatingKeyframe}
      imageProviderId={imageProviderId}
      imageModelId={imageModelId}
      uploadPanelHandle={uploadPanelHandle}
      shotRecommendation={shotRecommendation}
      recommendationLabels={recommendationLabels}
      onApplyRecommendation={handleApplyRecommendation}
      consistencyCheck={consistencyCheck}
      boundCharacters={boundCharacters}
      boundElements={boundElements}
      selectedScene={selectedScene}
      refVideoExpanded={refVideoExpanded}
      onToggleRefVideoExpanded={() => setRefVideoExpanded((v) => !v)}
      onError={handleRefVideoError}
    />
  ) : (
    <Blockout3DTabPanel
      beat={beat}
      imageModelId={imageModelId}
      modelSupports3D={modelSupports3D}
      onSceneChange={handleBlockoutSceneChange}
      onExportComplete={handleBlockoutExportComplete}
    />
  );

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

      <BeatEditorTabBar
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        modelSupports3D={modelSupports3D}
      />

      {tabContent}

      {/* Hidden file inputs - rendered once and triggered via ref（始终挂载，不随 Tab 切换卸载） */}
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
