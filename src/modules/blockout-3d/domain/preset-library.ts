/**
 * Task 2A.21: 预设场景 + 预设姿势库
 *
 * 产品定位（豆包深度分析）：
 *   "不会 Blender 的轻量白模编辑器" = 差异化窗口。
 *   UX：拖拽摆位 + 预设 + 一键生成白模视频。
 *
 * 5-10 个基础场景预设（房间/街道/办公室/室外等），开箱即用，不用从零搭建。
 * 用户加载预设后，可微调位置/朝向/姿势/比例。
 */

import type { BlockoutScene, GroundPlane, LightingPreset, PrimitiveShape, ShotCamera, Mannequin } from "@/domain/schemas/blockout-scene";

// ─── 预设场景标识 ─────────────────────────────────────────────────────────────

export type ScenePresetId =
  | "empty_room"
  | "street_corner"
  | "office"
  | "outdoor_park"
  | "cinematic_closeup"
  | "wide_landscape"
  | "indoor_studio";

export interface ScenePreset {
  id: ScenePresetId;
  /** 中文标签 */
  label: string;
  /** 中文描述 */
  description: string;
  /** 缩略图（emoji 或 icon name） */
  icon: string;
  /** 创建场景的工厂函数 */
  create: (sceneId: string, sceneName: string) => BlockoutScene;
}

// ─── 工具：构建预设 ──────────────────────────────────────────────────────────

interface PresetConfig {
  ground: GroundPlane;
  lighting: LightingPreset;
  camera: ShotCamera;
  props?: PrimitiveShape[];
  characters?: Mannequin[];
}

function buildPreset(
  sceneId: string,
  sceneName: string,
  config: PresetConfig,
): BlockoutScene {
  const now = Date.now();
  return {
    version: 1,
    id: sceneId,
    name: sceneName,
    ground: config.ground,
    props: config.props ?? [],
    characters: config.characters ?? [],
    camera: config.camera,
    lighting: config.lighting,
    createdAt: now,
    updatedAt: now,
  };
}

// ─── 预设场景定义 ────────────────────────────────────────────────────────────

