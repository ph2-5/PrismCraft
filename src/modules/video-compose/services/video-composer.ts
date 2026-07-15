/**
 * 视频片段合成服务（Task 4.3）
 *
 * 职责：
 * - 列出已完成的视频任务作为可用合成片段
 * - 调用 ffmpeg-runner 的 mergeVideos 合成多段视频
 * - 支持 12 种转场效果（fade/dissolve/fadeblack/fadewhite/slide/wipe/circle/zoom）
 *
 * 架构：
 *   VideoComposePanel（UI）
 *     → use-video-compose（hook）
 *       → video-composer（本服务）
 *         → @/modules/ffmpeg-runner.mergeVideos
 *           → HTTP /api/ffmpeg/execute
 *             → ffmpeg-handler（主进程）
 *
 * 设计要点：
 * - 复用现有 mergeVideos，不重新实现 ffmpeg 调用
 * - 片段来源：已完成的视频任务（videoTaskStorage）+ 本地文件（openFileDialog）
 * - 合成结果返回本地路径，UI 层负责预览
 */

import { container } from "@/infrastructure/di";
import {
  mergeVideos,
  checkFfmpegAvailable,
  type FfmpegResult,
} from "@/modules/ffmpeg-runner";
import type { VideoTask } from "@/domain/schemas";

/** 可合成的视频片段 */
export interface VideoSegment {
  /** 唯一标识（taskId 或文件路径） */
  id: string;
  /** 显示名称 */
  label: string;
  /** 本地文件路径 */
  path: string;
  /** 来源：视频任务 / 本地文件 */
  source: "task" | "file";
  /** 关联的任务 ID（source=task 时） */
  taskId?: string;
  /** 关联的故事 ID */
  storyId?: string;
  /** 关联的分镜 ID */
  beatId?: string;
  /** 关联的分镜标题 */
  beatTitle?: string;
}

/** 转场效果选项 */
export interface TransitionOption {
  value: string;
  label: string;
}

/** 支持的转场效果列表 */
export const TRANSITION_OPTIONS: TransitionOption[] = [
  { value: "none", label: "无转场（直接拼接）" },
  { value: "fade", label: "淡入淡出" },
  { value: "cut", label: "硬切" },
  { value: "dissolve", label: "溶解" },
  { value: "fadeblack", label: "黑场过渡" },
  { value: "fadewhite", label: "白场过渡" },
  { value: "slideleft", label: "左滑" },
  { value: "slideright", label: "右滑" },
  { value: "slideup", label: "上滑" },
  { value: "slidedown", label: "下滑" },
  { value: "wipeleft", label: "左擦除" },
  { value: "wiperight", label: "右擦除" },
  { value: "circleopen", label: "圆形打开" },
  { value: "circleclose", label: "圆形关闭" },
  { value: "zoomin", label: "放大" },
];

/** 合成结果 */
export interface ComposeResult {
  success: boolean;
  outputPath?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 列出已完成的视频任务作为可用合成片段
 *
 * @param storyId 可选，按故事 ID 过滤；不传则返回所有已完成任务
 */
export async function listCompletedVideoTasks(storyId?: string): Promise<VideoSegment[]> {
  const storage = container.videoTaskStorage;
  const allTasks: VideoTask[] = await storage.getVideoTasks();
  const completed = allTasks.filter(
    (t) => t.status === "completed" && t.localVideoPath,
  );
  const filtered = storyId ? completed.filter((t) => t.storyId === storyId) : completed;
  return filtered.map((t) => ({
    id: t.taskId,
    label: t.beatTitle ? `分镜：${t.beatTitle}` : `任务 ${t.taskId.slice(0, 8)}`,
    path: t.localVideoPath!,
    source: "task" as const,
    taskId: t.taskId,
    storyId: t.storyId,
    beatId: t.beatId,
    beatTitle: t.beatTitle,
  }));
}

/**
 * 合成视频片段
 *
 * @param segments 已排序的片段列表（至少 2 个）
 * @param transition 转场效果（none/fade/dissolve/...）
 * @param transitionDuration 转场时长（秒）
 */
export async function composeVideoSegments(
  segments: VideoSegment[],
  transition: string = "none",
  transitionDuration: number = 0.5,
): Promise<ComposeResult> {
  if (segments.length < 2) {
    return { success: false, error: "至少需要 2 个视频片段才能合成" };
  }
  const paths = segments.map((s) => s.path);
  const result: FfmpegResult = await mergeVideos(paths, transition, transitionDuration);
  return {
    success: result.success,
    outputPath: result.outputPath,
    error: result.error,
    metadata: result.metadata,
  };
}

/**
 * 检查 ffmpeg 是否可用
 */
export async function checkComposerAvailable(): Promise<{
  available: boolean;
  version?: string;
  path?: string;
}> {
  const result = await checkFfmpegAvailable();
  return result;
}

/**
 * 通过 OpenFileDialog 添加本地视频文件
 *
 * @returns 选中的文件路径数组（用户取消时返回空数组）
 */
export async function pickLocalVideoFiles(): Promise<string[]> {
  const electronAPI = (window as unknown as {
    electronAPI?: {
      openFileDialog?: () => Promise<{ canceled: boolean; filePaths: string[] } | string[]>;
    };
  }).electronAPI;
  if (!electronAPI?.openFileDialog) {
    throw new Error("当前环境不支持文件选择对话框");
  }
  const result = await electronAPI.openFileDialog();
  // 兼容两种返回格式
  if (Array.isArray(result)) {
    return result;
  }
  return result.canceled ? [] : result.filePaths;
}
