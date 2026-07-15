/**
 * 视频合成 hook（Task 4.3）
 *
 * 管理合成状态：片段列表、拖拽排序、转场配置、合成进度、结果
 */

import { useState, useCallback, useRef } from "react";
import { errorLogger } from "@/shared/error-logger";
import {
  type VideoSegment,
  type ComposeResult,
  listCompletedVideoTasks,
  composeVideoSegments,
  checkComposerAvailable,
  pickLocalVideoFiles,
} from "../services/video-composer";

export interface UseVideoComposeResult {
  /** 已选片段（按合成顺序排列） */
  segments: VideoSegment[];
  /** 可用片段（已完成的视频任务） */
  availableSegments: VideoSegment[];
  /** 转场效果 */
  transition: string;
  /** 转场时长 */
  transitionDuration: number;
  /** 是否正在加载可用片段 */
  isLoadingAvailable: boolean;
  /** 是否正在合成 */
  isComposing: boolean;
  /** 合成结果 */
  composeResult: ComposeResult | null;
  /** ffmpeg 是否可用 */
  ffmpegAvailable: boolean;
  /** 错误信息 */
  error: string | null;
  /** 设置转场效果 */
  setTransition: (v: string) => void;
  /** 设置转场时长 */
  setTransitionDuration: (v: number) => void;
  /** 加载可用片段 */
  loadAvailable: (storyId?: string) => Promise<void>;
  /** 添加片段到合成列表 */
  addSegment: (segment: VideoSegment) => void;
  /** 添加本地文件 */
  addLocalFiles: () => Promise<void>;
  /** 移除片段 */
  removeSegment: (id: string) => void;
  /** 移动片段顺序 */
  moveSegment: (from: number, to: number) => void;
  /** 拖拽排序（HTML5 drag-and-drop） */
  reorderSegments: (fromId: string, toId: string) => void;
  /** 清空片段列表 */
  clearSegments: () => void;
  /** 执行合成 */
  compose: () => Promise<void>;
  /** 清除结果 */
  clearResult: () => void;
}

export function useVideoCompose(): UseVideoComposeResult {
  const [segments, setSegments] = useState<VideoSegment[]>([]);
  const [availableSegments, setAvailableSegments] = useState<VideoSegment[]>([]);
  const [transition, setTransition] = useState("fade");
  const [transitionDuration, setTransitionDuration] = useState(0.5);
  const [isLoadingAvailable, setIsLoadingAvailable] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [composeResult, setComposeResult] = useState<ComposeResult | null>(null);
  const [ffmpegAvailable, setFfmpegAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const availableCheckedRef = useRef(false);

  const loadAvailable = useCallback(async (storyId?: string) => {
    setIsLoadingAvailable(true);
    setError(null);
    try {
      const list = await listCompletedVideoTasks(storyId);
      setAvailableSegments(list);
      // 首次加载时检查 ffmpeg 可用性
      if (!availableCheckedRef.current) {
        const check = await checkComposerAvailable();
        setFfmpegAvailable(check.available);
        availableCheckedRef.current = true;
        if (!check.available) {
          setError("FFmpeg 不可用，请先在设置中配置 FFmpeg 路径");
        }
      }
    } catch (e) {
      errorLogger.warn("[useVideoCompose] 加载可用片段失败", e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoadingAvailable(false);
    }
  }, []);

  const addSegment = useCallback((segment: VideoSegment) => {
    setSegments((prev) => {
      // 避免重复添加
      if (prev.some((s) => s.id === segment.id)) return prev;
      return [...prev, segment];
    });
  }, []);

  const addLocalFiles = useCallback(async () => {
    try {
      const paths = await pickLocalVideoFiles();
      if (paths.length === 0) return;
      const newSegments: VideoSegment[] = paths.map((p) => {
        const name = p.split(/[\\/]/).pop() ?? p;
        return {
          id: `file-${p}`,
          label: name,
          path: p,
          source: "file" as const,
        };
      });
      setSegments((prev) => {
        const existing = new Set(prev.map((s) => s.id));
        return [...prev, ...newSegments.filter((s) => !existing.has(s.id))];
      });
    } catch (e) {
      errorLogger.warn("[useVideoCompose] 添加本地文件失败", e);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const removeSegment = useCallback((id: string) => {
    setSegments((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const moveSegment = useCallback((from: number, to: number) => {
    setSegments((prev) => {
      if (from < 0 || from >= prev.length || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      if (!moved) return prev;
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const reorderSegments = useCallback((fromId: string, toId: string) => {
    setSegments((prev) => {
      const fromIdx = prev.findIndex((s) => s.id === fromId);
      const toIdx = prev.findIndex((s) => s.id === toId);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      if (!moved) return prev;
      next.splice(toIdx, 0, moved);
      return next;
    });
  }, []);

  const clearSegments = useCallback(() => {
    setSegments([]);
    setComposeResult(null);
  }, []);

  const compose = useCallback(async () => {
    if (segments.length < 2) {
      setError("至少需要 2 个视频片段");
      return;
    }
    setIsComposing(true);
    setError(null);
    setComposeResult(null);
    try {
      const result = await composeVideoSegments(segments, transition, transitionDuration);
      setComposeResult(result);
      if (!result.success && result.error) {
        setError(result.error);
      }
    } catch (e) {
      errorLogger.warn("[useVideoCompose] 合成失败", e);
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setComposeResult({ success: false, error: msg });
    } finally {
      setIsComposing(false);
    }
  }, [segments, transition, transitionDuration]);

  const clearResult = useCallback(() => {
    setComposeResult(null);
    setError(null);
  }, []);

  return {
    segments,
    availableSegments,
    transition,
    transitionDuration,
    isLoadingAvailable,
    isComposing,
    composeResult,
    ffmpegAvailable,
    error,
    setTransition,
    setTransitionDuration,
    loadAvailable,
    addSegment,
    addLocalFiles,
    removeSegment,
    moveSegment,
    reorderSegments,
    clearSegments,
    compose,
    clearResult,
  };
}
