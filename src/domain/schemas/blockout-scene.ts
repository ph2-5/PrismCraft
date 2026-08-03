/**
 * Task 2A.21: BlockoutScene — provider-agnostic 3D 白盒场景图类型
 *
 * 设计原则：
 * - provider-agnostic 表示 — 不绑定任何具体 3D 引擎或 AI provider
 * - JSON 可序列化 — 可持久化到 StoryBeat.blockout3D 字段
 * - Zod schema + z.infer — 提供运行时验证，防止脏数据持久化
 *
 * 实现位置：
 * - 类型 + schema 定义在 domain 层（本文件）— 供 StoryBeat schema 引用
 * - 工厂函数 + 预设库 + 常量在 @/modules/blockout-3d/domain/ 中
 *   （这些需要业务逻辑，不适合放在纯类型 domain 层）
 *
 * 来源：豆包深度分析 + Kimi 一致性讨论。Seedance 2.5 原生支持 3D 白模输入，
 * 用低保真 3D 预演镜头与构图，导入后模型严格遵循空间结构生成。
 *
 * P2.4 重构：手动 interface → Zod schema + z.infer，补充运行时验证。
 */

import { z } from "zod";

// ─── 基础几何类型 ─────────────────────────────────────────────────────────────

/** 三维向量（场景内部坐标，单位：米） */
export const Vec3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});
export type Vec3 = z.infer<typeof Vec3Schema>;

/** 二维向量（地面平面坐标） */
export const Vec2Schema = z.object({
  x: z.number(),
  z: z.number(),
});
export type Vec2 = z.infer<typeof Vec2Schema>;

// ─── 地面平面 ─────────────────────────────────────────────────────────────────

export const GroundTypeSchema = z.enum(["plane", "grid", "indoor_floor", "outdoor_terrain"]);
export type GroundType = z.infer<typeof GroundTypeSchema>;

export const GroundPlaneSchema = z.object({
  type: GroundTypeSchema,
  /** 地面尺寸（米），默认 20x20 */
  size: z.object({ width: z.number(), depth: z.number() }),
  /** 地面颜色（CSS color string 或 #RRGGBB） */
  color: z.string().optional(),
  /** 是否显示网格线 */
  showGrid: z.boolean().optional(),
});
export type GroundPlane = z.infer<typeof GroundPlaneSchema>;

// ─── 原始几何体（道具） ─────────────────────────────────────────────────────

export const PrimitiveTypeSchema = z.enum([
  "box", // 立方体
  "cylinder", // 圆柱
  "sphere", // 球体
  "plane", // 平面（墙壁/招牌等）
  "cone", // 圆锥（路障等）
  "torus", // 圆环
]);
export type PrimitiveType = z.infer<typeof PrimitiveTypeSchema>;

export const PrimitiveShapeSchema = z.object({
  id: z.string(),
  type: PrimitiveTypeSchema,
  /** 世界坐标位置 */
  position: Vec3Schema,
  /** 旋转角度（度，绕 Y 轴） */
  rotationY: z.number(),
  /** 缩放比例 */
  scale: Vec3Schema,
  /** 颜色 */
  color: z.string().optional(),
  /** 标签（场景大纲显示用） */
  label: z.string().optional(),
  /** 是否可见 */
  visible: z.boolean().optional(),
});
export type PrimitiveShape = z.infer<typeof PrimitiveShapeSchema>;

// ─── 灯光预设 ─────────────────────────────────────────────────────────────────

export const LightingTypeSchema = z.enum([
  "daylight",
  "sunset",
  "indoor",
  "night",
  "dramatic",
  "soft",
]);
export type LightingType = z.infer<typeof LightingTypeSchema>;

export const LightingPresetSchema = z.object({
  type: LightingTypeSchema,
  /** 主光源方向（角度，0=正东，90=正北） */
  sunAzimuth: z.number().optional(),
  /** 主光源仰角（度，0=地平线，90=正上方） */
  sunElevation: z.number().optional(),
  /** 主光源强度（0-2） */
  intensity: z.number().optional(),
  /** 环境光强度（0-1） */
  ambientIntensity: z.number().optional(),
  /** 主光源颜色 */
  sunColor: z.string().optional(),
  /** 环境光颜色 */
  ambientColor: z.string().optional(),
});
export type LightingPreset = z.infer<typeof LightingPresetSchema>;

// ─── 静态相机 ─────────────────────────────────────────────────────────────────

/**
 * 静态相机配置 — 当 cameraPath 未定义时使用此相机位姿。
 * 与 cameraPath 互斥（cameraPath 优先）。
 */
export const ShotCameraSchema = z.object({
  /** 焦距（mm），35-85 常见 */
  fov: z.number(),
  /** 相机位置 */
  position: Vec3Schema,
  /** 相机看向的目标点 */
  target: Vec3Schema,
  /** 滚转角（度，正常 0） */
  roll: z.number().optional(),
});
export type ShotCamera = z.infer<typeof ShotCameraSchema>;

// ─── 人偶类型 ─────────────────────────────────────────────────────────────────

export const PosePresetSchema = z.enum([
  "standing", // 站立
  "sitting", // 坐
  "walking", // 走
  "running", // 跑
  "jumping", // 跳
  "crouching", // 蹲
  "lying", // 躺
  "kneeling", // 跪
  "waving", // 招手
  "pointing", // 指向
]);
export type PosePreset = z.infer<typeof PosePresetSchema>;

