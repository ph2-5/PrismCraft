# shot/shot-comparison 子域 ✅

> 分镜对比视图（Task 4.4）：并排展示同一分镜的多个生成版本，支持视频/关键帧同步对比、提示词差异高亮、选用与归档。

> **状态图例**：✅ 已完成并可用 · 🧪 测试中 · 🚧 开发中 · 📐 规划中/待实现

## 模块概述

提供分镜版本对比的 UI 组件与 diff 工具。`ShotCompareView` 为顶层容器，管理左右两侧 `ComparePanel` 的版本切换与同步播放；`diffText` / `countDifferences` 用于将两个版本的 prompt 文本按行对比，生成可视化的差异行列表。版本数据（`ShotVersion`）由调用方提供，本子域不负责版本持久化。

## 子域

本子域为 `shot` 模块下的叶子子域，无内部子目录。

| 文件 | 说明 |
|------|------|
| `ShotCompareView.tsx` | 顶层对比视图容器，管理左右版本选择与同步播放 |
| `ComparePanel.tsx` | 单个对比面板（左/右），展示单个版本的视频/图片与元数据 |
| `prompt-diff.ts` | 提示词 diff 工具：`diffText` / `countDifferences` |
| `types.ts` | 类型定义：`ShotVersion` / `ShotVersionType` / `ShotVersionParameters` / `DiffLine` |

## 公共 API

通过 `@/modules/shot` 导入（在 `shot/index.ts` 的 "9. 分镜对比视图" 分组中）。

### ✅ UI 组件
- `ShotCompareView` — 顶层对比视图容器
  - Props: `ShotCompareViewProps`
    - `shotId: string` — 分镜 ID
    - `versions: ShotVersion[]` — 所有版本
    - `onSelect: (versionId: string) => void` — 选用某版本（设为正式版本）
    - `onArchive: (versionId: string) => void` — 归档某版本
- `ComparePanel` — 单个对比面板
  - Props: `ComparePanelProps`
    - `side: "left" | "right"` — 左侧或右侧
    - `version: ShotVersion` — 版本数据
    - `isSelected: boolean` — 是否为当前选中版本
    - `onSelect: () => void` — 选中此版本
    - `onArchive: () => void` — 归档此版本
    - `videoRef?: React.RefObject<HTMLVideoElement | null>` — 同步播放 ref（由父组件控制同步）
    - `playSignal?: { playing: boolean; time?: number; nonce: number }` — 同步播放控制信号

### ✅ 工具函数
- `diffText(left, right)` — 将两段文本按行对比，返回 `DiffLine[]`（`type: "same" | "left" | "right"`）
- `countDifferences(diffLines)` — 统计差异行数量

### ✅ 类型
- `ShotVersion` — 分镜的一个生成版本（versionId / taskId / type / url / prompt / parameters / createdAt / isArchived? / label?）
- `ShotVersionType` — 版本类型联合（`"video" | "keyframe"`）
- `ShotVersionParameters` — 版本生成参数（model? / duration? / resolution? / style? / providerId? / providerModelId?）
- `DiffLine` — Diff 行（text / type: "same" | "left" | "right" / leftLine? / rightLine?）

## 依赖

| 依赖 | 用途 |
|------|------|
| `@/domain/schemas` | 复用项目类型约定（如有） |
| `@/shared/constants` | `t()` 国际化（如有 UI 文案） |

## 边界约束

- 本子域为纯展示与 diff 计算组件，不持久化版本数据
- 版本数据（`versions`）由调用方提供，调用方负责从 `videoTaskStorage` 或其他来源组装 `ShotVersion[]`
- `ComparePanel` 通过 `playSignal` 与 `videoRef` 实现左右同步播放，同步逻辑由父组件 `ShotCompareView` 控制
- `diffText` 基于行级对比，不做 token 级或字符级 diff
- 不调用 IPC、不调用 electronAPI、不调用 HTTP API
- 不导入 `story` / `video` 等其他模块（遵守 shot 模块 INV-8：禁止跨模块依赖）
