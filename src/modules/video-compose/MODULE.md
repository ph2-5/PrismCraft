# video-compose 模块

> 视频片段合成（Task 4.3）：将多个已完成视频任务或本地视频文件按顺序拼接，支持 15 种转场效果。

## 模块概述

提供视频片段合成的 UI 面板与底层服务。片段来源包括已完成的视频任务（来自 `videoTaskStorage`）和用户选择的本地视频文件。合成调用复用 `@/modules/ffmpeg-runner` 的 `mergeVideos`，不重新实现 ffmpeg 调用。合成结果返回本地路径，由 UI 层负责预览。

## 架构

```
VideoComposePanel（UI）
  → use-video-compose（hook，管理状态）
    → video-composer（本服务）
      → @/modules/ffmpeg-runner.mergeVideos
        → HTTP /api/ffmpeg/execute
          → ffmpeg-handler（主进程）
```

## 子域

| 子域 | 路径 | 说明 |
|------|------|------|
| services | `./services/video-composer.ts` | 合成服务：列出片段、合成片段、检查 ffmpeg 可用性、选择本地文件 |
| hooks | `./hooks/use-video-compose.ts` | React Hook：管理片段列表、拖拽排序、转场配置、合成进度 |
| presentation | `./presentation/VideoComposePanel.tsx` | 合成面板 UI 组件 |
| page | `./page.tsx` | 页面入口 |

## 公共 API

通过 `@/modules/video-compose` 导入。

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

## Hook 返回值详情

`useVideoCompose()` 返回 `UseVideoComposeResult`，包含以下字段（详细签名见 `hooks/use-video-compose.ts`）：

| 类别 | 字段 / 方法 | 说明 |
|------|------------|------|
| 状态 | segments | 已选片段（按合成顺序排列） |
| 状态 | availableSegments | 可用片段（已完成的视频任务） |
| 状态 | transition | 转场效果 |
| 状态 | transitionDuration | 转场时长 |
| 状态 | isLoadingAvailable | 是否正在加载可用片段 |
| 状态 | isComposing | 是否正在合成 |
| 状态 | composeResult | 合成结果 |
| 状态 | ffmpegAvailable | ffmpeg 是否可用 |
| 状态 | error | 错误信息 |
| 操作 | loadAvailable(storyId?) | 加载可用片段 |
| 操作 | addSegment(segment) | 添加片段到合成列表 |
| 操作 | addLocalFiles() | 添加本地文件 |
| 操作 | removeSegment(id) | 移除片段 |
| 操作 | moveSegment(from, to) | 移动片段顺序 |
| 操作 | reorderSegments(fromId, toId) | 拖拽排序（HTML5 drag-and-drop） |
| 操作 | clearSegments() | 清空片段列表 |
| 操作 | compose() | 执行合成 |
| 操作 | clearResult() | 清除结果 |

默认值：transition = "fade"，transitionDuration = 0.5

## 依赖

| 依赖 | 用途 |
|------|------|
| `@/modules/ffmpeg-runner` | `mergeVideos` / `checkFfmpegAvailable`（合成实现） |
| `@/infrastructure/di` | `container.videoTaskStorage`（获取已完成视频任务） |
| `@/domain/schemas` | `VideoTask` 类型 |
| `@/shared/error-logger` | `errorLogger`（hook 中错误日志） |
| `@/shared/constants` | `t()` 国际化 |
| `electronAPI.openFileDialog` | 选择本地视频文件（IPC，desktop-only 允许直接调用） |

## 边界约束

- 合成实现复用 `mergeVideos`，本模块不直接调用 ffmpeg 或 HTTP `/api/ffmpeg/*`
- `pickLocalVideoFiles` 直接使用 `electronAPI.openFileDialog`（desktop-only 允许的 IPC 之一）
- 片段来源：已完成的视频任务（`task.status === "completed" && task.localVideoPath`）+ 本地文件
- 合成结果（`outputPath`）为本地文件路径，UI 层负责预览
- 片段去重：`addSegment` 通过 `id` 去重；`addLocalFiles` 通过 `id`（`file-{path}`）去重
- 合成前置条件：`segments.length >= 2`，否则返回错误 `compose.needTwoSegments`
- 不持久化片段列表或合成结果（每次进入页面重新加载）
