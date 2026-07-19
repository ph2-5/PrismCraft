/**
 * Task 2A.21: PresetSelector — 预设场景选择器
 *
 * 显示 7 种预设场景（空房间/街角/办公室/公园/电影特写/远景/摄影棚）。
 * 用户点击预设后，调用 onCreateScene 创建场景。
 */

import { useState } from "react";
import { Boxes } from "lucide-react";
import { t } from "@/shared/constants";
import {
  SCENE_PRESET_LIST,
  createSceneFromPreset,
  type ScenePresetId,
  type ScenePreset,
} from "../domain/preset-library";
import type { BlockoutScene } from "../domain/scene-schema";

export interface PresetSelectorProps {
  /** 创建场景回调 */
  onCreateScene: (scene: BlockoutScene) => void;
  /** 关闭选择器回调 */
  onClose?: () => void;
}

export function PresetSelector({ onCreateScene, onClose }: PresetSelectorProps) {
  const [selectedPreset, setSelectedPreset] = useState<ScenePresetId | null>(null);

  const handleCreate = () => {
    if (!selectedPreset) return;
    const sceneId = `blockout-${Date.now()}`;
    const scene = createSceneFromPreset(selectedPreset, sceneId);
    if (scene) {
      onCreateScene(scene);
      onClose?.();
    }
  };

  return (
    <div className="flex flex-col gap-2 p-2" style={{ fontSize: 12 }}>
      <div className="section-label">
        <Boxes style={{ width: 12, height: 12, display: "inline", verticalAlign: "middle", color: "var(--primary)" }} />
        <span style={{ marginLeft: 4 }}>{t("blockout.presetTitle")}</span>
      </div>

      <div className="text-[11px]" style={{ color: "var(--muted-fg)", marginBottom: 4 }}>
        {t("blockout.presetHint")}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 6,
          maxHeight: 280,
          overflowY: "auto",
        }}
      >
        {SCENE_PRESET_LIST.map((preset) => (
          <PresetCard
            key={preset.id}
            preset={preset}
            isSelected={selectedPreset === preset.id}
            onSelect={() => setSelectedPreset(preset.id)}
          />
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!selectedPreset}
          onClick={handleCreate}
          style={{ flex: 1, fontSize: 12 }}
        >
          {t("blockout.createScene")}
        </button>
        {onClose && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            style={{ fontSize: 12 }}
          >
            {t("common.cancel")}
          </button>
        )}
      </div>
    </div>
  );
}

interface PresetCardProps {
  preset: ScenePreset;
  isSelected: boolean;
  onSelect: () => void;
}

function PresetCard({ preset, isSelected, onSelect }: PresetCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="card"
      style={{
        padding: 10,
        cursor: "pointer",
        border: isSelected ? "2px solid var(--primary)" : "1px solid var(--border)",
        background: isSelected ? "var(--muted)" : "var(--card)",
        textAlign: "left",
        transition: "all 0.15s",
      }}
    >
      <div style={{ fontSize: 24, marginBottom: 4 }}>{preset.icon}</div>
      <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 2 }}>{preset.label}</div>
      <div style={{ fontSize: 10, color: "var(--muted-fg)", lineHeight: 1.3 }}>
        {preset.description}
      </div>
    </button>
  );
}
