# blockout-3d Module Contract ✅

> Task 2A.21: 3D 白盒预览编辑器
>
> 提供基于 Three.js 的低保真 3D 白盒场景编辑器，用于在视频生成前
> 预演镜头与构图。Seedance 2.5 原生支持 3D 白模输入；其他模型走 fallback 适配器。

> **状态图例**：✅ 已完成并可用 · 🧪 测试中 · 🚧 开发中 · 📐 规划中/待实现

<!-- AI: Before modifying this module, read contract.json for invariants -->

---

## 子域概览

| 子域 | 状态 | 路径 | 职责 |
|------|:----:|------|------|
| domain | ✅ | `domain/` | provider-agnostic 场景图类型 + 工厂函数（无外部依赖） |
| services | ✅ | `services/` | 纯逻辑服务 + Three.js 渲染 + ffmpeg 合成 + 文件 IO |
| presentation | ✅ | `presentation/` | R3F 组件（7 个） |

---

## 公共 API

### ✅ 顶层组件
- `Blockout3DPanel` — 顶层容器组件（BeatDetailEditor 集成入口）

### ✅ Domain 层 — 场景图（scene-schema.ts）

| API | 签名 | 说明 |
|-----|------|------|
| `Vec3` | type | 三维向量（x, y, z） |
| `Vec2` | type | 二维向量（x, y） |
| `GroundType` | type | 地面类型枚举 |
| `PrimitiveType` | type | 基础几何体类型枚举 |
| `LightingType` | type | 灯光类型枚举 |
| `BlockoutScene` | type | provider-agnostic 场景图（持久化到 StoryBeat.blockout3D） |
| `GroundPlane` | type | 地面平面 |
| `PrimitiveShape` | type | 基础几何体 |
| `LightingPreset` | type | 灯光预设 |
| `ShotCamera` | type | 镜头相机 |
| `createDefaultGround` | `() → GroundPlane` | 创建默认地面 |
| `createDefaultLighting` | `() → LightingPreset` | 创建默认灯光 |
| `createDefaultCamera` | `() → ShotCamera` | 创建默认相机 |
| `createEmptyScene` | `() → BlockoutScene` | 创建空场景 |

### ✅ Domain 层 — 人偶（mannequin-types.ts）

| API | 签名 | 说明 |
|-----|------|------|
| `PosePreset` | type | 姿势预设 ID |
| `PoseMetadata` | type | 姿势元数据（名称 + 描述） |
| `HeightPreset` | type | 身高预设 ID |
| `HeightMetadata` | type | 身高元数据（名称 + 厘米值） |
| `Mannequin` | type | 人偶 placeholder（含位置/旋转/姿势/身高/可见性） |
| `POSE_PRESETS` | record | 10 种姿势预设映射 |
| `POSE_PRESET_LIST` | `PoseMetadata[]` | 姿势预设列表（UI 用） |
| `HEIGHT_PRESETS` | record | 5 种身高预设映射 |
| `HEIGHT_PRESET_LIST` | `HeightMetadata[]` | 身高预设列表（UI 用） |
| `createDefaultMannequin` | `(id?) → Mannequin` | 创建默认人偶 |
| `getMannequinHeight` | `(preset: HeightPreset) → number` | 根据身高预设获取高度（cm） |
| `getMannequinWidth` | `(preset: HeightPreset) → number` | 根据身高预设获取宽度 |

### ✅ Domain 层 — 镜头轨迹（camera-path-types.ts）

| API | 签名 | 说明 |
|-----|------|------|
| `CameraInterpolation` | type | 插值类型（lerp / bezier2 / orbit） |
| `CameraKeyframe` | type | 镜头关键帧 |
| `CameraPath` | type | 镜头轨迹（关键帧序列） |
| `CameraPathValidation` | type | 轨迹校验结果 |
| `INTERPOLATION_TYPES` | record | 插值类型映射 |
| `validateCameraPath` | `(path: CameraPath) → CameraPathValidation` | 校验镜头轨迹 |
| `createDefaultCameraPath` | `() → CameraPath` | 创建默认镜头轨迹 |
| `cameraPathToKeyframes` | `(path: CameraPath, fps: number) → CameraKeyframe[]` | 将轨迹转为关键帧序列 |

