/**
 * Task 2A.21: Mannequin 人偶业务逻辑（姿势/身高预设库 + 工厂函数）
 *
 * 类型定义已迁移到 `@/domain/schemas/blockout-scene`（domain 层零依赖规则）。
 * 本文件保留姿势/身高预设库（含中文标签、几何系数等业务知识）和工厂函数。
 *
 * 设计原则：
 * - 关联 CharacterVariant ID — 复用现有角色绑定数据，不重新绑定
 * - 姿势预设化 — 站/坐/跑/跳等，避免用户手动调骨骼（"不会 Blender"的产品定位）
 * - 身高比例预设化 — 儿童/成人/巨人等，避免精确数值
 *
 * 人偶在场景中只是一个胶囊/方块/简化的灰色人形 placeholder，
 * 不需要骨骼动画 — 仅用于构图参考和空间关系表达。
 */

// 类型 re-export（透明转发到 domain 层）
export type {
  PosePreset,
  PoseMetadata,
  HeightPreset,
  HeightMetadata,
  Mannequin,
} from "@/domain/schemas/blockout-scene";

import type {
  PosePreset,
  PoseMetadata,
  HeightPreset,
  HeightMetadata,
  Mannequin,
} from "@/domain/schemas/blockout-scene";

// ─── 姿势预设库 ──────────────────────────────────────────────────────────────

export const POSE_PRESETS: Record<PosePreset, PoseMetadata> = {
  standing: { pose: "standing", label: "站立", silhouette: "upright", heightFactor: 1.0, widthFactor: 1.0 },
  sitting: { pose: "sitting", label: "坐姿", silhouette: "compact", heightFactor: 0.6, widthFactor: 1.1 },
  walking: { pose: "walking", label: "行走", silhouette: "upright", heightFactor: 1.0, widthFactor: 1.0 },
  running: { pose: "running", label: "奔跑", silhouette: "extended", heightFactor: 0.95, widthFactor: 1.2 },
  jumping: { pose: "jumping", label: "跳跃", silhouette: "extended", heightFactor: 1.1, widthFactor: 1.0 },
  crouching: { pose: "crouching", label: "蹲下", silhouette: "compact", heightFactor: 0.65, widthFactor: 1.0 },
  lying: { pose: "lying", label: "躺卧", silhouette: "low", heightFactor: 0.25, widthFactor: 2.4 },
  kneeling: { pose: "kneeling", label: "跪姿", silhouette: "compact", heightFactor: 0.75, widthFactor: 1.0 },
  waving: { pose: "waving", label: "招手", silhouette: "upright", heightFactor: 1.0, widthFactor: 1.1 },
  pointing: { pose: "pointing", label: "指向", silhouette: "extended", heightFactor: 1.0, widthFactor: 1.3 },
};

export const POSE_PRESET_LIST: PoseMetadata[] = Object.values(POSE_PRESETS);

// ─── 身高比例预设库 ───────────────────────────────────────────────────────────

export const HEIGHT_PRESETS: Record<HeightPreset, HeightMetadata> = {
  child: { preset: "child", label: "儿童", height: 1.2 },
  teen: { preset: "teen", label: "青少年", height: 1.55 },
  adult: { preset: "adult", label: "成人", height: 1.75 },
  tall_adult: { preset: "tall_adult", label: "高个成人", height: 1.9 },
  giant: { preset: "giant", label: "巨人", height: 2.3 },
};

export const HEIGHT_PRESET_LIST: HeightMetadata[] = Object.values(HEIGHT_PRESETS);

// ─── 默认值工厂 ─────────────────────────────────────────────────────────────

export function createDefaultMannequin(
  id: string,
  characterVariantId: string,
  displayName?: string,
): Mannequin {
  return {
    id,
    characterVariantId,
    displayName,
    position: { x: 0, z: 0 },
    rotation: 0,
    pose: "standing",
    height: "adult",
    visible: true,
  };
}

/** 计算人偶的实际高度（米） */
export function getMannequinHeight(mannequin: Mannequin): number {
  const heightMeta = HEIGHT_PRESETS[mannequin.height];
  const poseMeta = POSE_PRESETS[mannequin.pose];
  return heightMeta.height * poseMeta.heightFactor;
}

/** 计算人偶的实际宽度（米） */
export function getMannequinWidth(mannequin: Mannequin): number {
  // 假设成人肩宽 0.45 米
  const baseWidth = 0.45;
  const poseMeta = POSE_PRESETS[mannequin.pose];
  return baseWidth * poseMeta.widthFactor;
}
