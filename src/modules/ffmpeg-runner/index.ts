/**
 * ffmpeg-runner 模块（公共 API barrel）
 *
 * 从 agent 模块拆分而来，提供 FFmpeg 音视频操作的高级 API。
 * 所有导出均来自 ./services/ffmpeg-service。
 */
export * from "./services/ffmpeg-service";
