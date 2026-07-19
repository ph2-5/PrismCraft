# blockout-3d 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| domain/scene-schema | 🟢 低 | 纯类型 + 工厂函数，零外部依赖 |
| domain/mannequin-types | 🟢 低 | 纯类型 + 预设常量 |
| domain/camera-path-types | 🟢 低 | 纯类型 + 校验函数 |
| domain/preset-library | 🟢 低 | 纯预设数据 |
| services/camera-animator | 🟡 中 | 数学插值算法（lerp/bezier2/orbit），需注意边界条件 |
| services/mannequin-service | 🟢 低 | 纯数据操作函数 |
| services/seedance-adapter | 🟡 中 | Seedance 2.5 适配，需同步 provider 协议 |
| services/fallback-adapter | 🟡 中 | 关键帧图集适配，需处理路径填充 |
| services/scene-builder | 🔴 高 | Three.js Scene 构建，GPU 资源管理（必须 dispose） |
| services/render-service | 🔴 高 | WebGL 渲染，需检测可用性，长耗时操作 |
| services/animatic-exporter | 🔴 高 | ffmpeg 合成，长耗时操作，文件 IO |
| services/scene-io | 🔴 高 | GLB/GLTF/OBJ 导入，外部文件解析（可能含恶意数据） |
| presentation/Blockout3DCanvas | 🔴 高 | R3F Canvas，useMemo 必须在 early return 之前（R175 CI 规则） |
| presentation/*（其他） | 🟡 中 | UI 组件，依赖 hooks/services |

## 子域依赖图

```
domain/scene-schema.ts          → 无依赖（纯类型）
domain/mannequin-types.ts       → 无依赖（纯类型 + 常量）
domain/camera-path-types.ts     → 无依赖（纯类型 + 校验）
domain/preset-library.ts        → scene-schema（创建 BlockoutScene）
  ↑
services/camera-animator.ts     → domain/camera-path-types（纯逻辑，无 Three.js）
services/mannequin-service.ts   → domain/mannequin-types, scene-schema（纯逻辑）
services/seedance-adapter.ts    → domain/* （纯逻辑，无 Three.js）
services/fallback-adapter.ts    → domain/* （纯逻辑，无 Three.js）
  ↑
services/scene-builder.ts       → domain/* + three + @/shared/file-http
services/render-service.ts      → domain/* + three + @/shared/file-http
services/animatic-exporter.ts   → services/render-service + @/modules/ffmpeg-runner
services/scene-io.ts            → domain/* + three + @/shared/file-http
  ↑
presentation/*                  → services/* + domain/* + @react-three/fiber + @react-three/drei
  ↑
index.ts（barrel）
  ↑
@/modules/storyboard（BeatDetailEditor 集成 Blockout3DPanel）
```

## 关键不变量

- **Provider-agnostic**：`BlockoutScene` 必须 JSON 可序列化，可持久化到 `StoryBeat.blockout3D`
- **Three.js 动态加载**：首屏不加载 Three.js，通过动态 import 在进入 3D Tab 时加载
- **WebGL 降级**：WebGL 不可用时显示降级文案，不影响其他功能
- **资源释放**：`buildScene` 返回的 `BuiltScene` 必须通过 `disposeScene` 释放 GPU 资源
- **React Hooks 规则**：`Blockout3DCanvas` 中所有 `useMemo` 必须在 early return 之前调用（已修复 R175 CI 阻塞）

## 常见修改场景

### 1. 新增预设场景
- 修改文件：`domain/preset-library.ts`（`SCENE_PRESETS` / `SCENE_PRESET_LIST`）
- 同步更新：MODULE.md 预设库部分的描述
- 测试：手动验证 `createSceneFromPreset` 返回有效场景

### 2. 修改镜头轨迹插值算法
- 修改文件：`services/camera-animator.ts`
- 检查不变量：插值函数必须处理 t=0 和 t=1 的边界；`sampleCameraPoses` 必须返回连续姿态
- 测试：`camera-animator.test.ts`

### 3. 修改 Seedance 适配器
- 修改文件：`services/seedance-adapter.ts`
- 检查不变量：`adaptToSeedanceInput` 必须返回 GLB + JSON + MP4 三件套；`validateForSeedance` 必须检查必需字段
- 测试：`seedance-adapter.test.ts`

### 4. 修改 Three.js 渲染逻辑
- 修改文件：`services/render-service.ts` 或 `services/scene-builder.ts`
- 检查不变量：`buildScene` 后必须调用 `disposeScene`；WebGL 不可用时优雅降级
- 测试：手动验证渲染结果 + 内存泄漏检查

### 5. 修改 Blockout3DCanvas 组件
- 修改文件：`presentation/Blockout3DCanvas.tsx`
- **关键**：所有 `useMemo` / `useEffect` / `useState` 必须在 early return 之前调用（react-hooks/rules-of-hooks）
- 测试：`npx eslint src/modules/blockout-3d/presentation/Blockout3DCanvas.tsx`

## 边界约束

- **依赖方向**：domain → 无依赖；services → domain + three + file-http + ffmpeg-runner；presentation → services + domain + R3F
- **禁止**：domain/ 导入 three 或任何外部模块
- **禁止**：services/ 直接调用 `electronAPI.*`（文件操作走 `@/shared/file-http`）
- **禁止**：presentation/ 在 early return 之后调用 React Hooks
- **必须**：Three.js 通过动态 import 加载（`import("three")`）
- **必须**：GPU 资源通过 `disposeScene` 释放

## 测试验证

- 测试命令：`npx vitest run src/modules/blockout-3d`
- 关键测试：
  - `scene-builder.test.ts` — 构建/释放/统计
  - `camera-animator.test.ts` — 插值/采样/边界
  - `seedance-adapter.test.ts` — 适配/校验
  - `fallback-adapter.test.ts` — 适配/校验/帧路径填充
- CI 检查：`npx eslint src/modules/blockout-3d/presentation/Blockout3DCanvas.tsx`（react-hooks/rules-of-hooks）

## 集成点

### StoryBeat 持久化
- `BlockoutScene` 序列化到 `StoryBeat.blockout3D` 字段（`storyBeatSchema.extend({ blockout3D })`）
- 版本字段 `version: 1` 用于向前兼容
- 通过 `validateBlockoutScene` 校验从 JSON 导入的数据

### BeatDetailEditor 集成
- 在 BeatDetailEditor 中新增 "3D 白模" Tab
- Tab 内容为 `Blockout3DPanel`
- 场景数据持久化到 `beat.blockout3D`

### GenerationAsset 扩展
- 新增 asset type: `preview_3d_snapshot` / `blockout_animatic`
- 通过 `assetTypeEnum` 添加