### ✅ Domain 层 — 预设库（preset-library.ts）

| API | 签名 | 说明 |
|-----|------|------|
| `ScenePresetId` | type | 预设场景 ID |
| `ScenePreset` | type | 预设场景元数据 |
| `SCENE_PRESETS` | record | 7 种预设场景映射（空房间/街角/办公室/公园/电影特写/远景/摄影棚） |
| `SCENE_PRESET_LIST` | `ScenePreset[]` | 预设场景列表（UI 用） |
| `getScenePreset` | `(id: ScenePresetId) → ScenePreset \| undefined` | 获取预设场景 |
| `createSceneFromPreset` | `(id: ScenePresetId) → BlockoutScene` | 根据预设创建场景 |

### ✅ Services 层 — 镜头动画（camera-animator.ts，纯逻辑无 Three.js 依赖）

| API | 签名 | 说明 |
|-----|------|------|
| `CameraPose` | type | 相机姿态（位置 + 朝向） |
| `AnimatorInterpolation` | type | 插值类型（CameraInterpolation 别名） |
| `lerp` | `(a, b, t) → number` | 线性插值 |
| `lerpVec3` | `(a, b, t) → Vec3` | 三维向量线性插值 |
| `distanceVec3` | `(a, b) → number` | 三维向量距离 |
| `arcMidpoint` | `(a, b, center) → Vec3` | 圆弧中点 |
| `bezier2` | `(p0, p1, p2, t) → Vec3` | 二次贝塞尔曲线 |
| `interpolateKeyframes` | `(keyframes, t) → CameraPose` | 关键帧插值 |
| `getCameraPoseAtTime` | `(path, time, fps) → CameraPose` | 获取某时刻的相机姿态 |
| `sampleCameraPoses` | `(path, fps, duration) → CameraPose[]` | 采样相机姿态序列 |
| `sampleKeyframeThumbnails` | `(path, count) → CameraKeyframe[]` | 采样关键帧缩略图 |

### ✅ Services 层 — 人偶服务（mannequin-service.ts，纯逻辑无 Three.js 依赖）

| API | 签名 | 说明 |
|-----|------|------|
| `MannequinGeometry` | type | 人偶几何信息（位置/尺寸） |
| `createMannequin` | `(id?, preset?) → Mannequin` | 创建人偶 |
| `moveMannequin` | `(mannequin, position) → Mannequin` | 移动人偶 |
| `rotateMannequin` | `(mannequin, rotation) → Mannequin` | 旋转人偶 |
| `applyPose` | `(mannequin, pose) → Mannequin` | 应用姿势 |
| `applyHeight` | `(mannequin, height) → Mannequin` | 应用身高 |
| `toggleVisibility` | `(mannequin) → Mannequin` | 切换可见性 |
| `addMannequin` | `(scene, mannequin) → BlockoutScene` | 添加人偶到场景 |
| `removeMannequin` | `(scene, id) → BlockoutScene` | 从场景移除人偶 |
| `updateMannequin` | `(scene, id, patch) → BlockoutScene` | 更新人偶 |
| `findMannequin` | `(scene, id) → Mannequin \| undefined` | 查找人偶 |
| `getVisibleMannequins` | `(scene) → Mannequin[]` | 获取可见人偶列表 |
| `getMannequinsByVariantId` | `(scene, variantId) → Mannequin[]` | 按变体 ID 筛选人偶 |
| `getMannequinGeometry` | `(mannequin) → MannequinGeometry` | 获取人偶几何信息 |

### ✅ Services 层 — Seedance 适配器（seedance-adapter.ts，纯逻辑无 Three.js 依赖）

