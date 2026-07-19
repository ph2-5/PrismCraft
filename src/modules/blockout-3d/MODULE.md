# blockout-3d Module Contract

> Task 2A.21: 3D 白盒预览编辑器
>
> 提供基于 Three.js 的低保真 3D 白盒场景编辑器，用于在视频生成前
> 预演镜头与构图。Seedance 2.5 原生支持 3D 白模输入；其他模型走 fallback 适配器。

<!-- AI: Before modifying this module, read contract.json for invariants -->

---

## 子域概览

| 子域 | 路径 | 职责 |
|------|------|------|
| domain | `domain/` | provider-agnostic 场景图类型 + 工厂函数（无外部依赖） |
| services | `services/` | 纯逻辑服务 + Three.js 渲染 + ffmpeg 合成 + 文件 IO |
| presentation | `presentation/` | R3F 组件（7 个） |

---

## 公共 API

### 顶层组件
- `Blockout3DPanel` — 顶层容器组件（BeatDetailEditor 集成入口）

### 数据类型（持久化到 StoryBeat.blockout3D）
- `BlockoutScene` — provider-agnostic 场景图
- `Mannequin` — 人偶 placeholder
- `CameraKeyframe` / `CameraPath` — 镜头轨迹关键帧
- `PrimitiveShape` / `GroundPlane` / `LightingPreset` / `ShotCamera`

### 服务函数
- `buildScene` / `disposeScene` — Three.js Scene 构建/释放
- `renderFrame` / `renderFrameSequence` / `renderKeyframeSet` — WebGL 渲染
- `exportAnimatic` / `exportPreviewSnapshot` — ffmpeg 合成视频 / 单帧 PNG
- `exportSceneAsGlb` / `exportSceneAsJson` / `importSceneFromJson` — 场景 IO
- `adaptToSeedanceInput` / `validateForSeedance` — Seedance 2.5 适配器
- `adaptToFallbackKeyframes` / `validateForFallback` — fallback 适配器

### 预设库
- `SCENE_PRESETS` / `createSceneFromPreset` — 7 种预设场景（空房间/街角/办公室/公园/电影特写/远景/摄影棚）
- `POSE_PRESETS` — 10 种姿势预设
- `HEIGHT_PRESETS` — 5 种身高预设

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
