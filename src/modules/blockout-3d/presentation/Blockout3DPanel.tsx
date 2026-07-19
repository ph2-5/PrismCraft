/**
 * Task 2A.21: Blockout3DPanel — 3D 白模编辑器主面板
 *
 * 顶层容器组件，组合 7 个子组件：
 * - Blockout3DCanvas（3D 渲染画布）
 * - SceneOutliner（场景大纲）
 * - PresetSelector（预设选择器，初次进入时显示）
 * - MannequinControls（人偶摆位控件）
 * - CameraPathEditor（镜头轨迹编辑器）
 * - ExportPanel（导出面板）
 *
 * 布局：
 *   ┌────────────────────────────┬────────────────────┐
 *   │                            │  [Tab: Outline]    │
 *   │      Blockout3DCanvas      │  [Tab: Mannequin]  │
 *   │      （3D 视图）            │  [Tab: Camera]     │
 *   │                            │  [Tab: Export]     │
 *   │   [底部：时间轴/快捷操作]    │                    │
 *   └────────────────────────────┴────────────────────┘
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { Boxes, User, Camera, Download, Plus } from "lucide-react";
import { t } from "@/shared/constants";
import type { BlockoutScene } from "../domain/scene-schema";
import type { CameraKeyframe } from "../domain/camera-path-types";
import type { Mannequin } from "../domain/mannequin-types";
import { createEmptyScene } from "../domain/scene-schema";
import { computeSceneStats } from "../services/scene-builder";
import { Blockout3DCanvas } from "./Blockout3DCanvas";
import { SceneOutliner } from "./SceneOutliner";
import { PresetSelector } from "./PresetSelector";
import { MannequinControls } from "./MannequinControls";
import { CameraPathEditor } from "./CameraPathEditor";
import { ExportPanel, type ExportedAsset } from "./ExportPanel";

// ─── 公共类型 ─────────────────────────────────────────────────────────────────

export interface Blockout3DPanelProps {
  /** 当前场景数据（未创建时为 undefined，显示预设选择器） */
  scene?: BlockoutScene;
  /** 场景变更回调 */
  onSceneChange: (scene: BlockoutScene) => void;
  /** 当前选择的 AI 模型 ID（用于决定 Seedance 2.5 vs fallback） */
  modelId?: string;
  /** 模型是否支持 3D 白模输入 */
  modelSupports3D?: boolean;
  /** 导出完成回调（用于持久化 GenerationAsset） */
  onExportComplete?: (asset: ExportedAsset) => void;
}

type SidePanelTab = "outline" | "mannequin" | "camera" | "export";

// ─── 主组件 ───────────────────────────────────────────────────────────────────