| API | 签名 | 说明 |
|-----|------|------|
| `Seedance3DInput` | type | Seedance 2.5 3D 输入（GLB + JSON + MP4） |
| `SeedanceSceneMetadata` | type | Seedance 场景元数据 |
| `SeedanceAdapterOptions` | type | 适配器选项 |
| `SeedanceAdapterValidation` | type | 适配器校验结果 |
| `adaptToSeedanceInput` | `(scene, path, options?) → Seedance3DInput` | 适配为 Seedance 输入 |
| `validateForSeedance` | `(scene) → SeedanceAdapterValidation` | 校验场景是否可用于 Seedance |

### ✅ Services 层 — Fallback 适配器（fallback-adapter.ts，纯逻辑无 Three.js 依赖）

| API | 签名 | 说明 |
|-----|------|------|
| `FallbackKeyframeSet` | type | Fallback 关键帧图集（5 张 PNG） |
| `FallbackKeyframe` | type | 单个 Fallback 关键帧 |
| `FallbackAdapterValidation` | type | Fallback 适配器校验结果 |
| `adaptToFallbackKeyframes` | `(scene, path, options?) → FallbackKeyframeSet` | 适配为关键帧图集 |
| `validateForFallback` | `(scene) → FallbackAdapterValidation` | 校验场景是否可用于 Fallback |
| `fillFramePaths` | `(set, basePath) → FallbackKeyframeSet` | 填充帧路径 |
| `getFirstFramePath` | `(set) → string \| undefined` | 获取首帧路径 |
| `getAllFramePaths` | `(set) → string[]` | 获取所有帧路径 |

### ✅ Services 层 — 场景构建（scene-builder.ts，依赖 Three.js）

| API | 签名 | 说明 |
|-----|------|------|
| `BuiltScene` | type | 构建完成的 Three.js Scene（含 renderer + camera） |
| `SceneBuilderOptions` | type | 构建选项 |
| `Disposable` | type | 可释放资源接口 |
| `SceneStats` | type | 场景统计（对象数/面数等） |
| `buildScene` | `(scene, options?) → Promise<BuiltScene>` | 构建 Three.js Scene |
| `disposeScene` | `(built) → void` | 释放 GPU 资源 |
| `applyCameraPose` | `(camera, pose) → void` | 应用相机姿态 |
| `applyShotCamera` | `(camera, shot) → void` | 应用镜头相机配置 |
| `computeSceneStats` | `(scene) → SceneStats` | 计算场景统计 |

### ✅ Services 层 — 渲染（render-service.ts，依赖 Three.js + WebGL）

| API | 签名 | 说明 |
|-----|------|------|
| `RenderOptions` | type | 渲染选项（分辨率/帧率/格式） |
| `RenderResult` | type | 单帧渲染结果 |
| `FrameSequenceResult` | type | 帧序列渲染结果 |
| `FrameSequenceOptions` | type | 帧序列渲染选项 |
| `KeyframeSetRenderResult` | type | 关键帧集渲染结果 |
| `DEFAULT_RENDER_OPTIONS` | `RenderOptions` | 默认渲染选项（960x540, 24fps） |
| `renderFrame` | `(built, options?) → Promise<RenderResult>` | 渲染单帧 |
| `renderStaticView` | `(built, options?) → Promise<RenderResult>` | 渲染静态视图 |
| `renderFrameSequence` | `(built, path, options?) → Promise<FrameSequenceResult>` | 渲染帧序列 |
| `renderKeyframeSet` | `(built, path, keyframes, options?) → Promise<KeyframeSetRenderResult>` | 渲染关键帧集 |
| `writeFramesToFiles` | `(frames, dir, prefix) → Promise<string[]>` | 写入帧到文件 |
| `isWebGLAvailable` | `() → boolean` | 检测 WebGL 可用性 |
| `isOffscreenCanvasAvailable` | `() → boolean` | 检测 OffscreenCanvas 可用性 |

### ✅ Services 层 — 动画导出（animatic-exporter.ts，依赖 ffmpeg-runner）

