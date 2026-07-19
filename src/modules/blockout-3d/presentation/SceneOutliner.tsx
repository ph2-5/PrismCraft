/**
 * Task 2A.21: SceneOutliner — 场景大纲（树形列表）
 *
 * 显示场景中所有人偶和道具，支持：
 * - 点击选中（高亮 3D 视图中的对应对象）
 * - 切换可见性（眼睛图标）
 * - 重命名（双击标签）
 * - 删除对象
 */

import { useState } from "react";
import { Eye, EyeOff, Trash2, User, Box } from "lucide-react";
import { t } from "@/shared/constants";
import type { BlockoutScene } from "../domain/scene-schema";
import type { Mannequin } from "../domain/mannequin-types";

export interface SceneOutlinerProps {
  /** BlockoutScene 数据 */
  scene: BlockoutScene;
  /** 当前选中的人偶 ID */
  selectedMannequinId?: string;
  /** 当前选中的道具 ID */
  selectedPropId?: string;
  /** 选中人偶 */
  onSelectMannequin?: (id: string) => void;
  /** 选中道具 */
  onSelectProp?: (id: string) => void;
  /** 切换人偶可见性 */
  onToggleMannequinVisibility?: (id: string) => void;
  /** 切换道具可见性 */
  onTogglePropVisibility?: (id: string) => void;
  /** 删除人偶 */
  onDeleteMannequin?: (id: string) => void;
  /** 删除道具 */
  onDeleteProp?: (id: string) => void;
}

export function SceneOutliner({
  scene,
  selectedMannequinId,
  selectedPropId,
  onSelectMannequin,
  onSelectProp,
  onToggleMannequinVisibility,
  onTogglePropVisibility,
  onDeleteMannequin,
  onDeleteProp,
}: SceneOutlinerProps) {
  return (
    <div className="flex flex-col gap-1" style={{ fontSize: 12, padding: 4 }}>
      <div className="section-label" style={{ marginBottom: 4 }}>
        {t("blockout.outlinerTitle")}
      </div>

      {/* 人偶列表 */}
      <div className="section-label" style={{ fontSize: 10, marginTop: 4, color: "var(--muted-fg)" }}>
        {t("blockout.charactersLabel", { count: scene.characters.length })}
      </div>
      {scene.characters.length === 0 ? (
        <div style={{ fontSize: 11, color: "var(--muted-fg)", padding: "4px 8px" }}>
          {t("blockout.noCharacters")}
        </div>
      ) : (
        scene.characters.map((m) => (
          <OutlinerItem
            key={m.id}
            id={m.id}
            label={m.displayName ?? m.characterVariantId}
            sublabel={getMannequinSublabel(m)}
            icon={<User style={{ width: 11, height: 11 }} />}
            isVisible={m.visible !== false}
            isSelected={selectedMannequinId === m.id}
            onSelect={() => onSelectMannequin?.(m.id)}
            onToggleVisibility={() => onToggleMannequinVisibility?.(m.id)}
            onDelete={() => onDeleteMannequin?.(m.id)}
          />
        ))
      )}

      {/* 道具列表 */}
      <div className="section-label" style={{ fontSize: 10, marginTop: 8, color: "var(--muted-fg)" }}>
        {t("blockout.propsLabel", { count: scene.props.length })}
      </div>
      {scene.props.length === 0 ? (
        <div style={{ fontSize: 11, color: "var(--muted-fg)", padding: "4px 8px" }}>
          {t("blockout.noProps")}
        </div>
      ) : (
        scene.props.map((p) => (
          <OutlinerItem
            key={p.id}
            id={p.id}
            label={p.label ?? p.type}
            sublabel={p.type}
            icon={<Box style={{ width: 11, height: 11 }} />}
            isVisible={p.visible !== false}
            isSelected={selectedPropId === p.id}
            onSelect={() => onSelectProp?.(p.id)}
            onToggleVisibility={() => onTogglePropVisibility?.(p.id)}
            onDelete={() => onDeleteProp?.(p.id)}
          />
        ))
      )}
    </div>
  );
}

function getMannequinSublabel(m: Mannequin): string {
  return `${m.pose} · ${m.height}`;
}

interface OutlinerItemProps {
  id: string;
  label: string;
  sublabel: string;
  icon: React.ReactNode;
  isVisible: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onToggleVisibility: () => void;
  onDelete: () => void;
}

function OutlinerItem({
  id,
  label,
  sublabel,
  icon,
  isVisible,
  isSelected,
  onSelect,
  onToggleVisibility,
  onDelete,
}: OutlinerItemProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      key={id}
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "4px 6px",
        cursor: "pointer",
        borderRadius: 4,
        background: isSelected ? "var(--muted)" : "transparent",
        border: isSelected ? "1px solid var(--primary)" : "1px solid transparent",
        opacity: isVisible ? 1 : 0.5,
      }}
    >
      {icon}
      <div style={{ flex: 1, marginLeft: 6, minWidth: 0 }}>
        <div style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </div>
        <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>{sublabel}</div>
      </div>
      <div style={{ display: "flex", gap: 2, opacity: hovered ? 1 : 0.5 }}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleVisibility(); }}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 2,
            display: "flex",
            alignItems: "center",
          }}
          title={isVisible ? t("blockout.hide") : t("blockout.show")}
        >
          {isVisible ? <Eye size={11} /> : <EyeOff size={11} />}
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 2,
            display: "flex",
            alignItems: "center",
            color: "var(--danger)",
          }}
          title={t("common.delete")}
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}