export function Blockout3DPanel({
  scene,
  onSceneChange,
  modelId,
  modelSupports3D,
  onExportComplete,
}: Blockout3DPanelProps) {
  const [selectedMannequinId, setSelectedMannequinId] = useState<string | undefined>();
  const [selectedPropId, setSelectedPropId] = useState<string | undefined>();
  const [selectedKeyframeIndex, setSelectedKeyframeIndex] = useState<number | undefined>();
  const [sidePanelTab, setSidePanelTab] = useState<SidePanelTab>("outline");
  const [playbackTime, setPlaybackTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPresetSelector, setShowPresetSelector] = useState(false);

  // 无场景时显示预设选择器
  useEffect(() => {
    if (!scene) {
      setShowPresetSelector(true);
    } else {
      setShowPresetSelector(false);
    }
  }, [scene]);

  // 自动切换 tab：选中人偶时切到 mannequin
  useEffect(() => {
    if (selectedMannequinId) {
      setSidePanelTab("mannequin");
    }
  }, [selectedMannequinId]);

  // 播放：当 isPlaying 时根据 RAF 更新 playbackTime
  const duration = scene?.cameraPath && scene.cameraPath.length > 0
    ? scene.cameraPath[scene.cameraPath.length - 1]!.time
    : 0;

  useEffect(() => {
    if (!isPlaying || duration <= 0) return;
    let rafId: number;
    let lastTime = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      setPlaybackTime((prev) => {
        const next = prev + dt;
        if (next >= duration) {
          // 循环播放
          return 0;
        }
        return next;
      });
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, duration]);

  // ── 事件处理 ──

  const handleCreateScene = useCallback((newScene: BlockoutScene) => {
    onSceneChange(newScene);
    setShowPresetSelector(false);
    setPlaybackTime(0);
    setIsPlaying(false);
  }, [onSceneChange]);

  const handleCreateEmptyScene = useCallback(() => {
    const newScene = createEmptyScene(`blockout-${Date.now()}`, t("blockout.emptySceneName"));
    onSceneChange(newScene);
    setShowPresetSelector(false);
  }, [onSceneChange]);

  const handleUpdateScene = useCallback((updates: Partial<BlockoutScene>) => {
    if (!scene) return;
    onSceneChange({
      ...scene,
      ...updates,
      updatedAt: Date.now(),
    });
  }, [scene, onSceneChange]);

  // ── 人偶操作 ──

  const handleUpdateMannequin = useCallback((id: string, updates: Partial<Omit<Mannequin, "id">>) => {
    if (!scene) return;
    const characters = scene.characters.map((m) => (m.id === id ? { ...m, ...updates } : m));
    handleUpdateScene({ characters });
  }, [scene, handleUpdateScene]);

  const handleToggleMannequinVisibility = useCallback((id: string) => {
    if (!scene) return;
    const characters = scene.characters.map((m) =>
      m.id === id ? { ...m, visible: !(m.visible ?? true) } : m,
    );
    handleUpdateScene({ characters });
  }, [scene, handleUpdateScene]);

  const handleDeleteMannequin = useCallback((id: string) => {
    if (!scene) return;
    const characters = scene.characters.filter((m) => m.id !== id);
    handleUpdateScene({ characters });
    if (selectedMannequinId === id) setSelectedMannequinId(undefined);
  }, [scene, handleUpdateScene, selectedMannequinId]);

  // ── 道具操作 ──

  const handleTogglePropVisibility = useCallback((id: string) => {
    if (!scene) return;
    const props = scene.props.map((p) =>
      p.id === id ? { ...p, visible: !(p.visible ?? true) } : p,
    );
    handleUpdateScene({ props });
  }, [scene, handleUpdateScene]);

  const handleDeleteProp = useCallback((id: string) => {
    if (!scene) return;
    const props = scene.props.filter((p) => p.id !== id);
    handleUpdateScene({ props });
    if (selectedPropId === id) setSelectedPropId(undefined);
  }, [scene, handleUpdateScene, selectedPropId]);

  // ── 相机轨迹操作 ──

  const handleUpdateKeyframes = useCallback((keyframes: CameraKeyframe[]) => {
    handleUpdateScene({ cameraPath: keyframes });
  }, [handleUpdateScene]);

  const handleTogglePlay = useCallback(() => {
    setIsPlaying((p) => !p);
  }, []);

  // ── 渲染 ──

  const stats = useMemo(() => (scene ? computeSceneStats(scene) : null), [scene]);
  const selectedMannequin = scene?.characters.find((m) => m.id === selectedMannequinId);

  if (!scene || showPresetSelector) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: 12, gap: 8 }}>
        <PresetSelector
          onCreateScene={handleCreateScene}
          onClose={scene ? () => setShowPresetSelector(false) : undefined}
        />
        {!scene && (
          <button
            type="button"
            onClick={handleCreateEmptyScene}
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 12, marginTop: 8 }}
          >
            <Plus size={12} style={{ display: "inline", verticalAlign: "middle" }} />
            <span style={{ marginLeft: 4 }}>{t("blockout.createEmptyScene")}</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        gap: 4,
        background: "var(--background)",
      }}
    >
      {/* 左侧：3D 视图 */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          border: "1px solid var(--border)",
          borderRadius: 4,
          background: "var(--card)",
          overflow: "hidden",
        }}
      >
        {/* 顶部工具栏 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 8px",
            borderBottom: "1px solid var(--border)",
            background: "var(--muted)",
            fontSize: 11,
          }}
        >
          <Boxes size={12} style={{ color: "var(--primary)" }} />
          <span style={{ fontWeight: 600 }}>{scene.name}</span>
          <span style={{ color: "var(--muted-fg)" }}>·</span>
          <span style={{ color: "var(--muted-fg)" }}>
            {t("blockout.statsLabel", {
              props: stats?.visiblePropCount ?? 0,
              characters: stats?.visibleMannequinCount ?? 0,
              triangles: stats?.triangleCount ?? 0,
            })}
          </span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={() => setShowPresetSelector(true)}
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 11, padding: "1px 6px" }}
            title={t("blockout.switchPreset")}
          >
            <Plus size={10} /> {t("blockout.switchPreset")}
          </button>
        </div>

        {/* 3D Canvas */}
        <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
          <Blockout3DCanvas
            scene={scene}
            playbackTime={playbackTime}
            autoPlay={isPlaying}
            selectedMannequinId={selectedMannequinId}
            selectedPropId={selectedPropId}
            onMannequinClick={setSelectedMannequinId}
            onPropClick={setSelectedPropId}
          />
        </div>

        {/* 底部时间轴 */}
        {scene.cameraPath && scene.cameraPath.length > 0 && (
          <div
            style={{
              borderTop: "1px solid var(--border)",
              padding: "4px 8px",
              background: "var(--muted)",
              fontSize: 11,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                type="button"
                onClick={handleTogglePlay}
                className="btn btn-ghost btn-sm"
                style={{ padding: "1px 6px", fontSize: 11 }}
              >
                {isPlaying ? "⏸" : "▶"}
              </button>
              <input
                type="range"
                min={0}
                max={duration || 5}
                step={0.05}
                value={playbackTime}
                onChange={(e) => setPlaybackTime(parseFloat(e.target.value))}
                style={{ flex: 1 }}
              />
              <span style={{ color: "var(--muted-fg)", minWidth: 80, textAlign: "right" }}>
                {playbackTime.toFixed(2)}s / {duration.toFixed(2)}s
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 右侧：侧边面板（Tab 切换） */}
      <div
        style={{
          width: 280,
          display: "flex",
          flexDirection: "column",
          border: "1px solid var(--border)",
          borderRadius: 4,
          background: "var(--card)",
          overflow: "hidden",
        }}
      >
        {/* Tab 栏 */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--border)",
            background: "var(--muted)",
          }}
        >
          <TabButton
            icon={<Boxes size={11} />}
            label={t("blockout.tabOutline")}
            isActive={sidePanelTab === "outline"}
            onClick={() => setSidePanelTab("outline")}
          />
          <TabButton
            icon={<User size={11} />}
            label={t("blockout.tabMannequin")}
            isActive={sidePanelTab === "mannequin"}
            onClick={() => setSidePanelTab("mannequin")}
          />
          <TabButton
            icon={<Camera size={11} />}
            label={t("blockout.tabCamera")}
            isActive={sidePanelTab === "camera"}
            onClick={() => setSidePanelTab("camera")}
          />
          <TabButton
            icon={<Download size={11} />}
            label={t("blockout.tabExport")}
            isActive={sidePanelTab === "export"}
            onClick={() => setSidePanelTab("export")}
          />
        </div>

        {/* Tab 内容 */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {sidePanelTab === "outline" && (
            <SceneOutliner
              scene={scene}
              selectedMannequinId={selectedMannequinId}
              selectedPropId={selectedPropId}
              onSelectMannequin={setSelectedMannequinId}
              onSelectProp={setSelectedPropId}
              onToggleMannequinVisibility={handleToggleMannequinVisibility}
              onTogglePropVisibility={handleTogglePropVisibility}
              onDeleteMannequin={handleDeleteMannequin}
              onDeleteProp={handleDeleteProp}
            />
          )}
          {sidePanelTab === "mannequin" && (
            <MannequinControls
              mannequin={selectedMannequin}
              onUpdate={handleUpdateMannequin}
            />
          )}
          {sidePanelTab === "camera" && (
            <CameraPathEditor
              scene={scene}
              playbackTime={playbackTime}
              onPlaybackTimeChange={setPlaybackTime}
              isPlaying={isPlaying}
              onTogglePlay={handleTogglePlay}
              onUpdateKeyframes={handleUpdateKeyframes}
              selectedIndex={selectedKeyframeIndex}
              onSelectKeyframe={setSelectedKeyframeIndex}
            />
          )}
          {sidePanelTab === "export" && (
            <ExportPanel
              scene={scene}
              modelId={modelId}
              modelSupports3D={modelSupports3D}
              onExportComplete={onExportComplete}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tab 按钮 ─────────────────────────────────────────────────────────────────

interface TabButtonProps {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

function TabButton({ icon, label, isActive, onClick }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: "6px 4px",
        background: isActive ? "var(--card)" : "transparent",
        border: "none",
        borderBottom: isActive ? "2px solid var(--primary)" : "2px solid transparent",
        cursor: "pointer",
        fontSize: 11,
        fontWeight: isActive ? 600 : 400,
        color: isActive ? "var(--primary)" : "var(--muted-fg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