| API | 签名 | 说明 |
|-----|------|------|
| `AnimaticExportOptions` | type | 动画导出选项（帧率/时长/分辨率） |
| `AnimaticExportResult` | type | 动画导出结果（MP4 路径） |
| `PreviewSnapshotResult` | type | 预览快照结果（PNG 路径） |
| `exportAnimatic` | `(built, path, options?) → Promise<AnimaticExportResult>` | 导出动画（帧序列 → MP4） |
| `exportPreviewSnapshot` | `(built, options?) → Promise<PreviewSnapshotResult>` | 导出预览快照 |

### ✅ Services 层 — 场景 IO（scene-io.ts，依赖 Three.js + file-http）

| API | 签名 | 说明 |
|-----|------|------|
| `GlbExportOptions` | type | GLB 导出选项 |
| `JsonExportOptions` | type | JSON 导出选项 |
| `JsonImportResult` | type | JSON 导入结果 |
| `ExternalModelImportResult` | type | 外部模型导入结果 |
| `exportSceneAsGlb` | `(scene, path, options?) → Promise<void>` | 导出为 GLB |
| `exportSceneAsJson` | `(scene, path, options?) → Promise<void>` | 导出为 JSON |
| `serializeSceneToJson` | `(scene) → string` | 序列化场景为 JSON 字符串 |
| `parseSceneFromJson` | `(json) → BlockoutScene` | 从 JSON 解析场景 |
| `importSceneFromJson` | `(path) → Promise<BlockoutScene>` | 从 JSON 文件导入场景 |
| `importExternalModel` | `(path) → Promise<ExternalModelImportResult>` | 导入外部模型（GLTF/OBJ） |
| `validateBlockoutScene` | `(scene) → BlockoutScene` | 校验场景数据 |

### ✅ Presentation 层

| API | 签名 | 说明 |
|-----|------|------|
| `Blockout3DCanvas` | `React.FC<Blockout3DCanvasProps>` | R3F Canvas 核心 3D 渲染 |
| `SceneOutliner` | `React.FC<SceneOutlinerProps>` | 场景大纲 |
| `PresetSelector` | `React.FC<PresetSelectorProps>` | 预设场景选择器 |
| `MannequinControls` | `React.FC<MannequinControlsProps>` | 人偶摆位控件 |
| `CameraPathEditor` | `React.FC<CameraPathEditorProps>` | 镜头轨迹编辑器 |
| `ExportPanel` | `React.FC<ExportPanelProps>` | 导出面板 |
| `ExportedAsset` | type | 导出资产类型（ExportPanel 使用） |

---

## 边界约束（Invariants）

### 1. Provider-agnostic 数据表示
`BlockoutScene` 必须保持 provider-agnostic：
- 不依赖任何具体 3D 引擎或 AI provider
- JSON 可序列化（可持久化到 StoryBeat.blockout3D）
- 通过 `scene-builder` 转换为 Three.js Scene
- 通过 `seedance-adapter` 转换为 Seedance 2.5 输入
- 通过 `fallback-adapter` 转换为关键帧图集

### 2. 依赖方向
- `domain/` 不依赖任何外部模块（纯类型 + 工厂函数）
- `services/camera-animator.ts` / `mannequin-service.ts` / `seedance-adapter.ts` / `fallback-adapter.ts` 不依赖 Three.js（纯逻辑）
- `services/scene-builder.ts` / `render-service.ts` / `animatic-exporter.ts` / `scene-io.ts` 依赖 Three.js + file-http + ffmpeg-runner
- `presentation/` 依赖 @react-three/fiber + @react-three/drei
- 所有 services 通过 `@/shared/file-http` 访问文件系统（不直接调用 electronAPI）

### 3. Three.js 动态加载
- 首屏不加载 Three.js（避免增加首屏 bundle 大小）
- 用户进入 3D 白模 Tab 时通过 React.lazy / 动态 import 加载
- WebGL 不可用时显示降级文案，不影响其他功能

### 4. StoryBeat 持久化
- `BlockoutScene` 序列化到 `StoryBeat.blockout3D` 字段
- 版本字段 `version: 1` 用于向前兼容
- 通过 `validateBlockoutScene` 校验从 JSON 导入的数据

