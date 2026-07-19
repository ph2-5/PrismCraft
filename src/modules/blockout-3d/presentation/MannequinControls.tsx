/**
 * Task 2A.21: MannequinControls — 人偶摆位控件
 *
 * 当用户在场景大纲或 3D 视图中选中一个人偶时，显示此控件：
 * - 位置（X/Z 滑块）
 * - 朝向（旋转角度）
 * - 姿势（10 种预设下拉）
 * - 身高（5 种预设下拉）
 * - 角色变体 ID（只读）
 * - 显示名（可编辑）
 */

import { User } from "lucide-react";
import { t } from "@/shared/constants";
import type { Mannequin, PosePreset, HeightPreset } from "../domain/mannequin-types";
import { POSE_PRESET_LIST, HEIGHT_PRESET_LIST } from "../domain/mannequin-types";

export interface MannequinControlsProps {
  /** 当前选中的人偶（未选中时为 undefined） */
  mannequin?: Mannequin;
  /** 更新人偶属性 */
  onUpdate: (id: string, updates: Partial<Omit<Mannequin, "id">>) => void;
}

export function MannequinControls({ mannequin, onUpdate }: MannequinControlsProps) {
  if (!mannequin) {
    return (
      <div style={{ padding: 12, fontSize: 12, color: "var(--muted-fg)", textAlign: "center" }}>
        {t("blockout.selectMannequinHint")}
      </div>
    );
  }

  return (
    <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
      <div className="section-label">
        <User style={{ width: 12, height: 12, display: "inline", verticalAlign: "middle", color: "var(--primary)" }} />
        <span style={{ marginLeft: 4 }}>{t("blockout.mannequinProps")}</span>
      </div>

      {/* 显示名 */}
      <Field label={t("blockout.displayName")}>
        <input
          type="text"
          value={mannequin.displayName ?? ""}
          placeholder={mannequin.characterVariantId}
          onChange={(e) => onUpdate(mannequin.id, { displayName: e.target.value })}
          className="input input-sm"
          style={{ width: "100%", fontSize: 12 }}
        />
      </Field>

      {/* 位置 X */}
      <Field label={`${t("blockout.positionX")}（${mannequin.position.x.toFixed(2)}m）`}>
        <input
          type="range"
          min={-20}
          max={20}
          step={0.1}
          value={mannequin.position.x}
          onChange={(e) => onUpdate(mannequin.id, { position: { ...mannequin.position, x: parseFloat(e.target.value) } })}
          style={{ width: "100%" }}
        />
      </Field>

      {/* 位置 Z */}
      <Field label={`${t("blockout.positionZ")}（${mannequin.position.z.toFixed(2)}m）`}>
        <input
          type="range"
          min={-20}
          max={20}
          step={0.1}
          value={mannequin.position.z}
          onChange={(e) => onUpdate(mannequin.id, { position: { ...mannequin.position, z: parseFloat(e.target.value) } })}
          style={{ width: "100%" }}
        />
      </Field>

      {/* 朝向 */}
      <Field label={`${t("blockout.rotation")}（${mannequin.rotation.toFixed(0)}°）`}>
        <input
          type="range"
          min={0}
          max={360}
          step={1}
          value={mannequin.rotation}
          onChange={(e) => onUpdate(mannequin.id, { rotation: parseFloat(e.target.value) })}
          style={{ width: "100%" }}
        />
      </Field>

      {/* 姿势 */}
      <Field label={t("blockout.pose")}>
        <select
          value={mannequin.pose}
          onChange={(e) => onUpdate(mannequin.id, { pose: e.target.value as PosePreset })}
          className="select select-sm"
          style={{ width: "100%", fontSize: 12 }}
        >
          {POSE_PRESET_LIST.map((p) => (
            <option key={p.pose} value={p.pose}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>

      {/* 身高 */}
      <Field label={t("blockout.height")}>
        <select
          value={mannequin.height}
          onChange={(e) => onUpdate(mannequin.id, { height: e.target.value as HeightPreset })}
          className="select select-sm"
          style={{ width: "100%", fontSize: 12 }}
        >
          {HEIGHT_PRESET_LIST.map((h) => (
            <option key={h.preset} value={h.preset}>
              {h.label}（{h.height}m）
            </option>
          ))}
        </select>
      </Field>

      {/* 角色变体 ID（只读） */}
      <Field label={t("blockout.characterVariantId")}>
        <div
          style={{
            padding: "4px 6px",
            background: "var(--muted)",
            borderRadius: 4,
            fontSize: 11,
            color: "var(--muted-fg)",
            fontFamily: "monospace",
            wordBreak: "break-all",
          }}
        >
          {mannequin.characterVariantId}
        </div>
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 11, color: "var(--muted-fg)", fontWeight: 500 }}>{label}</label>
      {children}
    </div>
  );
}