const PRESETS: ScenePreset[] = [
  {
    id: "empty_room",
    label: "空房间",
    description: "10x10 米空房间，含地板和四面墙",
    icon: "🏠",
    create: (sceneId, sceneName) =>
      buildPreset(sceneId, sceneName, {
        ground: { type: "indoor_floor", size: { width: 10, depth: 10 }, color: "#a0a0a0", showGrid: false },
        lighting: { type: "indoor", intensity: 0.8, ambientIntensity: 0.5, sunColor: "#fff8e7" },
        camera: { fov: 50, position: { x: 6, y: 4, z: 6 }, target: { x: 0, y: 1, z: 0 } },
        props: [
          { id: "wall-north", type: "plane", position: { x: 0, y: 1.5, z: -5 }, rotationY: 0, scale: { x: 10, y: 3, z: 1 }, color: "#c0c0c0", label: "北墙" },
          { id: "wall-south", type: "plane", position: { x: 0, y: 1.5, z: 5 }, rotationY: 180, scale: { x: 10, y: 3, z: 1 }, color: "#c0c0c0", label: "南墙" },
          { id: "wall-east", type: "plane", position: { x: 5, y: 1.5, z: 0 }, rotationY: 270, scale: { x: 10, y: 3, z: 1 }, color: "#b0b0b0", label: "东墙" },
          { id: "wall-west", type: "plane", position: { x: -5, y: 1.5, z: 0 }, rotationY: 90, scale: { x: 10, y: 3, z: 1 }, color: "#b0b0b0", label: "西墙" },
        ],
      }),
  },
  {
    id: "street_corner",
    label: "街角",
    description: "20x20 米街角场景，含两栋建筑",
    icon: "🏢",
    create: (sceneId, sceneName) =>
      buildPreset(sceneId, sceneName, {
        ground: { type: "plane", size: { width: 20, depth: 20 }, color: "#444444", showGrid: false },
        lighting: { type: "sunset", sunAzimuth: 30, sunElevation: 20, intensity: 1.5, ambientIntensity: 0.3, sunColor: "#ff8c42" },
        camera: { fov: 35, position: { x: 8, y: 5, z: 8 }, target: { x: 0, y: 2, z: 0 } },
        props: [
          { id: "building-1", type: "box", position: { x: -6, y: 4, z: -3 }, rotationY: 0, scale: { x: 4, y: 8, z: 4 }, color: "#5a5a5a", label: "建筑1" },
          { id: "building-2", type: "box", position: { x: 5, y: 5, z: -5 }, rotationY: 0, scale: { x: 5, y: 10, z: 5 }, color: "#4a4a4a", label: "建筑2" },
          { id: "streetlight", type: "cylinder", position: { x: 3, y: 3, z: 3 }, rotationY: 0, scale: { x: 0.2, y: 6, z: 0.2 }, color: "#3a3a3a", label: "路灯" },
        ],
      }),
  },
  {
    id: "office",
    label: "办公室",
    description: "15x15 米办公室，含桌椅",
    icon: "💼",
    create: (sceneId, sceneName) =>
      buildPreset(sceneId, sceneName, {
        ground: { type: "indoor_floor", size: { width: 15, depth: 15 }, color: "#8a8a8a", showGrid: false },
        lighting: { type: "indoor", intensity: 1.0, ambientIntensity: 0.6, sunColor: "#ffffff" },
        camera: { fov: 50, position: { x: 5, y: 4, z: 5 }, target: { x: 0, y: 1, z: 0 } },
        props: [
          { id: "desk", type: "box", position: { x: 0, y: 0.75, z: 0 }, rotationY: 0, scale: { x: 2, y: 1.5, z: 1 }, color: "#6a5a4a", label: "桌子" },
          { id: "chair", type: "box", position: { x: 0, y: 0.4, z: 1.5 }, rotationY: 180, scale: { x: 0.6, y: 0.8, z: 0.6 }, color: "#3a3a3a", label: "椅子" },
          { id: "shelf", type: "box", position: { x: -5, y: 1.5, z: 0 }, rotationY: 90, scale: { x: 3, y: 3, z: 0.5 }, color: "#5a4a3a", label: "书架" },
        ],
      }),
  },
  {
    id: "outdoor_park",
    label: "公园",
    description: "30x30 米公园，含树木和长椅",
    icon: "🌳",
    create: (sceneId, sceneName) =>
      buildPreset(sceneId, sceneName, {
        ground: { type: "outdoor_terrain", size: { width: 30, depth: 30 }, color: "#3a5a3a", showGrid: false },
        lighting: { type: "daylight", sunAzimuth: 60, sunElevation: 70, intensity: 1.4, ambientIntensity: 0.4, sunColor: "#fff8dc" },
        camera: { fov: 35, position: { x: 10, y: 6, z: 10 }, target: { x: 0, y: 1, z: 0 } },
        props: [
          { id: "tree-1", type: "cylinder", position: { x: -5, y: 2, z: -3 }, rotationY: 0, scale: { x: 0.4, y: 4, z: 0.4 }, color: "#4a3a2a", label: "树干1" },
          { id: "tree-1-top", type: "sphere", position: { x: -5, y: 5, z: -3 }, rotationY: 0, scale: { x: 2, y: 2, z: 2 }, color: "#3a6a3a", label: "树冠1" },
          { id: "tree-2", type: "cylinder", position: { x: 4, y: 2.5, z: 2 }, rotationY: 0, scale: { x: 0.5, y: 5, z: 0.5 }, color: "#4a3a2a", label: "树干2" },
          { id: "tree-2-top", type: "sphere", position: { x: 4, y: 6, z: 2 }, rotationY: 0, scale: { x: 2.5, y: 2.5, z: 2.5 }, color: "#3a6a3a", label: "树冠2" },
          { id: "bench", type: "box", position: { x: 0, y: 0.4, z: 4 }, rotationY: 0, scale: { x: 2, y: 0.8, z: 0.6 }, color: "#5a4a3a", label: "长椅" },
        ],
      }),
  },
  {
    id: "cinematic_closeup",
    label: "电影特写",
    description: "10x10 米空场地 + 低角度特写相机",
    icon: "🎬",
    create: (sceneId, sceneName) =>
      buildPreset(sceneId, sceneName, {
        ground: { type: "grid", size: { width: 10, depth: 10 }, color: "#2a2a2a", showGrid: true },
        lighting: { type: "dramatic", sunAzimuth: 90, sunElevation: 30, intensity: 1.8, ambientIntensity: 0.15, sunColor: "#fff0a0", ambientColor: "#202040" },
        camera: { fov: 85, position: { x: 1.5, y: 1.2, z: 2 }, target: { x: 0, y: 1.5, z: 0 } },
      }),
  },
  {
    id: "wide_landscape",
    label: "远景",
    description: "50x50 米远景场地 + 高角度广角",
    icon: "🏔️",
    create: (sceneId, sceneName) =>
      buildPreset(sceneId, sceneName, {
        ground: { type: "outdoor_terrain", size: { width: 50, depth: 50 }, color: "#5a6a4a", showGrid: false },
        lighting: { type: "daylight", sunAzimuth: 45, sunElevation: 50, intensity: 1.3, ambientIntensity: 0.5, sunColor: "#ffffff" },
        camera: { fov: 24, position: { x: 15, y: 12, z: 15 }, target: { x: 0, y: 0, z: 0 } },
        props: [
          { id: "mountain-1", type: "cone", position: { x: -15, y: 5, z: -10 }, rotationY: 0, scale: { x: 10, y: 10, z: 10 }, color: "#6a5a4a", label: "山1" },
          { id: "mountain-2", type: "cone", position: { x: 12, y: 6, z: -12 }, rotationY: 0, scale: { x: 12, y: 12, z: 12 }, color: "#5a4a3a", label: "山2" },
        ],
      }),
  },
  {
    id: "indoor_studio",
    label: "摄影棚",
    description: "20x20 米摄影棚，含灯光架和背景布",
    icon: "🎥",
    create: (sceneId, sceneName) =>
      buildPreset(sceneId, sceneName, {
        ground: { type: "indoor_floor", size: { width: 20, depth: 20 }, color: "#3a3a3a", showGrid: false },
        lighting: { type: "soft", intensity: 1.0, ambientIntensity: 0.7, sunColor: "#ffffff", ambientColor: "#fff8e7" },
        camera: { fov: 50, position: { x: 6, y: 3, z: 6 }, target: { x: 0, y: 1.5, z: 0 } },
        props: [
          { id: "backdrop", type: "plane", position: { x: 0, y: 3, z: -8 }, rotationY: 0, scale: { x: 16, y: 6, z: 1 }, color: "#e0e0e0", label: "背景布" },
          { id: "light-stand-1", type: "cylinder", position: { x: -5, y: 3, z: 3 }, rotationY: 0, scale: { x: 0.15, y: 6, z: 0.15 }, color: "#2a2a2a", label: "灯架1" },
          { id: "light-stand-2", type: "cylinder", position: { x: 5, y: 3, z: 3 }, rotationY: 0, scale: { x: 0.15, y: 6, z: 0.15 }, color: "#2a2a2a", label: "灯架2" },
        ],
      }),
  },
];

// ─── 导出预设库 ──────────────────────────────────────────────────────────────

export const SCENE_PRESETS: Record<ScenePresetId, ScenePreset> = Object.fromEntries(
  PRESETS.map((p) => [p.id, p]),
) as Record<ScenePresetId, ScenePreset>;

export const SCENE_PRESET_LIST: ScenePreset[] = PRESETS;

export function getScenePreset(id: ScenePresetId): ScenePreset | undefined {
  return SCENE_PRESETS[id];
}

export function createSceneFromPreset(
  presetId: ScenePresetId,
  sceneId: string,
  sceneName?: string,
): BlockoutScene | undefined {
  const preset = SCENE_PRESETS[presetId];
  if (!preset) return undefined;
  return preset.create(sceneId, sceneName ?? preset.label);
}
