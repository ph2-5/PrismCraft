/**
 * Task 2A.21: CameraPathEditor — 镜头轨迹编辑器
 *
 * 显示 BlockoutScene.cameraPath 关键帧序列，支持：
 * - 时间轴拖动（ scrub 播放时间）
 * - 添加关键帧（在当前时间插入）
 * - 删除关键帧
 * - 编辑关键帧位置/目标/插值类型/FOV
 * - 播放/暂停相机轨迹
 */

import { useState, useMemo } from "react";
import { Play, Pause, Plus, Trash2, Camera } from "lucide-react";
import { t } from "@/shared/constants";
import type { BlockoutScene } from "../domain/scene-schema";
import type { CameraKeyframe, CameraInterpolation } from "../domain/camera-path-types";
import { INTERPOLATION_TYPES } from "../domain/camera-path-types";
import { validateCameraPath } from "../domain/camera-path-types";

export interface CameraPathEditorProps {
  /** BlockoutScene 数据 */
  scene: BlockoutScene;
  /** 当前播放时间（秒） */
  playbackTime: number;
  /** 设置播放时间 */
  onPlaybackTimeChange: (time: number) => void;
  /** 是否正在播放 */
  isPlaying: boolean;
  /** 切换播放/暂停 */
  onTogglePlay: () => void;
  /** 更新关键帧列表 */
  onUpdateKeyframes: (keyframes: CameraKeyframe[]) => void;
  /** 选中关键帧索引 */
  selectedIndex?: number;
  /** 选中关键帧 */
  onSelectKeyframe?: (index: number) => void;
}

export function CameraPathEditor({
  scene,
  playbackTime,
  onPlaybackTimeChange,
  isPlaying,
  onTogglePlay,
  onUpdateKeyframes,
  selectedIndex,
  onSelectKeyframe,
}: CameraPathEditorProps) {
  const keyframes = scene.cameraPath ?? [];
  const duration = keyframes.length > 0 ? keyframes[keyframes.length - 1]!.time : 0;

  const validation = useMemo(() => {
    if (keyframes.length === 0) return null;
    return validateCameraPath({
      id: "tmp",
      name: "tmp",
      duration,
      keyframes,
    });
  }, [keyframes, duration]);

  const handleAddKeyframe = () => {
    const newKf: CameraKeyframe = {
      time: playbackTime,
      position: { ...scene.camera.position },
      target: { ...scene.camera.target },
      interpolation: "linear",
      fov: scene.camera.fov,
    };

    // 按时间升序插入
    const sorted = [...keyframes, newKf].sort((a, b) => a.time - b.time);
    onUpdateKeyframes(sorted);
  };

  const handleDeleteKeyframe = (index: number) => {
    if (keyframes.length <= 2) return;
    const filtered = keyframes.filter((_, i) => i !== index);
    onUpdateKeyframes(filtered);
  };

  const handleUpdateKeyframe = (index: number, updates: Partial<CameraKeyframe>) => {
    const updated = keyframes.map((kf, i) => (i === index ? { ...kf, ...updates } : kf));
    onUpdateKeyframes(updated);
  };

  return (
    <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
      <div className="section-label">
        <Camera style={{ width: 12, height: 12, display: "inline", verticalAlign: "middle", color: "var(--primary)" }} />
        <span style={{ marginLeft: 4 }}>{t("blockout.cameraPathTitle")}</span>
      </div>

      {/* 时间轴 */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button
          type="button"
          onClick={onTogglePlay}
          className="btn btn-ghost btn-sm"
          style={{ padding: "2px 6px", fontSize: 12 }}
          disabled={keyframes.length < 2}
          title={isPlaying ? t("blockout.pause") : t("blockout.play")}
        >
          {isPlaying ? <Pause size={12} /> : <Play size={12} />}
        </button>
        <input
          type="range"
          min={0}
          max={duration || 5}
          step={0.05}
          value={playbackTime}
          onChange={(e) => onPlaybackTimeChange(parseFloat(e.target.value))}
          style={{ flex: 1 }}
          disabled={keyframes.length < 2}
        />
        <span style={{ fontSize: 11, color: "var(--muted-fg)", minWidth: 60, textAlign: "right" }}>
          {playbackTime.toFixed(2)}s / {duration.toFixed(2)}s
        </span>
      </div>

      {/* 关键帧列表 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
          {t("blockout.keyframeCount", { count: keyframes.length })}
        </span>
        <button
          type="button"
          onClick={handleAddKeyframe}
          className="btn btn-ghost btn-sm"
          style={{ padding: "2px 6px", fontSize: 11 }}
          title={t("blockout.addKeyframe")}
        >
          <Plus size={11} /> {t("blockout.addKeyframe")}
        </button>
      </div>

      <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
        {keyframes.map((kf, i) => (
          <KeyframeRow
            key={i}
            index={i}
            keyframe={kf}
            isSelected={selectedIndex === i}
            onSelect={() => onSelectKeyframe?.(i)}
            onUpdate={(updates) => handleUpdateKeyframe(i, updates)}
            onDelete={() => handleDeleteKeyframe(i)}
            deleteDisabled={keyframes.length <= 2}
          />
        ))}
        {keyframes.length === 0 && (
          <div style={{ fontSize: 11, color: "var(--muted-fg)", textAlign: "center", padding: 12 }}>
            {t("blockout.noKeyframes")}
          </div>
        )}
      </div>

      {/* 校验错误 */}
      {validation && !validation.valid && (
        <div
          style={{
            padding: 8,
            background: "var(--danger-bg, rgba(255,0,0,0.1))",
            borderRadius: 4,
            fontSize: 11,
            color: "var(--danger)",
          }}
        >
          {validation.errors.map((err, i) => (
            <div key={i}>• {err}</div>
          ))}
        </div>
      )}
    </div>
  );
}

interface KeyframeRowProps {
  index: number;
  keyframe: CameraKeyframe;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<CameraKeyframe>) => void;
  onDelete: () => void;
  deleteDisabled?: boolean;
}