### 5. Seedance 2.5 / Fallback 决策
- 模型 `supports3DPreview === true` → 调用 `adaptToSeedanceInput` 生成 GLB + JSON + MP4
- 模型 `supports3DPreview !== true` → 调用 `adaptToFallbackKeyframes` 生成 5 张关键帧 PNG
- 决策由 `ExportPanel` 根据 `modelSupports3D` prop 触发

### 6. 资源释放
- `buildScene` 返回的 `BuiltScene` 必须通过 `disposeScene` 释放 GPU 资源
- `Blockout3DCanvas` 在组件卸载时自动 dispose（通过 useEffect cleanup）
- 调用方负责 `renderer.domElement` 的 DOM 挂载和移除

---

## 关键文件

### Domain
- `domain/scene-schema.ts` — BlockoutScene 顶层类型 + 工厂函数
- `domain/mannequin-types.ts` — Mannequin 类型 + POSE_PRESETS + HEIGHT_PRESETS
- `domain/camera-path-types.ts` — CameraKeyframe / CameraPath + validateCameraPath
- `domain/preset-library.ts` — 7 种预设场景

### Services（纯逻辑）
- `services/camera-animator.ts` — 镜头轨迹动画（lerp/bezier2/orbit，无 Three.js 依赖）
- `services/mannequin-service.ts` — 人偶摆位 + 姿势应用（无 Three.js 依赖）
- `services/seedance-adapter.ts` — Seedance 2.5 白模输入适配器（无 Three.js 依赖）
- `services/fallback-adapter.ts` — Fallback 关键帧图集适配器（无 Three.js 依赖）

### Services（Three.js 依赖）
- `services/scene-builder.ts` — BlockoutScene → Three.js Scene
- `services/render-service.ts` — WebGL 渲染 → PNG 帧序列
- `services/animatic-exporter.ts` — 帧序列 → ffmpeg-runner → MP4 animatic
- `services/scene-io.ts` — GLB/GLTF/OBJ 导入 + GLB/JSON 导出

### Presentation
- `presentation/Blockout3DPanel.tsx` — 顶层容器（Tab 切换 + 状态管理）
- `presentation/Blockout3DCanvas.tsx` — R3F Canvas 核心 3D 渲染
- `presentation/SceneOutliner.tsx` — 场景大纲
- `presentation/PresetSelector.tsx` — 预设场景选择器
- `presentation/MannequinControls.tsx` — 人偶摆位控件
- `presentation/CameraPathEditor.tsx` — 镜头轨迹编辑器
- `presentation/ExportPanel.tsx` — 导出面板

---

## 集成点

### BeatDetailEditor 集成
- 在 BeatDetailEditor 中新增 "3D 白模" Tab
- Tab 内容为 `Blockout3DPanel`
- 场景数据持久化到 `beat.blockout3D`

### StoryBeat schema 扩展
- 新增 `blockout3D?: BlockoutScene` 可选字段
- 通过 `storyBeatSchema.extend({ blockout3D: ... })` 添加

### GenerationAsset type 扩展
- 新增 asset type: `preview_3d_snapshot` / `blockout_animatic`
- 通过 `assetTypeEnum` 添加

### i18n
- 新增 `blockout.*` 系列 i18n 键（中英文）

---

## 测试覆盖

Done 标准要求每个核心服务至少 5 个测试用例：
- `scene-builder.test.ts` — 构建/释放/统计
- `camera-animator.test.ts` — 插值/采样/边界
- `seedance-adapter.test.ts` — 适配/校验
- `fallback-adapter.test.ts` — 适配/校验/帧路径填充

---

## 性能考量

- **首屏影响**：Three.js + R3F 通过动态 import 加载，首屏 bundle 不增加
- **GPU 资源**：场景切换时通过 `disposeScene` 释放，避免内存泄漏
- **渲染分辨率**：默认 960x540（16:9），可配置
- **Animatic 帧率**：默认 24 fps，5 秒视频约 120 帧 PNG
- **GLB 大小**：低保真灰模，单场景通常 < 100KB
