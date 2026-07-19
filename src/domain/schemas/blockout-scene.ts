/**
 * Task 2A.21: BlockoutScene — provider-agnostic 3D 白盒场景图类型
 *
 * 设计原则：
 * - provider-agnostic 表示 — 不绑定任何具体 3D 引擎或 AI provider
 * - JSON 可序列化 — 可持久化到 StoryBeat.blockout3D 字段
 * - 纯类型定义 — 无运行时代码，无外部依赖（domain 层零依赖规则）
 *
 * 实现位置：
 * - 类型定义在 domain 层（本文件）— 供 StoryBeat schema 引用
 * - 工厂函数 + 预设库 + 常量在 @/modules/blockout-3d/domain/ 中
 *   （这些需要业务逻辑，不适合放在纯类型 domain 层）
 *
 * 来源：豆包深度分析 + Kimi 一致性讨论。Seedance 2.5 原生支持 3D 白模输入，
 * 用低保真 3D 预演镜头与构图，导入后模型严格遵循空间结构生成。
 */

// ─── 基础几何类型 ─────────────────────────────────────────────────────────────

/** 三维向量（场景内部坐标，单位：米） */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** 二维向量（地面平面坐标） */
export interface Vec2 {
  x: number;
  z: number;
}

// ─── 地面平面 ─────────────────────────────────────────────────────────────────

export type GroundType = "plane" | "grid" | "indoor_floor" | "outdoor_terrain";

export interface GroundPlane {
  type: GroundType;
  /** 地面尺寸（米），默认 20x20 */
  size: { width: number; depth: number };
  /** 地面颜色（CSS color string 或 #RRGGBB） */
  color?: string;
  /** 是否显示网格线 */
  showGrid?: boolean;
}

// ─── 原始几何体（道具） ─────────────────────────────────────────────────────

export type PrimitiveType =
  | "box"        // 立方体
  | "cylinder"   // 圆柱
  | "sphere"     // 球体
  | "plane"      // 平面（墙壁/招牌等）
  | "cone"       // 圆锥（路障等）
  | "torus";     // 圆环

export interface PrimitiveShape {
  id: string;
  type: PrimitiveType;
  /** 世界坐标位置 */
  position: Vec3;
  /** 旋转角度（度，绕 Y 轴） */
  rotationY: number;
  /** 缩放比例 */
  scale: Vec3;
  /** 颜色 */
  color?: string;
  /** 标签（场景大纲显示用） */
  label?: string;
  /** 是否可见 */
  visible?: boolean;
}

// ─── 灯光预设 ─────────────────────────────────────────────────────────────────

export type LightingType = "daylight" | "sunset" | "indoor" | "night" | "dramatic" | "soft";

export interface LightingPreset {
  type: LightingType;
  /** 主光源方向（角度，0=正东，90=正北） */
  sunAzimuth?: number;
  /** 主光源仰角（度，0=地平线，90=正上方） */
  sunElevation?: number;
  /** 主光源强度（0-2） */
  intensity?: number;
  /** 环境光强度（0-1） */
  ambientIntensity?: number;
  /** 主光源颜色 */
  sunColor?: string;
  /** 环境光颜色 */
  ambientColor?: string;
}

// ─── 静态相机 ─────────────────────────────────────────────────────────────────

/**
 * 静态相机配置 — 当 cameraPath 未定义时使用此相机位姿。
 * 与 cameraPath 互斥（cameraPath 优先）。
 */
export interface ShotCamera {
  /** 焦距（mm），35-85 常见 */
  fov: number;
  /** 相机位置 */
  position: Vec3;
  /** 相机看向的目标点 */
  target: Vec3;
  /** 滚转角（度，正常 0） */
  roll?: number;
}

// ─── 人偶类型 ─────────────────────────────────────────────────────────────────

export type PosePreset =
  | "standing"    // 站立
  | "sitting"     // 坐
  | "walking"     // 走
  | "running"     // 跑
  | "jumping"     // 跳
  | "crouching"   // 蹲
  | "lying"       // 躺
  | "kneeling"    // 跪
  | "waving"      // 招手
  | "pointing";   // 指向

/** 姿势元数据 — 用于 UI 显示和人偶形状映射 */
export interface PoseMetadata {
  /** 姿势标识 */
  pose: PosePreset;
  /** 中文标签 */
  label: string;
  /** 人偶形状简化表示（用于 scene-builder 渲染） */
  silhouette: "upright" | "compact" | "extended" | "low";
  /** 高度系数（相对 standing 的比例） */
  heightFactor: number;
  /** 宽度系数（相对 standing 的比例） */
  widthFactor: number;
}

