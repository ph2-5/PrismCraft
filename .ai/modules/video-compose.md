# video-compose 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| services/video-composer | 🔴 高 | 合成服务调用 ffmpeg-runner.mergeVideos、长耗时操作、片段去重、合成前置条件校验（segments.length >= 2） |
| hooks/use-video-compose | 🟡 中 | React Hook 管理合成状态、拖拽排序（HTML5 drag-and-drop）、合成进度、错误日志 |
| presentation/VideoComposePanel | 🟢 低 | 合成面板 UI 组件，通过 hook 获取状态 |
| page | 🟢 低 | 页面入口，无业务逻辑 |

## 子域依赖图

```
services/video-composer.ts
  ← @/modules/ffmpeg-runner（mergeVideos / checkFfmpegAvailable）
  ← @/infrastructure/di（container.videoTaskStorage 获取已完成视频任务）
  ← @/domain/schemas（VideoTask 类型）
  ← electronAPI.openFileDialog（desktop-only 允许的 IPC）
hooks/use-video-compose.ts
  ← services/video-composer
  ← @/shared/error-logger（errorLogger）
  ← @/shared/constants（t() 国际化）
presentation/VideoComposePanel.tsx
  ← hooks/use-video-compose
  ↑
index.ts（barrel）
page.tsx（页面入口）
```

- 四个子域自下而上：services → hooks → presentation → page
- 合成实现复用 `mergeVideos`，本模块不直接调用 ffmpeg 或 HTTP `/api/ffmpeg/*`
- `pickLocalVideoFiles` 直接使用 `electronAPI.openFileDialog`（desktop-only 允许的 IPC 之一）
- 片段来源：已完成的视频任务（`task.status === "completed" && task.localVideoPath`）+ 本地文件
- 不持久化片段列表或合成结果（每次进入页面重新加载）

## 公共 API

### UI 组件
- `VideoComposePanel` — 视频合成面板组件

### 服务函数
- `listCompletedVideoTasks` — 列出已完成的视频任务作为可用合成片段（按 storyId 可选过滤）
- `composeVideoSegments` — 合成已排序的片段（至少 2 个），返回 ComposeResult
- `checkComposerAvailable` — 检查 ffmpeg 是否可用，返回 { available, version?, path? }
- `pickLocalVideoFiles` — 通过 OpenFileDialog 选择本地视频文件，返回文件路径数组

### 常量
- `TRANSITION_OPTIONS` — 支持的转场效果列表（共 15 种：none / fade / cut / dissolve / fadeblack / fadewhite / slideleft / slideright / slideup / slidedown / wipeleft / wiperight / circleopen / circleclose / zoomin）

### 类型
- `VideoSegment` — 可合成的视频片段（id / label / path / source: "task" | "file" / taskId? / storyId? / beatId? / beatTitle?）
- `ComposeResult` — 合成结果（success / outputPath? / error? / metadata?）
- `TransitionOption` — 转场选项（value / label）
- `UseVideoComposeResult` — Hook 返回值类型

### Hook
- `useVideoCompose` — 管理合成状态的 Hook
- 默认值：transition = "fade"，transitionDuration = 0.5

## 常见修改场景

### 1. 修改合成服务逻辑
- 修改文件：`services/video-composer.ts`
- 检查不变量：合成实现复用 `@/modules/ffmpeg-runner.mergeVideos`（不直接调用 ffmpeg 或 HTTP `/api/ffmpeg/*`）；合成前置条件 `segments.length >= 2`，否则返回错误 `compose.needTwoSegments`；合成结果（outputPath）为本地文件路径
- 测试：手动验证合成面板

### 2. 修改片段来源或去重逻辑
- 修改文件：`services/video-composer.ts`（`listCompletedVideoTasks` / `pickLocalVideoFiles`）、`hooks/use-video-compose.ts`（`addSegment` / `addLocalFiles`）
- 检查不变量：已完成视频任务过滤条件 `task.status === "completed" && task.localVideoPath`；`addSegment` 通过 `id` 去重；`addLocalFiles` 通过 `id`（`file-{path}`）去重；`pickLocalVideoFiles` 直接使用 `electronAPI.openFileDialog`
- 测试：手动验证片段添加和去重

### 3. 修改转场选项或合成参数
- 修改文件：`services/video-composer.ts`（`TRANSITION_OPTIONS`）、`hooks/use-video-compose.ts`（transition / transitionDuration 状态）
- 检查不变量：支持 15 种转场效果；默认 transition = "fade"，transitionDuration = 0.5
- 测试：手动验证转场效果选择

### 4. 修改拖拽排序或 UI 交互
- 修改文件：`hooks/use-video-compose.ts`（`moveSegment` / `reorderSegments`）、`presentation/VideoComposePanel.tsx`
- 检查不变量：`reorderSegments` 支持 HTML5 drag-and-drop；`moveSegment(from, to)` 程序化移动
- 测试：手动验证拖拽排序

## 边界约束

- **依赖方向**：可导入 `@/modules/ffmpeg-runner`、`@/infrastructure/di`、`@/domain/*`、`@/shared/*`（error-logger、constants）
- **允许**：`electronAPI.openFileDialog`（desktop-only 允许的 IPC 之一）
- **禁止导入**：其他 `@/modules/*`（除 ffmpeg-runner）、`@/infrastructure/*`（除 di）、`@/modules/*/*/*`（深路径）
- **禁止**：直接调用 ffmpeg 或 HTTP `/api/ffmpeg/*`（必须通过 `@/modules/ffmpeg-runner`）
- **禁止**：持久化片段列表或合成结果（每次进入页面重新加载）
- **必须**：合成实现复用 `mergeVideos`
- **必须**：合成前置条件 `segments.length >= 2`

## 测试验证

- 测试命令：`npx vitest run src/modules/video-compose`
- 关键测试：本模块无独立测试目录，需手动验证合成面板 UI 和合成流程
