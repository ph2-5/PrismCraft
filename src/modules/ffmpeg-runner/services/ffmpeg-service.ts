/**
 * ffmpeg 服务（渲染进程侧）— barrel 文件
 *
 * 职责：
 * - 封装与主进程 ffmpeg-handler 的 HTTP 通信
 * - 提供 13 个音视频操作的高级 API
 * - 自动解析输出路径（未指定时写入缓存目录）
 * - 缓存 ffmpeg 可用性检查结果（避免每次操作都 probe）
 *
 * 架构：
 *   工具（audio-tools / video-post-tools）
 *     → ffmpeg-service（本文件，barrel）
 *       → ffmpeg-core / ffmpeg-audio / ffmpeg-video / ffmpeg-compose
 *         → HTTP /api/ffmpeg/execute
 *           → ffmpeg-handler（主进程）
 *             → child_process.spawn(ffmpeg, args)
 *
 * 设计要点：
 * - 所有方法返回 Result<T> 模式：{ ok: true, value } | { ok: false, error }
 * - 失败不抛异常，由调用方决定如何处理
 * - ffmpeg 不可用时返回友好错误，不阻断 Agent Loop
 *
 * 实现细节已按功能拆分到：
 * - ./ffmpeg-types  — 类型定义
 * - ./ffmpeg-core   — HTTP 通信、可用性检查、路径解析
 * - ./ffmpeg-helpers — atempo 链、SRT 时间、xfade 映射、duration 探测
 * - ./ffmpeg-audio  — 5 个音频操作
 * - ./ffmpeg-video  — 8 个视频操作
 * - ./ffmpeg-compose — 一键合成最终视频
 */

export type { FfmpegResult } from "./ffmpeg-types";
export {
  executeFfmpeg,
  checkFfmpegAvailable,
  resetFfmpegCache,
} from "./ffmpeg-core";
export {
  mixAudio,
  adjustAudioSpeed,
  normalizeAudio,
  removeNoise,
  splitAudio,
} from "./ffmpeg-audio";
export {
  mergeVideos,
  trimVideo,
  addTransition,
  addSubtitle,
  adjustVideoSpeed,
  extractAudio,
  replaceAudio,
  generateThumbnail,
} from "./ffmpeg-video";
export { composeFinalVideo } from "./ffmpeg-compose";