export type HeightPreset = "child" | "teen" | "adult" | "tall_adult" | "giant";

export interface HeightMetadata {
  /** 身高预设标识 */
  preset: HeightPreset;
  /** 中文标签 */
  label: string;
  /** 实际身高（米） */
  height: number;
}

/**
 * Mannequin — 场景中的人偶 placeholder
 *
 * 不携带角色形象数据 — 仅表达空间位置/朝向/姿势/比例。
 * 通过 characterVariantId 关联到 CharacterVariant 表获取实际形象。
 */
export interface Mannequin {
  /** 人偶实例 ID（场景内唯一） */
  id: string;
  /** 关联 CharacterVariant ID（用于读取角色形象） */
  characterVariantId: string;
  /** 角色显示名（缓存，便于场景大纲显示） */
  displayName?: string;
  /** 地面位置（XZ 平面） */
  position: Vec2;
  /** 朝向角度（度，0=正南/+Z，顺时针） */
  rotation: number;
  /** 姿势预设 */
  pose: PosePreset;
  /** 身高预设 */
  height: HeightPreset;
  /** 是否可见 */
  visible?: boolean;
}

// ─── 镜头轨迹类型 ─────────────────────────────────────────────────────────────

export type CameraInterpolation = "linear" | "arc" | "orbit";

/**
 * CameraKeyframe — 相机轨迹关键帧
 *
 * 一个关键帧定义了某个时间点的相机位姿（位置 + 目标点）。
 * 通过 interpolation 字段指定到下一关键帧的插值方式。
 */
export interface CameraKeyframe {
  /** 时间点（秒，0-30） */
  time: number;
  /** 相机位置 */
  position: Vec3;
  /** 相机看向的目标点 */
  target: Vec3;
  /**
   * 到下一关键帧的插值方式
   * - linear：直线插值（推拉/平移）
   * - arc：弧线插值（弧形运镜，需要中间控制点 — 自动计算）
   * - orbit：环绕目标点旋转（保持 target 不变，position 绕 target 旋转）
   */
  interpolation: CameraInterpolation;
  /** FOV（可选，覆盖默认值） */
  fov?: number;
}

/**
 * CameraPath — 相机轨迹（多个关键帧组合）
 *
 * 一个完整的运镜轨迹由 2-N 个关键帧组成。
 * 时间按升序排列，覆盖 0 到 duration 秒。
 */
export interface CameraPath {
  /** 轨迹标识 */
  id: string;
  /** 轨迹名称 */
  name: string;
  /** 总时长（秒） */
  duration: number;
  /** 关键帧列表（按 time 升序） */
  keyframes: CameraKeyframe[];
  /** 默认 FOV（被关键帧的 fov 覆盖） */
  defaultFov?: number;
}

/** 验证关键帧序列是否合法（时间升序、覆盖 0-duration） */
export interface CameraPathValidation {
  valid: boolean;
  errors: string[];
}

// ─── BlockoutScene 顶层类型 ─────────────────────────────────────────────────

/**
 * BlockoutScene — provider-agnostic 3D 白盒场景图
 *
 * 用于：
 * 1. 通过 scene-builder 转换为 Three.js Scene 进行渲染
 * 2. 通过 seedance-adapter 转换为 Seedance 2.5 白模输入格式
 * 3. 通过 fallback-adapter 转换为关键帧图（给其他模型作为参考）
 * 4. 序列化为 JSON 持久化到 StoryBeat.blockout3D
 */
export interface BlockoutScene {
  /** 场景版本号（向前兼容用） */
  version: 1;
  /** 场景标识 */
  id: string;
  /** 场景名称 */
  name: string;
  /** 地面 */
  ground: GroundPlane;
  /** 道具列表（盒/柱/球/面等原始几何体） */
  props: PrimitiveShape[];
  /** 人偶列表 */
  characters: Mannequin[];
  /** 静态相机配置 */
  camera: ShotCamera;
  /**
   * 运镜轨迹 — Seedance 2.5 核心能力
   * 定义后覆盖 camera 静态位姿，按关键帧动画相机
   */
  cameraPath?: CameraKeyframe[];
  /** 灯光预设 */
  lighting: LightingPreset;
  /** 创建时间戳（ms） */
  createdAt?: number;
  /** 最后修改时间戳（ms） */
  updatedAt?: number;
}
