# ffmpeg-runner 模块 ✅

> FFmpeg 操作模块，从 agent 模块拆分而来。

> **状态图例**：✅ 已完成并可用 · 🧪 测试中 · 🚧 开发中 · 📐 规划中/待实现

## 模块概述

封装渲染进程与主进程 ffmpeg-handler 之间的 HTTP 通信，提供 13 个音视频操作的高级 API。所有方法返回 `Result<T>` 模式（`{ ok: true, value } | { ok: false, error }`），失败不抛异常，由调用方决定如何处理。

## 子域

| 子域 | 状态 | 路径 | 说明 |
|------|:----:|------|------|
| services | ✅ | `./services/ffmpeg-service.ts` | FFmpeg 操作服务实现（probe / 音频 / 视频 / 组合） |

## 依赖

- `@/config/constants` — API_SERVER_PORT, ELECTRON_APP_HEADERS
- `@/shared/file-http` — getConfig, getCacheDirectory, writeFile, deleteFile
- 原生 `fetch` HTTP（`/api/ffmpeg/execute`, `/api/ffmpeg/probe`）

无任何模块间依赖，零 agent 模块内部依赖。

## 公共 API

通过 `@/modules/ffmpeg-runner` 导入。

### ✅ 可用性检查
- `checkFfmpegAvailable` — 检查 ffmpeg 是否可用（带缓存，1 分钟 TTL）
- `resetFfmpegCache` — 重置可用性缓存（配置变更后调用）
- `FfmpegResult` — FFmpeg 操作结果类型（{ ok: true, value } | { ok: false, error }）
- `executeFfmpeg` — 低级 ffmpeg 命令执行（自定义滤镜图等高级用法，调用方自行构造 args）

### ✅ 音频操作（5 个）
- `mixAudio` — 多轨混音（audioPaths, volumes, outputPath?）
- `adjustAudioSpeed` — 调整音频速度（audioPath, speed, preservePitch?, outputPath?）
- `normalizeAudio` — 音量标准化（audioPath, targetLevel?, outputPath?）
- `removeNoise` — 降噪（audioPath, intensity?, outputPath?）
- `splitAudio` — 分割音频（audioPath, segments, outputDir?）

### ✅ 视频操作（8 个）
- `mergeVideos` — 合并多段视频（videoPaths, transition?, transitionDuration?, outputPath?）
- `trimVideo` — 剪辑视频片段（videoPath, startTime, endTime, outputPath?）
- `addTransition` — 添加转场效果（videoPath, transitionType, position, duration?, outputPath?）
- `addSubtitle` — 添加字幕（videoPath, subtitles, options?）
- `adjustVideoSpeed` — 调整视频速度（videoPath, speed, preserveAudio?, outputPath?）
- `extractAudio` — 提取音频（videoPath, outputFormat?, startTime?, endTime?, outputPath?）
- `replaceAudio` — 替换音频轨道（videoPath, audioPath, audioStartTime?, volume?, outputPath?）
- `generateThumbnail` — 生成缩略图（videoPath, timePoint?, width?, outputPath?）

### ✅ 组合操作
- `composeFinalVideo` — 一键合成最终视频（合并 + 背景音乐 + 字幕 + 转场）

## 边界约束

- 不依赖任何其他模块（modules/*）
- 不直接调用 electronAPI；文件操作走 `@/shared/file-http`
- 内部辅助函数（executeFfmpegCommand 内部实现、probeVideoDuration、mapTransitionToXfade、resolveOutputPath、buildAtempoChain、formatSrtTime）不导出
