/**
 * Agent Tools - Media 模块
 *
 * 设计要点：
 * - 通过 barrel 导出工具数组和工具实现
 * - 内部实现细节不导出
 * - 其他模块通过 @/modules/agent-tools-media 导入
 *
 * 本模块从 agent/tools/ 拆分而来（阶段3-2），包含音频、视频、视频后期工具。
 * 这些工具均为叶子工具集，无 agent/services 依赖，可直接独立。
 */

// 音频工具（5 个）
export {
  mixAudioTool,
  adjustAudioSpeedTool,
  normalizeAudioTool,
  removeNoiseTool,
  splitAudioTool,
  audioTools,
} from "./audio-tools";

// 视频任务工具（7 个）
export {
  createVideoTaskTool,
  listVideoTasksTool,
  getVideoTaskTool,
  queryVideoStatusTool,
  cancelVideoTaskTool,
  recoverVideoTaskTool,
  batchCreateVideoTasksTool,
  videoTools,
} from "./video-tools";

// 视频后期工具（9 个）
export {
  mergeVideosTool,
  trimVideoTool,
  addTransitionTool,
  addSubtitleTool,
  adjustVideoSpeedTool,
  extractAudioTool,
  replaceAudioTool,
  generateThumbnailTool,
  composeFinalVideoTool,
  videoPostTools,
} from "./video-post-tools";

// 一致性 QC 工具（Task 2A.23 Agent 集成，2 个）
export {
  checkVideoConsistencyTool,
  dispatchVideoFallbackTool,
  qcTools,
} from "./qc-tools";
