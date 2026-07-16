# Agent Tools Media 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| video | 🔴 高 | 视频任务管理（创建/取消/恢复/批量）、长耗时（30min 超时）、container.videoTaskStorage 读写 |
| video-post | 🔴 高 | 视频后期合成（合并/转场/字幕/缩略图）、调用 ffmpeg-runner、长耗时操作 |
| audio | 🟡 中 | 音频处理（混音/调速/归一化/降噪/分割）、调用 ffmpeg-runner |
| barrel | 🟢 低 | 仅 index.ts 聚合导出 |

## 子域依赖图

```
audio-tools.ts（5 个）
  ← @/domain/types/agent-tools、@/shared/constants/tool-timeouts
  ← @/modules/ffmpeg-runner（音频操作）
video-tools.ts（7 个）
  ← 同上 + @/infrastructure/di（container.videoTaskStorage）、@/domain/schemas（VideoTask）
video-post-tools.ts（9 个）
  ← @/modules/ffmpeg-runner（视频后期）
  ↑
index.ts（barrel）
  ↑
@/modules/agent/tools/index.ts（通过 toolRegistry 注册）
```

- 三个工具文件彼此独立，均为叶子工具集，无 agent/services 依赖
- FFmpeg 操作统一通过 `@/modules/ffmpeg-runner` 调用
- 视频任务类工具超时 30min

## 公共 API

### Audio Tools（5 个）
- `mixAudioTool` / `adjustAudioSpeedTool` / `normalizeAudioTool` / `removeNoiseTool` / `splitAudioTool`
- `audioTools` — 所有音频工具数组

### Video Tools（7 个）
- `createVideoTaskTool` / `listVideoTasksTool` / `getVideoTaskTool` / `queryVideoStatusTool`
- `cancelVideoTaskTool` / `recoverVideoTaskTool` / `batchCreateVideoTasksTool`
- `videoTools` — 所有视频任务工具数组

### Video Post Tools（9 个）
- `mergeVideosTool` / `trimVideoTool` / `addTransitionTool` / `addSubtitleTool`
- `adjustVideoSpeedTool` / `extractAudioTool` / `replaceAudioTool`
- `generateThumbnailTool` / `composeFinalVideoTool`
- `videoPostTools` — 所有视频后期工具数组

## 常见修改场景

### 1. 新增视频任务管理工具
- 修改文件：`video-tools.ts`，在 `index.ts` 追加 export
- 检查不变量：视频任务超时 30min、通过 `container.videoTaskStorage` 读写、批量操作通过 maxItems 限制规模
- 测试：`npx vitest run src/modules/agent-tools-media/__tests__/video-tools.test.ts`

### 2. 修改视频后期合成工具
- 修改文件：`video-post-tools.ts`
- 检查不变量：FFmpeg 操作通过 `@/modules/ffmpeg-runner` 调用（不直接 HTTP /api/ffmpeg/*）
- 测试：`npx vitest run src/modules/agent-tools-media/__tests__/video-post-tools.test.ts`

### 3. 修改音频处理工具
- 修改文件：`audio-tools.ts`
- 检查不变量：音频操作通过 `@/modules/ffmpeg-runner` 调用
- 测试：`npx vitest run src/modules/agent-tools-media/__tests__/audio-tools.test.ts`

## 边界约束

- **依赖方向**：可导入 `@/domain/*`、`@/shared/*`（constants）、`@/infrastructure/di`、`@/modules/ffmpeg-runner`
- **禁止导入**：`@/modules/agent/*`（agent 依赖本模块工具数组，避免循环）、`@/infrastructure/*`（除 DI）、`@/modules/*/*/*`（深路径）
- **禁止**：直接调用 `electronAPI.*`
- **禁止**：直接调用 HTTP `/api/ffmpeg/*`（必须通过 `@/modules/ffmpeg-runner`）
- **必须**：工具类型从 `@/domain/types/agent-tools` 导入
- **必须**：FFmpeg 操作通过 `@/modules/ffmpeg-runner` 调用

## 测试验证

- 测试命令：`npx vitest run src/modules/agent-tools-media`
- 关键测试文件：
  - `__tests__/audio-tools.test.ts` — 音频处理工具
  - `__tests__/video-tools.test.ts` — 视频任务管理工具
  - `__tests__/video-post-tools.test.ts` — 视频后期合成工具