/** 姿势元数据 — 用于 UI 显示和人偶形状映射 */
export const PoseMetadataSchema = z.object({
  /** 姿势标识 */
  pose: PosePresetSchema,
  /** 中文标签 */
  label: z.string(),
  /** 人偶形状简化表示（用于 scene-builder 渲染） */
  silhouette: z.enum(["upright", "compact", "extended", "low"]),
  /** 高度系数（相对 standing 的比例） */
  heightFactor: z.number(),
  /** 宽度系数（相对 standing 的比例） */
  widthFactor: z.number(),
});
export type PoseMetadata = z.infer<typeof PoseMetadataSchema>;

export const HeightPresetSchema = z.enum(["child", "teen", "adult", "tall_adult", "giant"]);
export type HeightPreset = z.infer<typeof HeightPresetSchema>;

export const HeightMetadataSchema = z.object({
  /** 身高预设标识 */
  preset: HeightPresetSchema,
  /** 中文标签 */
  label: z.string(),
  /** 实际身高（米） */
  height: z.number(),
});
export type HeightMetadata = z.infer<typeof HeightMetadataSchema>;

/**
 * Mannequin — 场景中的人偶 placeholder
 *
 * 不携带角色形象数据 — 仅表达空间位置/朝向/姿势/比例。
 * 通过 characterVariantId 关联到 CharacterVariant 表获取实际形象。
 */
export const MannequinSchema = z.object({
  /** 人偶实例 ID（场景内唯一） */
  id: z.string(),
  /** 关联 CharacterVariant ID（用于读取角色形象） */
  characterVariantId: z.string(),
  /** 角色显示名（缓存，便于场景大纲显示） */
  displayName: z.string().optional(),
  /** 地面位置（XZ 平面） */
  position: Vec2Schema,
  /** 朝向角度（度，0=正南/+Z，顺时针） */
  rotation: z.number(),
  /** 姿势预设 */
  pose: PosePresetSchema,
  /** 身高预设 */
  height: HeightPresetSchema,
  /** 是否可见 */
  visible: z.boolean().optional(),
});
export type Mannequin = z.infer<typeof MannequinSchema>;

// ─── 镜头轨迹类型 ─────────────────────────────────────────────────────────────

export const CameraInterpolationSchema = z.enum(["linear", "arc", "orbit"]);
export type CameraInterpolation = z.infer<typeof CameraInterpolationSchema>;

/**
 * CameraKeyframe — 相机轨迹关键帧
 *
 * 一个关键帧定义了某个时间点的相机位姿（位置 + 目标点）。
 * 通过 interpolation 字段指定到下一关键帧的插值方式。
 */
export const CameraKeyframeSchema = z.object({
  /** 时间点（秒，0-30） */
  time: z.number(),
  /** 相机位置 */
  position: Vec3Schema,
  /** 相机看向的目标点 */
  target: Vec3Schema,
  /**
   * 到下一关键帧的插值方式
   * - linear：直线插值（推拉/平移）
   * - arc：弧线插值（弧形运镜，需要中间控制点 — 自动计算）
   * - orbit：环绕目标点旋转（保持 target 不变，position 绕 target 旋转）
   */
  interpolation: CameraInterpolationSchema,
  /** FOV（可选，覆盖默认值） */
  fov: z.number().optional(),
});
export type CameraKeyframe = z.infer<typeof CameraKeyframeSchema>;

/**
 * CameraPath — 相机轨迹（多个关键帧组合）
 *
 * 一个完整的运镜轨迹由 2-N 个关键帧组成。
 * 时间按升序排列，覆盖 0 到 duration 秒。
 */
export const CameraPathSchema = z.object({
  /** 轨迹标识 */
  id: z.string(),
  /** 轨迹名称 */
  name: z.string(),
  /** 总时长（秒） */
  duration: z.number(),
  /** 关键帧列表（按 time 升序） */
  keyframes: z.array(CameraKeyframeSchema),
  /** 默认 FOV（被关键帧的 fov 覆盖） */
  defaultFov: z.number().optional(),
});
export type CameraPath = z.infer<typeof CameraPathSchema>;

/** 验证关键帧序列是否合法（时间升序、覆盖 0-duration） */
export const CameraPathValidationSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.string()),
});
export type CameraPathValidation = z.infer<typeof CameraPathValidationSchema>;

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
export const BlockoutSceneSchema = z.object({
  /** 场景版本号（向前兼容用） */
  version: z.literal(1),
  /** 场景标识 */
  id: z.string(),
  /** 场景名称 */
  name: z.string(),
  /** 地面 */
  ground: GroundPlaneSchema,
  /** 道具列表（盒/柱/球/面等原始几何体） */
  props: z.array(PrimitiveShapeSchema),
  /** 人偶列表 */
  characters: z.array(MannequinSchema),
  /** 静态相机配置 */
  camera: ShotCameraSchema,
  /**
   * 运镜轨迹 — Seedance 2.5 核心能力
   * 定义后覆盖 camera 静态位姿，按关键帧动画相机
   */
  cameraPath: z.array(CameraKeyframeSchema).optional(),
  /** 灯光预设 */
  lighting: LightingPresetSchema,
  /** 创建时间戳（ms） */
  createdAt: z.number().optional(),
  /** 最后修改时间戳（ms） */
  updatedAt: z.number().optional(),
});
export type BlockoutScene = z.infer<typeof BlockoutSceneSchema>;
