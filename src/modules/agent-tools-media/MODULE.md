<!-- AI: Before modifying this module, read contract.json for invariants -->

# Agent Tools - Media Module

> 音频、视频任务、视频后期工具模块 — 从 agent/tools/ 拆分而来（阶段3-2）。

## 模块概览

- **定位**：从 agent 模块拆分出的独立工具集模块，包含音频处理、视频任务管理、视频后期合成工具
- **核心**：21 个工具实现（5 个 audio + 7 个 video + 9 个 video-post），通过 `toolRegistry` 注册到 agent
- **依赖**：仅依赖 `@/domain/types/agent-tools`、`@/shared/constants/tool-timeouts`、`@/modules/ffmpeg-runner`、`@/infrastructure/di`、`@/domain/schemas`

## 背景

这些工具均为叶子工具集，无 `agent/services` 依赖，因此可独立成模块。从 `@/modules/agent/tools/` 拆分后，agent 模块通过 `@/modules/agent-tools-media` 导入工具数组并注册。

## 子域

| 子域 | 路径 | 职责 |
|------|------|------|
| audio | `audio-tools.ts` | 音频处理工具（混音、调速、归一化、降噪、分割） |
| video | `video-tools.ts` | 视频任务管理工具（创建、查询、取消、恢复、批量） |
| video-post | `video-post-tools.ts` | 视频后期工具（合并、裁剪、转场、字幕、缩略图、合成） |

## Public API

### Audio Tools（5 个）

- `mixAudioTool` — 混音
- `adjustAudioSpeedTool` — 调整音频速度
- `normalizeAudioTool` — 音频归一化
- `removeNoiseTool` — 降噪
- `splitAudioTool` — 分割音频
- `audioTools` — 所有音频工具数组

### Video Tools（7 个）

- `createVideoTaskTool` — 创建视频任务
- `listVideoTasksTool` — 列出视频任务
- `getVideoTaskTool` — 获取视频任务详情
- `queryVideoStatusTool` — 查询视频任务状态
- `cancelVideoTaskTool` — 取消视频任务
- `recoverVideoTaskTool` — 恢复视频任务
- `batchCreateVideoTasksTool` — 批量创建视频任务
- `videoTools` — 所有视频任务工具数组

### Video Post Tools（9 个）

- `mergeVideosTool` — 合并视频
- `trimVideoTool` — 裁剪视频
- `addTransitionTool` — 添加转场
- `addSubtitleTool` — 添加字幕
- `adjustVideoSpeedTool` — 调整视频速度
- `extractAudioTool` — 提取音频
- `replaceAudioTool` — 替换音频
- `generateThumbnailTool` — 生成缩略图
- `composeFinalVideoTool` — 合成最终视频
- `videoPostTools` — 所有视频后期工具数组

## 边界约束

- **禁止**：本模块导入 `@/modules/agent/*`（agent 模块依赖本模块的工具数组，避免循环）
- **禁止**：本模块导入 `@/infrastructure/*`（除 `@/infrastructure/di` 用于 container.videoTaskStorage）
- **必须**：工具类型从 `@/domain/types/agent-tools` 导入
- **必须**：FFmpeg 操作通过 `@/modules/ffmpeg-runner` 调用

## 依赖方向

```
agent-tools-media → @/domain/types/agent-tools（类型）
                  → @/shared/constants/tool-timeouts
                  → @/modules/ffmpeg-runner（音频与视频后期）
                  → @/infrastructure/di（container.videoTaskStorage）
                  → @/domain/schemas（VideoTask 类型）
```
