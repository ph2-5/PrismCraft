# ffmpeg-runner 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| services/ffmpeg-service | 🔴 高 | 13 个音视频操作、HTTP 通信（/api/ffmpeg/execute, /api/ffmpeg/probe）、长耗时操作、Result<T> 模式、可用性缓存（1 分钟 TTL） |

## 子域依赖图

```
services/ffmpeg-service.ts
  ← @/config/constants（API_SERVER_PORT, ELECTRON_APP_HEADERS）
  ← @/shared/file-http（getConfig, getCacheDirectory, writeFile, deleteFile）
  ← 原生 fetch HTTP（/api/ffmpeg/execute, /api/ffmpeg/probe）
  ↑
index.ts（barrel，export *）
  ↑
@/modules/agent-tools-media（audio-tools / video-post-tools）
@/modules/video-compose（合成服务复用 mergeVideos）
```

- 单一 services 子域，结构简单
- 无任何模块间依赖，零 agent 模块内部依赖
- 所有方法返回 `Result<T>` 模式（`{ ok: true, value } | { ok: false, error }`），失败不抛异常
- 内部辅助函数（executeFfmpegCommand / probeVideoDuration / mapTransitionToXfade / resolveOutputPath / buildAtempoChain / formatSrtTime）不导出

## 公共 API

### 可用性检查
- `checkFfmpegAvailable()` — 检查 ffmpeg 是否可用（带缓存，1 分钟 TTL）
- `resetFfmpegCache()` — 重置可用性缓存（配置变更后调用）

### 音频操作（5 个）
- `mixAudio(audioPaths, volumes, outputPath?)` — 多轨混音
- `adjustAudioSpeed(audioPath, speed, preservePitch?, outputPath?)` — 调整音频速度
- `normalizeAudio(audioPath, targetLevel?, outputPath?)` — 音量标准化
- `removeNoise(audioPath, intensity?, outputPath?)` — 降噪
- `splitAudio(audioPath, segments, outputDir?)` — 分割音频

### 视频操作（8 个）
- `mergeVideos(videoPaths, transition?, transitionDuration?, outputPath?)` — 合并多段视频
- `trimVideo(videoPath, startTime, endTime, outputPath?)` — 剪辑视频片段
- `addTransition(videoPath, transitionType, position, duration?, outputPath?)` — 添加转场效果
- `addSubtitle(videoPath, subtitles, options?)` — 添加字幕
- `adjustVideoSpeed(videoPath, speed, preserveAudio?, outputPath?)` — 调整视频速度
- `extractAudio(videoPath, outputFormat?, startTime?, endTime?, outputPath?)` — 提取音频
- `replaceAudio(videoPath, audioPath, audioStartTime?, volume?, outputPath?)` — 替换音频轨道
- `generateThumbnail(videoPath, timePoint?, width?, outputPath?)` — 生成缩略图

### 组合操作
- `composeFinalVideo(videoPaths, options?)` — 一键合成最终视频（合并 + 背景音乐 + 字幕 + 转场）

## 常见修改场景

### 1. 新增音视频操作
- 修改文件：`services/ffmpeg-service.ts`，在 `index.ts` 通过 `export *` 自动导出
- 检查不变量：返回 `Result<T>` 模式（失败不抛异常）；通过 `executeFfmpegCommand` 调用 HTTP `/api/ffmpeg/execute`；输出路径通过 `resolveOutputPath` 解析到 cacheDirectory
- 测试：手动验证新操作

### 2. 修改 ffmpeg 可用性检查
- 修改文件：`services/ffmpeg-service.ts`（`checkFfmpegAvailable` / `resetFfmpegCache`）
- 检查不变量：可用性检查带缓存（1 分钟 TTL）；配置变更后需调用 `resetFfmpegCache`
- 测试：手动验证配置变更后可用性刷新

### 3. 修改转场映射或 atempo 链构建
- 修改文件：`services/ffmpeg-service.ts`（`mapTransitionToXfade` / `buildAtempoChain`）
- 检查不变量：`mapTransitionToXfade` 将友好转场名映射到 xfade 滤镜参数；`buildAtempoChain` 处理 speed > 2.0 的 atempo 链
- 测试：手动验证转场效果和音频变速

### 4. 修改合成最终视频逻辑
- 修改文件：`services/ffmpeg-service.ts`（`composeFinalVideo`）
- 检查不变量：一键合成（合并 + 背景音乐 + 字幕 + 转场）；复用 `mergeVideos` 等基础操作
- 测试：手动验证合成结果

## 边界约束

- **依赖方向**：可导入 `@/config/constants`、`@/shared/*`（file-http）
- **禁止导入**：任何 `@/modules/*`（无模块间依赖）、`@/infrastructure/*`
- **禁止**：直接调用 `electronAPI.*`（文件操作走 `@/shared/file-http`）
- **必须**：所有方法返回 `Result<T>` 模式（失败不抛异常，由调用方决定如何处理）
- **必须**：文件操作通过 `@/shared/file-http`（getConfig / getCacheDirectory / writeFile / deleteFile）
- **必须**：内部辅助函数不导出

## 测试验证

- 测试命令：`npx vitest run src/modules/ffmpeg-runner`
- 关键测试：本模块无独立测试目录，由消费者模块测试覆盖（`src/modules/agent-tools-media/__tests__/`、`src/modules/video-compose` 集成验证）
