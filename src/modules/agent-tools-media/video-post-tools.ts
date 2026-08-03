/**
 * 视频后期处理工具（Video Post Tools）
 *
 * 本文件已按工具类型拆分（P2.1 拆分超长文件重构）：
 * - 剪辑类（merge_videos / trim_video / add_transition / add_subtitle / adjust_video_speed）：./video-tools-edit
 * - 音频类（extract_audio / replace_audio）：./video-tools-audio
 * - 输出类（generate_thumbnail / compose_final_video）：./video-tools-output
 * - 共享辅助（ffmpeg 不可用提示）：./video-tools-shared
 *
 * 本文件保留公共 API（9 个工具常量 + videoPostTools 数组）的 re-export 与汇总，
 * 导出名、签名、类型与拆分前完全一致，调用方无感知。
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import {
  mergeVideosTool,
  trimVideoTool,
  addTransitionTool,
  addSubtitleTool,
  adjustVideoSpeedTool,
} from "./video-tools-edit";
import { extractAudioTool, replaceAudioTool } from "./video-tools-audio";
import { generateThumbnailTool, composeFinalVideoTool } from "./video-tools-output";

// 公共 API re-export（与拆分前一致）
export {
  mergeVideosTool,
  trimVideoTool,
  addTransitionTool,
  addSubtitleTool,
  adjustVideoSpeedTool,
} from "./video-tools-edit";
export { extractAudioTool, replaceAudioTool } from "./video-tools-audio";
export { generateThumbnailTool, composeFinalVideoTool } from "./video-tools-output";

/** 导出所有视频后期处理工具 */
export const videoPostTools: ToolImpl[] = [
  mergeVideosTool,
  trimVideoTool,
  addTransitionTool,
  addSubtitleTool,
  adjustVideoSpeedTool,
  extractAudioTool,
  replaceAudioTool,
  generateThumbnailTool,
  composeFinalVideoTool,
];
