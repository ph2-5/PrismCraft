import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { User, Check, AlertTriangle, MapPin, Sparkles, Boxes, Loader2 } from "lucide-react";
import { t } from "@/shared/constants";
import { getBeatCharacterIds } from "@/domain/utils";
import { ShotReferenceConfig, ReferenceVideoUploader } from "@/modules/storyboard/generation";
import {
  ShotEditorLayout,
  PromptEditorColumn,
  ElementBindingColumn,
  PreviewColumn,
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
} from "@/domain/schemas";
import { ElementBindingPanel } from "./ElementBindingPanel";
import { BeatNavigation } from "./BeatNavigation";
import { BeatPromptPanel } from "./BeatPromptPanel";
import { BeatGenerationPanel } from "./BeatGenerationPanel";
import { BeatUploadPanel, type BeatUploadPanelHandle } from "./BeatUploadPanel";

// Task 2A.21：动态加载 Blockout3DPanel，避免 Three.js 进入首屏 bundle
const Blockout3DPanel = lazy(() =>
  import("@/modules/blockout-3d").then((m) => ({ default: m.Blockout3DPanel })),
);

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
  onPromptChange?: (context: import("@/modules/storyboard/prompt-editor").PromptEditorContext, prompt: string) => void;
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
  const uploadPanelHandle = useRef<BeatUploadPanelHandle>(null);
  const { error: showError, success: showSuccess } = useToastHelpers();
  const [refVideoExpanded, setRefVideoExpanded] = useState(false);
  // Task 2A.21：分镜编辑器 Tab 切换（编辑 / 3D 白模）
  const [activeTab, setActiveTab] = useState<"edit" | "blockout3d">("edit");

  const selectedScene = scenes.find((scene) => scene.id === beat.sceneId);
  const _prevBeat = index > 0 ? allShots[index - 1]! : null;
  void _prevBeat;

  // Task 2A.21：探测当前模型是否支持 3D 白模输入（Seedance 2.5 等）
  const modelSupports3D = useMemo(() => {
    if (!imageModelId) return false;
    try {
      const caps = getModelCapabilities(imageModelId);
      return caps?.supports3DPreview === true;
    } catch {
      return false;
    }
  }, [imageModelId]);

  // Task 2A.21：场景数据变更回调（持久化到 beat.blockout3D）
  const handleBlockoutSceneChange = useCallback((scene: import("@/domain/schemas").BlockoutScene) => {
    onUpdateBeat({ ...beat, blockout3D: scene });
  }, [beat, onUpdateBeat]);

  // Task 2A.21：导出完成回调（暂仅 toast 提示，未来可持久化为 GenerationAsset）
  const handleBlockoutExportComplete = useCallback((asset: import("@/modules/blockout-3d").ExportedAsset) => {
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
  const handleApplyRecommendation = () => {
    if (!shotRecommendation) return;
    const newInstruction = recommendationToShotInstruction(shotRecommendation);
    onUpdateBeat({
      ...beat,
      shotInstruction: newInstruction,
    });
    showSuccess(t("beat.recommendationApplied"));
  };

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

      {/* Task 2A.21：编辑器视图切换 Tab（编辑 / 3D 白模） */}
      <div
        role="tablist"
        aria-label={t("beat.editorViewMode")}
        style={{
          display: "flex",
          gap: 0,
          padding: "0 12px",
          borderBottom: "1px solid var(--border)",
          background: "var(--muted)",
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "edit"}
          aria-controls="beat-edit-tabpanel"
          id="beat-edit-tab"
          onClick={() => setActiveTab("edit")}
          style={{
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: activeTab === "edit" ? 600 : 400,
            color: activeTab === "edit" ? "var(--primary)" : "var(--muted-fg)",
            borderBottom: activeTab === "edit" ? "2px solid var(--primary)" : "2px solid transparent",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Sparkles size={12} aria-hidden="true" />
          {t("beat.tabEdit")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "blockout3d"}
          aria-controls="beat-blockout3d-tabpanel"
          id="beat-blockout3d-tab"
          onClick={() => setActiveTab("blockout3d")}
          style={{
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: activeTab === "blockout3d" ? 600 : 400,
            color: activeTab === "blockout3d" ? "var(--primary)" : "var(--muted-fg)",
            borderBottom: activeTab === "blockout3d" ? "2px solid var(--primary)" : "2px solid transparent",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Boxes size={12} aria-hidden="true" />
          {t("beat.tabBlockout3D")}
          {modelSupports3D && (
            <span
              className="badge badge-info"
              style={{ fontSize: 9, padding: "1px 4px", marginLeft: 2 }}
              title={t("beat.blockout3DSupportedHint")}
            >
              {t("beat.blockout3DSupported")}
            </span>
          )}
        </button>
      </div>

      {/* Tab 内容 */}
      {activeTab === "edit" ? (
        <div
          id="beat-edit-tabpanel"
          role="tabpanel"
          aria-labelledby="beat-edit-tab"
          className="flex-1 min-h-0 flex flex-col"
        >

      {/* Three-column editor（Task 2B.11：使用 ShotEditorLayout 语义化布局） */}
      <ShotEditorLayout
        header={null}
        promptColumn={
          <PromptEditorColumn>
            <BeatPromptPanel
              beat={beat}
              characters={characters}
              scenes={scenes}
              elements={elements}
              allShots={allShots}
              onUpdateBeat={onUpdateBeat}
              onPromptChange={onPromptChange}
              onGenerateKeyframe={onGenerateKeyframe}
              onGenerateFramePair={onGenerateFramePair}
              onGenerateVideoNew={onGenerateVideoNew}
              generatingKeyframe={generatingKeyframe}
              imageProviderId={imageProviderId}
              imageModelId={imageModelId}
            />
          </PromptEditorColumn>
        }
        elementBindingColumn={
          <ElementBindingColumn
            badge={
              <span className="badge badge-info">
                {t("beat.boundCount", { count: boundElements.length })}
              </span>
            }
          >
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

            {/* Task 2B.12：场景变体 → 镜头推荐 */}
            <div className="section-label">
              <Sparkles style={{ width: 12, height: 12, display: "inline", verticalAlign: "middle", color: "var(--primary)" }} />
              <span style={{ marginLeft: 4 }}>{t("beat.shotRecommendation")}</span>
            </div>
            {shotRecommendation && recommendationLabels ? (
              <div className="card" style={{ padding: 10, fontSize: 12 }}>
                <div style={{ marginBottom: 8, color: "var(--muted-fg)", fontSize: 11 }}>
                  {t("beat.shotRecommendationHint")}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--muted-fg)" }}>{t("beat.recommendedShot")}</span>
                    <span style={{ fontWeight: 500 }}>{recommendationLabels.shotSizeLabel}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--muted-fg)" }}>{t("beat.recommendedMovement")}</span>
                    <span style={{ fontWeight: 500 }}>{recommendationLabels.cameraMovementLabel}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--muted-fg)" }}>{t("beat.recommendedAngle")}</span>
                    <span style={{ fontWeight: 500 }}>{recommendationLabels.cameraAngleLabel}</span>
                  </div>
                </div>
                {shotRecommendation.rationale && (
                  <div style={{
                    marginBottom: 8,
                    padding: "6px 8px",
                    background: "var(--muted)",
                    borderRadius: 4,
                    fontSize: 11,
                    color: "var(--muted-fg)",
                    lineHeight: 1.5,
                  }}>
                    <span style={{ fontWeight: 600 }}>{t("beat.recommendationRationale")}：</span>
                    {shotRecommendation.rationale}
                  </div>
                )}
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ width: "100%", fontSize: 11 }}
                  onClick={handleApplyRecommendation}
                >
                  <Check style={{ width: 12, height: 12, display: "inline", verticalAlign: "middle" }} />
                  <span style={{ marginLeft: 4 }}>{t("beat.applyRecommendation")}</span>
                </button>
              </div>
            ) : (
              <div className="card" style={{ padding: 10, fontSize: 12, color: "var(--muted-fg)", textAlign: "center" }}>
                {t("beat.noSceneForRecommendation")}
              </div>
            )}

            {/* Divider */}
            <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }}></div>

            {/* Shot reference config - moved from bottom panel to column 2 */}
            <div className="section-label">
              <span className="dot ok"></span> {t("beat.shotReference")}
            </div>
            <ShotReferenceConfig
              beat={beat}
              allShots={allShots}
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
                        <span><User style={{ width: 12, height: 12, display: "inline", verticalAlign: "middle" }} /> {score.elementName}</span>
                        <span style={{ color: isPass ? "var(--success)" : "var(--warning)" }}>
                          {isPass ? <Check style={{ width: 12, height: 12, display: "inline", verticalAlign: "middle" }} /> : <AlertTriangle style={{ width: 12, height: 12, display: "inline", verticalAlign: "middle" }} />} {(score.score * 100).toFixed(0)}%
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
                      <span><User style={{ width: 12, height: 12, display: "inline", verticalAlign: "middle" }} /> {char.name}</span>
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
                    <span><MapPin style={{ width: 12, height: 12, display: "inline", verticalAlign: "middle" }} /> {selectedScene.name}</span>
                    <span style={{ color: "var(--success)" }}>
                      {consistencyCheck ? <Check style={{ width: 12, height: 12, display: "inline", verticalAlign: "middle" }} /> : "—"}
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
          </ElementBindingColumn>
        }
        previewColumn={
          <PreviewColumn>
            <BeatGenerationPanel
              beat={beat}
              onGenerateKeyframe={onGenerateKeyframe}
              onGenerateFramePair={onGenerateFramePair}
              onGenerateVideoNew={onGenerateVideoNew}
              onRegenerateKeyframe={onRegenerateKeyframe}
              generatingKeyframe={generatingKeyframe}
              imageModelId={imageModelId}
              uploadPanelHandle={uploadPanelHandle}
            />
          </PreviewColumn>
        }
        timeline={
          <>
            {/* Collapsible reference video panel - default collapsed to avoid squeezing editor */}
            <div style={{ flexShrink: 0, borderTop: "1px solid var(--border)" }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ width: "100%", justifyContent: "space-between", padding: "6px 12px", fontSize: 11 }}
                onClick={() => setRefVideoExpanded((v) => !v)}
                aria-expanded={refVideoExpanded}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 10 }}>{refVideoExpanded ? "▼" : "▶"}</span>
                  <span style={{ fontWeight: 600, color: "var(--muted-fg)" }}>{t("beat.referenceVideo")}</span>
                  {beat.referenceVideo?.enabled && beat.referenceVideo?.videoUrl && (
                    <span className="badge badge-info" style={{ fontSize: 10, display: "inline-flex", alignItems: "center" }}><Check style={{ width: 10, height: 10, display: "inline", verticalAlign: "middle" }} aria-hidden="true" /></span>
                  )}
                </span>
                <span style={{ fontSize: 10, color: "var(--muted-fg)" }}>
                  {refVideoExpanded ? t("common.collapse") : t("common.expand")}
                </span>
              </button>
              {refVideoExpanded && (
                <div style={{ padding: "8px 12px 12px", maxHeight: 320, overflowY: "auto" }}>
                  <ReferenceVideoUploader
                    referenceVideo={beat.referenceVideo}
                    assets={assets}
                    onUpdate={(config) => onUpdateBeat({ ...beat, referenceVideo: config })}
                    onError={(message) => showError(t("error.uploadFailed"), message)}
                  />
                </div>
              )}
            </div>
          </>
        }
      />

        </div>
      ) : (
        <div
          id="beat-blockout3d-tabpanel"
          role="tabpanel"
          aria-labelledby="beat-blockout3d-tab"
          className="flex-1 min-h-0"
        >
          <Suspense
            fallback={
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                  color: "var(--muted-fg)",
                  fontSize: 12,
                }}
              >
                <Loader2 size={32} className="animate-spin" aria-hidden="true" />
                <span>{t("blockout.loading")}</span>
              </div>
            }
          >
            <Blockout3DPanel
              scene={beat.blockout3D}
              onSceneChange={handleBlockoutSceneChange}
              modelId={imageModelId}
              modelSupports3D={modelSupports3D}
              onExportComplete={handleBlockoutExportComplete}
            />
          </Suspense>
        </div>
      )}

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
