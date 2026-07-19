/**
 * Task 2A.21: blockout-3d 模块公共 API
 *
 * 3D 白盒预览编辑器 — provider-agnostic 场景图 + Three.js 渲染 + Seedance 2.5 / fallback 适配器
 *
 * 设计要点：
 * - 首屏不加载 Three.js — 通过动态 import 在用户进入 3D 白模 Tab 时加载
 * - WebGL 不可用时降级为提示文案，不影响其他功能
 * - StoryBeat.blockout3D 持久化场景数据，可在会话间恢复
 *
 * 公共 API：
 *   Blockout3DPanel       — 顶层容器组件（BeatDetailEditor 集成入口）
 *   BlockoutScene         — provider-agnostic 场景图类型
 *   Mannequin             — 人偶类型
 *   CameraKeyframe        — 镜头轨迹关键帧类型
 *
 * 详见 MODULE.md
 */

// ─── Domain 层（类型 + 工厂函数） ─────────────────────────────────────────────

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
} from "./domain/scene-schema";

export {
  createDefaultGround,
  createDefaultLighting,
  createDefaultCamera,
  createEmptyScene,
} from "./domain/scene-schema";

export type {
  PosePreset,
  PoseMetadata,
  HeightPreset,
  HeightMetadata,
  Mannequin,
} from "./domain/mannequin-types";

export {
  POSE_PRESETS,
  POSE_PRESET_LIST,
  HEIGHT_PRESETS,
  HEIGHT_PRESET_LIST,
  createDefaultMannequin,
  getMannequinHeight,
  getMannequinWidth,
} from "./domain/mannequin-types";

export type {
  CameraInterpolation,
  CameraKeyframe,
  CameraPath,
  CameraPathValidation,
} from "./domain/camera-path-types";

export {
  INTERPOLATION_TYPES,
  validateCameraPath,
  createDefaultCameraPath,
  cameraPathToKeyframes,
} from "./domain/camera-path-types";

export type {
  ScenePresetId,
  ScenePreset,
} from "./domain/preset-library";

export {
  SCENE_PRESETS,
  SCENE_PRESET_LIST,
  getScenePreset,
  createSceneFromPreset,
} from "./domain/preset-library";

// ─── Services 层（纯逻辑） ────────────────────────────────────────────────────

export type {
  CameraPose,
  CameraInterpolation as AnimatorInterpolation,
} from "./services/camera-animator";

export {
  lerp,
  lerpVec3,
  distanceVec3,
  arcMidpoint,
  bezier2,
  interpolateKeyframes,
  getCameraPoseAtTime,
  sampleCameraPoses,
  sampleKeyframeThumbnails,
} from "./services/camera-animator";

export type {
  MannequinGeometry,
} from "./services/mannequin-service";

export {
  createMannequin,
  moveMannequin,
  rotateMannequin,
  applyPose,
  applyHeight,
  toggleVisibility,
  addMannequin,
  removeMannequin,
  updateMannequin,
  findMannequin,
  getVisibleMannequins,
  getMannequinsByVariantId,
  getMannequinGeometry,
} from "./services/mannequin-service";

export type {
  Seedance3DInput,
  SeedanceSceneMetadata,
  SeedanceAdapterOptions,
  SeedanceAdapterValidation,
} from "./services/seedance-adapter";

export {
  adaptToSeedanceInput,
  validateForSeedance,
} from "./services/seedance-adapter";

export type {
  FallbackKeyframeSet,
  FallbackKeyframe,
  FallbackAdapterValidation,
} from "./services/fallback-adapter";

export {
  adaptToFallbackKeyframes,
  validateForFallback,
  fillFramePaths,
  getFirstFramePath,
  getAllFramePaths,
} from "./services/fallback-adapter";

// ─── Services 层（Three.js 依赖 — 动态加载） ────────────────────────────────

export type {
  BuiltScene,
  SceneBuilderOptions,
  Disposable,
  SceneStats,
} from "./services/scene-builder";

export {
  buildScene,
  disposeScene,
  applyCameraPose,
  applyShotCamera,
  computeSceneStats,
} from "./services/scene-builder";

export type {
  RenderOptions,
  RenderResult,
  FrameSequenceResult,
  FrameSequenceOptions,
  KeyframeSetRenderResult,
} from "./services/render-service";

export {
  DEFAULT_RENDER_OPTIONS,
  renderFrame,
  renderStaticView,
  renderFrameSequence,
  renderKeyframeSet,
  writeFramesToFiles,
  isWebGLAvailable,
  isOffscreenCanvasAvailable,
} from "./services/render-service";

export type {
  AnimaticExportOptions,
  AnimaticExportResult,
  PreviewSnapshotResult,
} from "./services/animatic-exporter";

export {
  exportAnimatic,
  exportPreviewSnapshot,
} from "./services/animatic-exporter";

export type {
  GlbExportOptions,
  JsonExportOptions,
  JsonImportResult,
  ExternalModelImportResult,
} from "./services/scene-io";

export {
  exportSceneAsGlb,
  serializeSceneToJson,
  exportSceneAsJson,
  parseSceneFromJson,
  importSceneFromJson,
  importExternalModel,
  validateBlockoutScene,
} from "./services/scene-io";

// ─── Presentation 层 ─────────────────────────────────────────────────────────

export { Blockout3DPanel } from "./presentation/Blockout3DPanel";
export type { Blockout3DPanelProps } from "./presentation/Blockout3DPanel";

export { Blockout3DCanvas } from "./presentation/Blockout3DCanvas";
export type { Blockout3DCanvasProps } from "./presentation/Blockout3DCanvas";

export { SceneOutliner } from "./presentation/SceneOutliner";
export type { SceneOutlinerProps } from "./presentation/SceneOutliner";

export { PresetSelector } from "./presentation/PresetSelector";
export type { PresetSelectorProps } from "./presentation/PresetSelector";

export { MannequinControls } from "./presentation/MannequinControls";
export type { MannequinControlsProps } from "./presentation/MannequinControls";

export { CameraPathEditor } from "./presentation/CameraPathEditor";
export type { CameraPathEditorProps } from "./presentation/CameraPathEditor";

export { ExportPanel } from "./presentation/ExportPanel";
export type { ExportPanelProps, ExportedAsset } from "./presentation/ExportPanel";
