import { Suspense, lazy } from "react";
import { User, Check, AlertTriangle, MapPin, Sparkles, Boxes, Loader2 } from "lucide-react";
import { t } from "@/shared/constants";
import { ShotReferenceConfig, ReferenceVideoUploader } from "@/modules/storyboard/generation";
import {
  ShotEditorLayout,
  PromptEditorColumn,
  ElementBindingColumn,
  PreviewColumn,
  type getRecommendationLabels,
  type ShotRecommendation,
} from "@/modules/shot";
import type {
  StoryBeat,
  Character,
  Scene,
  StoryElement,
  BlockoutScene,
} from "@/domain/schemas";
import type { ExportedAsset } from "@/modules/blockout-3d";
import type { PromptEditorContext } from "@/modules/storyboard/prompt-editor";
import { ElementBindingPanel } from "./ElementBindingPanel";
import { BeatPromptPanel } from "./BeatPromptPanel";
import { BeatGenerationPanel } from "./BeatGenerationPanel";
import type { BeatUploadPanelHandle } from "./BeatUploadPanel";
import type { MinimalAsset } from "./types";

// Task 2A.21：动态加载 Blockout3DPanel，避免 Three.js 进入首屏 bundle
const Blockout3DPanel = lazy(() =>
  import("@/modules/blockout-3d").then((m) => ({ default: m.Blockout3DPanel })),
);

export interface BeatEditorTabBarProps {
  activeTab: "edit" | "blockout3d";
  onChangeTab: (tab: "edit" | "blockout3d") => void;
  modelSupports3D: boolean;
}

