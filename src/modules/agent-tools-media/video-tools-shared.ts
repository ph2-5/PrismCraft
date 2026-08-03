/**
 * 视频后期处理工具共享辅助（内部使用，不导出到公共 API）
 *
 * 从 video-post-tools.ts 拆分而来，供剪辑/音频/输出三类工具共用。
 */

/** ffmpeg 不可用时的统一错误提示 */
export function ffmpegUnavailableError(): string {
  return "ffmpeg 不可用。请在系统 PATH 中安装 ffmpeg，或在设置中配置 ffmpegPath。下载地址：https://ffmpeg.org/download.html";
}
