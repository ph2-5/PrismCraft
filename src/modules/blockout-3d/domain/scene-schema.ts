/**
 * Task 2A.21: BlockoutScene 工厂函数（业务逻辑层）
 *
 * 类型定义已迁移到 `@/domain/schemas/blockout-scene`（domain 层零依赖规则）。
 * 本文件保留工厂函数（含默认值业务知识），供模块内 services/presentation 使用。
 *
 * 设计原则：
 * - 类型纯化 — 类型定义在 domain 层，无运行时代码
 * - 工厂函数集中 — 默认值业务知识（场景尺寸/灯光参数/相机位姿）在模块层维护
 * - 不重复定义 — 通过 re-export 让模块内代码从本文件导入即可（无需关心类型实际位置）
 */

// 类型 re-export（透明转发到 domain 层）
export type {
  Vec3,
  Vec2,
  GroundType,
  GroundPlane,
  PrimitiveType,
  PrimitiveShape,
  LightingType,
  LightingPreset,
  ShotCamera,
  BlockoutScene,
} from "@/domain/schemas/blockout-scene";

import type {
  GroundPlane,
  LightingPreset,
  ShotCamera,
  BlockoutScene,
} from "@/domain/schemas/blockout-scene";

// ─── 默认值工厂 ─────────────────────────────────────────────────────────────

export function createDefaultGround(): GroundPlane {
  return {
    type: "grid",
    size: { width: 20, depth: 20 },
    color: "#3a3a3a",
    showGrid: true,
  };
}

export function createDefaultLighting(): LightingPreset {
  return {
    type: "daylight",
    sunAzimuth: 45,
    sunElevation: 60,
    intensity: 1.2,
    ambientIntensity: 0.4,
    sunColor: "#ffffff",
    ambientColor: "#b0c4de",
  };
}

export function createDefaultCamera(): ShotCamera {
  return {
    fov: 50,
    position: { x: 5, y: 3, z: 5 },
    target: { x: 0, y: 1, z: 0 },
    roll: 0,
  };
}

export function createEmptyScene(id: string, name: string): BlockoutScene {
  const now = Date.now();
  return {
    version: 1,
    id,
    name,
    ground: createDefaultGround(),
    props: [],
    characters: [],
    camera: createDefaultCamera(),
    lighting: createDefaultLighting(),
    createdAt: now,
    updatedAt: now,
  };
}
