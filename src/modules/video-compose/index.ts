/**
 * video-compose 模块（Task 4.3 视频片段合成）
 *
 * 公共 API：VideoComposePanel 组件 + 服务层函数
 */

export { VideoComposePanel } from "./presentation/VideoComposePanel";
export {
  type VideoSegment,
  type ComposeResult,
  type TransitionOption,
  TRANSITION_OPTIONS,
  listCompletedVideoTasks,
  composeVideoSegments,
  checkComposerAvailable,
  pickLocalVideoFiles,
} from "./services/video-composer";
export { useVideoCompose, type UseVideoComposeResult } from "./hooks/use-video-compose";