export function BeatEditorTabBar({ activeTab, onChangeTab, modelSupports3D }: BeatEditorTabBarProps) {
  const tabBaseStyle: React.CSSProperties = {
    padding: "6px 12px",
    fontSize: 12,
    background: "transparent",
    border: "none",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  };
  return (
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
        onClick={() => onChangeTab("edit")}
        style={{
          ...tabBaseStyle,
          fontWeight: activeTab === "edit" ? 600 : 400,
          color: activeTab === "edit" ? "var(--primary)" : "var(--muted-fg)",
          borderBottom: activeTab === "edit" ? "2px solid var(--primary)" : "2px solid transparent",
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
        onClick={() => onChangeTab("blockout3d")}
        style={{
          ...tabBaseStyle,
          fontWeight: activeTab === "blockout3d" ? 600 : 400,
          color: activeTab === "blockout3d" ? "var(--primary)" : "var(--muted-fg)",
          borderBottom: activeTab === "blockout3d" ? "2px solid var(--primary)" : "2px solid transparent",
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
  );
}

export interface ShotRecommendationCardProps {
  shotRecommendation: ShotRecommendation | null;
  recommendationLabels: ReturnType<typeof getRecommendationLabels> | null;
  onApply: () => void;
}

export function ShotRecommendationCard({
  shotRecommendation,
  recommendationLabels,
  onApply,
}: ShotRecommendationCardProps) {
  return (
    <>
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
            onClick={onApply}
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
    </>
  );
}

export interface ConsistencyCheckCardProps {
  consistencyCheck: StoryBeat["consistencyCheck"];
  boundCharacters: Character[];
  selectedScene: Scene | undefined;
}

export function ConsistencyCheckCard({
  consistencyCheck,
  boundCharacters,
  selectedScene,
}: ConsistencyCheckCardProps) {
  const hasScores = !!consistencyCheck && consistencyCheck.characterScores.length > 0;
  return (
    <>
      <div className="section-label">
        <span className="dot ok"></span> {t("beat.consistencyCheck")}
      </div>
      <div className="card" style={{ padding: 10, fontSize: 12 }}>
        {hasScores ? (
          consistencyCheck!.characterScores.map((score) => {
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
    </>
  );
}

export interface ReferenceVideoTimelineProps {
  beat: StoryBeat;
  assets: MinimalAsset[];
  expanded: boolean;
  onToggleExpanded: () => void;
  onUpdateBeat: (updatedBeat: StoryBeat) => void;
  onError: (title: string, message: string) => void;
}

export function ReferenceVideoTimeline({
  beat,
  assets,
  expanded,
  onToggleExpanded,
  onUpdateBeat,
  onError,
}: ReferenceVideoTimelineProps) {
  const hasRefVideo = !!beat.referenceVideo?.enabled && !!beat.referenceVideo?.videoUrl;
  return (
    <div style={{ flexShrink: 0, borderTop: "1px solid var(--border)" }}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        style={{ width: "100%", justifyContent: "space-between", padding: "6px 12px", fontSize: 11 }}
        onClick={onToggleExpanded}
        aria-expanded={expanded}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10 }}>{expanded ? "▼" : "▶"}</span>
          <span style={{ fontWeight: 600, color: "var(--muted-fg)" }}>{t("beat.referenceVideo")}</span>
          {hasRefVideo && (
            <span className="badge badge-info" style={{ fontSize: 10, display: "inline-flex", alignItems: "center" }}><Check style={{ width: 10, height: 10, display: "inline", verticalAlign: "middle" }} aria-hidden="true" /></span>
          )}
        </span>
        <span style={{ fontSize: 10, color: "var(--muted-fg)" }}>
          {expanded ? t("common.collapse") : t("common.expand")}
        </span>
      </button>
      {expanded && (
        <div style={{ padding: "8px 12px 12px", maxHeight: 320, overflowY: "auto" }}>
          <ReferenceVideoUploader
            referenceVideo={beat.referenceVideo}
            assets={assets}
            onUpdate={(config) => onUpdateBeat({ ...beat, referenceVideo: config })}
            onError={(message) => onError(t("error.uploadFailed"), message)}
          />
        </div>
      )}
    </div>
  );
}

export interface Blockout3DTabPanelProps {
  beat: StoryBeat;
  imageModelId?: string;
  modelSupports3D: boolean;
  onSceneChange: (scene: BlockoutScene) => void;
  onExportComplete: (asset: ExportedAsset) => void;
}

export function Blockout3DTabPanel({
  beat,
  imageModelId,
  modelSupports3D,
  onSceneChange,
  onExportComplete,
}: Blockout3DTabPanelProps) {
  return (
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
          onSceneChange={onSceneChange}
          modelId={imageModelId}
          modelSupports3D={modelSupports3D}
          onExportComplete={onExportComplete}
        />
      </Suspense>
    </div>
  );
}

export interface EditTabContentProps {
  beat: StoryBeat;
  characters: Character[];
  scenes: Scene[];
  elements: StoryElement[];
  assets: MinimalAsset[];
  allShots: StoryBeat[];
  onUpdateBeat: (updatedBeat: StoryBeat) => void;
  onPromptChange?: (context: PromptEditorContext, prompt: string) => void;
  onGenerateKeyframe?: () => Promise<StoryBeat | void>;
  onGenerateFramePair?: () => Promise<StoryBeat | void>;
  onGenerateVideoNew?: () => Promise<StoryBeat | void>;
  onRegenerateKeyframe?: () => Promise<void>;
  generatingKeyframe?: boolean;
  imageProviderId?: string;
  imageModelId?: string;
  uploadPanelHandle: React.RefObject<BeatUploadPanelHandle | null>;
  shotRecommendation: ShotRecommendation | null;
  recommendationLabels: ReturnType<typeof getRecommendationLabels> | null;
  onApplyRecommendation: () => void;
  consistencyCheck: StoryBeat["consistencyCheck"];
  boundCharacters: Character[];
  boundElements: StoryElement[];
  selectedScene: Scene | undefined;
  refVideoExpanded: boolean;
  onToggleRefVideoExpanded: () => void;
  onError: (title: string, message: string) => void;
}

export function EditTabContent({
  beat,
  characters,
  scenes,
  elements,
  assets,
  allShots,
  onUpdateBeat,
  onPromptChange,
  onGenerateKeyframe,
  onGenerateFramePair,
  onGenerateVideoNew,
  onRegenerateKeyframe,
  generatingKeyframe,
  imageProviderId,
  imageModelId,
  uploadPanelHandle,
  shotRecommendation,
  recommendationLabels,
  onApplyRecommendation,
  consistencyCheck,
  boundCharacters,
  boundElements,
  selectedScene,
  refVideoExpanded,
  onToggleRefVideoExpanded,
  onError,
}: EditTabContentProps) {
  return (
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
            <ShotRecommendationCard
              shotRecommendation={shotRecommendation}
              recommendationLabels={recommendationLabels}
              onApply={onApplyRecommendation}
            />

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
            <ConsistencyCheckCard
              consistencyCheck={consistencyCheck}
              boundCharacters={boundCharacters}
              selectedScene={selectedScene}
            />
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
          <ReferenceVideoTimeline
            beat={beat}
            assets={assets}
            expanded={refVideoExpanded}
            onToggleExpanded={onToggleRefVideoExpanded}
            onUpdateBeat={onUpdateBeat}
            onError={onError}
          />
        }
      />
    </div>
  );
}