function KeyframeRow({ index, keyframe, isSelected, onSelect, onUpdate, onDelete, deleteDisabled }: KeyframeRowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      onClick={onSelect}
      style={{
        border: isSelected ? "1px solid var(--primary)" : "1px solid var(--border)",
        borderRadius: 4,
        padding: 4,
        background: isSelected ? "var(--muted)" : "var(--card)",
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 600, minWidth: 24 }}>#{index + 1}</span>
        <span style={{ fontSize: 11, flex: 1 }}>{keyframe.time.toFixed(2)}s</span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, padding: "1px 4px" }}
        >
          {expanded ? "▼" : "▶"}
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); if (!deleteDisabled) onDelete(); }}
          style={{ background: "none", border: "none", cursor: deleteDisabled ? "not-allowed" : "pointer", padding: 2, color: "var(--danger)", opacity: deleteDisabled ? 0.4 : 1 }}
          title={deleteDisabled ? t("blockout.minKeyframesWarning") : t("common.delete")}
          disabled={deleteDisabled}
        >
          <Trash2 size={11} />
        </button>
      </div>

      {expanded && (
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4, paddingLeft: 4 }}>
          <Field label={t("blockout.kfTime")}>
            <input
              type="number"
              min={0}
              max={30}
              step={0.1}
              value={keyframe.time}
              onChange={(e) => onUpdate({ time: parseFloat(e.target.value) })}
              style={{ width: "100%", fontSize: 11, padding: "2px 4px" }}
            />
          </Field>

          <Field label={t("blockout.kfPosition")}>
            <div style={{ display: "flex", gap: 4 }}>
              <NumberInput value={keyframe.position.x} onChange={(v) => onUpdate({ position: { ...keyframe.position, x: v } })} label="X" />
              <NumberInput value={keyframe.position.y} onChange={(v) => onUpdate({ position: { ...keyframe.position, y: v } })} label="Y" />
              <NumberInput value={keyframe.position.z} onChange={(v) => onUpdate({ position: { ...keyframe.position, z: v } })} label="Z" />
            </div>
          </Field>

          <Field label={t("blockout.kfTarget")}>
            <div style={{ display: "flex", gap: 4 }}>
              <NumberInput value={keyframe.target.x} onChange={(v) => onUpdate({ target: { ...keyframe.target, x: v } })} label="X" />
              <NumberInput value={keyframe.target.y} onChange={(v) => onUpdate({ target: { ...keyframe.target, y: v } })} label="Y" />
              <NumberInput value={keyframe.target.z} onChange={(v) => onUpdate({ target: { ...keyframe.target, z: v } })} label="Z" />
            </div>
          </Field>

          <Field label={t("blockout.kfInterpolation")}>
            <select
              value={keyframe.interpolation}
              onChange={(e) => onUpdate({ interpolation: e.target.value as CameraInterpolation })}
              style={{ width: "100%", fontSize: 11, padding: "2px 4px" }}
            >
              {INTERPOLATION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t("blockout.kfFov")}>
            <input
              type="number"
              min={10}
              max={120}
              step={1}
              value={keyframe.fov ?? 50}
              onChange={(e) => onUpdate({ fov: parseFloat(e.target.value) })}
              style={{ width: "100%", fontSize: 11, padding: "2px 4px" }}
            />
          </Field>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <label style={{ fontSize: 10, color: "var(--muted-fg)" }}>{label}</label>
      {children}
    </div>
  );
}

function NumberInput({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 2 }}>
      <span style={{ fontSize: 10, color: "var(--muted-fg)" }}>{label}:</span>
      <input
        type="number"
        step={0.1}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        style={{ flex: 1, fontSize: 11, padding: "2px 4px", minWidth: 0 }}
      />
    </div>
  );
}
