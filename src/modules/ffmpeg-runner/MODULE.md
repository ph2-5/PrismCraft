# ffmpeg-runner 模块

> FFmpeg 操作模块，从 agent 模块拆分而来。

## 模块概述

封装渲染进程与主进程 ffmpeg-handler 之间的 HTTP 通信，提供 13 个音视频操作的高级 API。所有方法返回 `Result<T>` 模式（`{ ok: true, value } | { ok: false, error }`），失败不抛异常，由调用方决定如何处理。

## 子域

| 子域 | 路径 | 说明 |
|------|------|------|
| services | `./services/ffmpeg-service.ts` | FFmpeg 操作服务实现（probe / 音频 / 视频 / 组合） |

## 依赖

- `@/config/constants` — API_SERVER_PORT, ELECTRON_APP_HEADERS
- `@/shared/file-http` — getConfig, getCacheDirectory, writeFile, deleteFile
- 原生 `fetch` HTTP（`/api/ffmpeg/execute`, `/api/ffmpeg/probe`）

无任何模块间依赖，零 agent 模块内部依赖。

## 公共 API

通过 `@/modules/ffmpeg-runner` 导入。

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

## 边界约束

- 不依赖任何其他模块（modules/*）
- 不直接调用 electronAPI；文件操作走 `@/shared/file-http`
- 内部辅助函数（executeFfmpegCommand, probeVideoDuration, mapTransitionToXfade, resolveOutputPath, buildAtempoChain, formatSrtTime）不导出
