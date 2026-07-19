/**
 * Task 2A.21: 人偶摆位 + 姿势应用（纯函数，无 Three.js 依赖）
 *
 * 操作 Mannequin 数据结构 — 添加/删除/更新位置/旋转/姿势/比例。
 * scene-builder 通过 POSE_PRESETS 计算实际几何体形状。
 *
 * 不依赖 Three.js — 纯数据操作，可单独测试。
 */

import type { Mannequin, PosePreset, HeightPreset } from "../domain/mannequin-types";
import {
  POSE_PRESETS,
  HEIGHT_PRESETS,
  createDefaultMannequin,
} from "../domain/mannequin-types";
import type { Vec2 } from "../domain/scene-schema";

// ─── 创建 ─────────────────────────────────────────────────────────────────────

export function createMannequin(
  id: string,
  characterVariantId: string,
  displayName?: string,
  position?: Vec2,
): Mannequin {
  const m = createDefaultMannequin(id, characterVariantId, displayName);
  if (position) m.position = position;
  return m;
}

// ─── 位置/旋转 ────────────────────────────────────────────────────────────────

export function moveMannequin(mannequin: Mannequin, position: Vec2): Mannequin {
  return { ...mannequin, position };
}

export function rotateMannequin(mannequin: Mannequin, rotation: number): Mannequin {
  // 归一化到 [0, 360)
  const normalized = ((rotation % 360) + 360) % 360;
  return { ...mannequin, rotation: normalized };
}

// ─── 姿势/身高 ────────────────────────────────────────────────────────────────

export function applyPose(mannequin: Mannequin, pose: PosePreset): Mannequin {
  return { ...mannequin, pose };
}

export function applyHeight(mannequin: Mannequin, height: HeightPreset): Mannequin {
  return { ...mannequin, height };
}

// ─── 可见性 ──────────────────────────────────────────────────────────────────

export function toggleVisibility(mannequin: Mannequin): Mannequin {
  return { ...mannequin, visible: !mannequin.visible };
}

// ─── 列表操作 ─────────────────────────────────────────────────────────────────

export function addMannequin(
  mannequins: Mannequin[],
  mannequin: Mannequin,
): Mannequin[] {
  return [...mannequins, mannequin];
}

export function removeMannequin(
  mannequins: Mannequin[],
  id: string,
): Mannequin[] {
  return mannequins.filter((m) => m.id !== id);
}

export function updateMannequin(
  mannequins: Mannequin[],
  id: string,
  updates: Partial<Omit<Mannequin, "id">>,
): Mannequin[] {
  return mannequins.map((m) => (m.id === id ? { ...m, ...updates } : m));
}

export function findMannequin(
  mannequins: Mannequin[],
  id: string,
): Mannequin | undefined {
  return mannequins.find((m) => m.id === id);
}

// ─── 查询 ─────────────────────────────────────────────────────────────────────

/** 查找场景中所有可见的人偶 */
export function getVisibleMannequins(mannequins: Mannequin[]): Mannequin[] {
  return mannequins.filter((m) => m.visible !== false);
}

/** 查找指定角色变体的所有人偶实例 */
export function getMannequinsByVariantId(
  mannequins: Mannequin[],
  characterVariantId: string,
): Mannequin[] {
  return mannequins.filter((m) => m.characterVariantId === characterVariantId);
}

// ─── 几何信息 ─────────────────────────────────────────────────────────────────

export interface MannequinGeometry {
  /** 中心点（地面位置 + y=高度/2） */
  center: { x: number; y: number; z: number };
  /** 高度（米） */
  height: number;
  /** 宽度（米） */
  width: number;
  /** 朝向角度（弧度，绕 Y 轴） */
  rotationRad: number;
}

/** 计算 Mannequin 的实际几何信息（用于 scene-builder 渲染） */
export function getMannequinGeometry(mannequin: Mannequin): MannequinGeometry {
  const poseMeta = POSE_PRESETS[mannequin.pose];
  const heightMeta = HEIGHT_PRESETS[mannequin.height];
  const height = heightMeta.height * poseMeta.heightFactor;
  const width = 0.45 * poseMeta.widthFactor;

  return {
    center: {
      x: mannequin.position.x,
      y: height / 2,
      z: mannequin.position.z,
    },
    height,
    width,
    rotationRad: (mannequin.rotation * Math.PI) / 180,
  };
}
