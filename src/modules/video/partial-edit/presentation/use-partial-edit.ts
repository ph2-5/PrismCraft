/**
 * Task 2A.22: usePartialEdit — 局部重绘状态管理 hook
 *
 * 职责：
 *   1. 管理 mask 状态（MaskConfig）
 *   2. 管理工具状态（activeTool / brushSize）
 *   3. 管理撤销/重做栈（单一来源，避免 VideoMaskCanvas 内部重复维护）
 *   4. 管理编辑指令（editPrompt）
 *   5. 管理视频时间戳（videoTimestamp，从 VideoMaskCanvas 同步）
 *   6. 管理 isGenerating 状态
 *   7. 暴露 startPartialEdit() — 调用 startPartialEditTask 并处理错误
 *
 * 设计要点：
 *   - VideoMaskCanvas 是受控组件，所有状态由本 hook 集中管理
 *   - 撤销栈以 MaskConfig 为单位，每次 onMaskChange 都 push
 *   - mask 变更时同步更新 videoTimestamp（标记当前帧）
 *   - 不直接调用 provider — 通过 startPartialEditTask 服务编排
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { emitToast } from "@/shared/utils/toast-bridge";
import { t } from "@/shared/constants";
import { errorLogger } from "@/shared/error-logger";
import { useVideoTaskStore } from "@/modules/video/task-management";
import type { GenerationAsset } from "@/domain/schemas";
import {
  createEmptyMaskConfig,
  toggleInverse,
  clearShapes,
  type MaskConfig,
} from "../domain/mask-types";
import {
  createPartialEditRequest,
  type PartialEditRequest,
  type PartialEditResult,
} from "../domain/edit-schema";
import {
  startPartialEditTask,
  type PartialEditServiceError,
} from "../services/partial-edit-service";
import type { MaskTool } from "./MaskToolbar";

export interface UsePartialEditOptions {
  /** 原视频 Asset ID */
  sourceVideoAssetId: string;
  /** 可选：关联 storyId */
  storyId?: string;
  /** 可选：关联 beatId */
  beatId?: string;
  /** 可选：指定 providerId */
  providerId?: string;
  /** 可选：指定 modelId */
  modelId?: string;
  /** 可选：视频时长（秒） */
  duration?: number;
  /** 任务提交后的回调（用于父组件刷新历史等） */
  onTaskSubmitted?: (result: PartialEditResult) => void;
}

export interface UsePartialEditResult {
  // ── mask 状态 ──────────────────────────────────────────────────────────────
  mask: MaskConfig;
  /** 用户绘制新 shape 时由 VideoMaskCanvas 调用（会自动入撤销栈） */
  handleMaskChange: (newMask: MaskConfig) => void;

  // ── 工具状态 ──────────────────────────────────────────────────────────────
  activeTool: MaskTool;
  setActiveTool: (tool: MaskTool) => void;
  brushSize: number;
  setBrushSize: (size: number) => void;

  // ── 撤销/重做/清空/反选 ────────────────────────────────────────────────────
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  toggleInverseMode: () => void;

  // ── 编辑指令 ──────────────────────────────────────────────────────────────
  editPrompt: string;
  setEditPrompt: (value: string) => void;

  // ── 视频时间戳 ────────────────────────────────────────────────────────────
  videoTimestamp: number;
  handleVideoTimeUpdate: (currentTime: number) => void;

  // ── 提交状态 ──────────────────────────────────────────────────────────────
  isGenerating: boolean;
  error: PartialEditServiceError | null;
  lastResult: PartialEditResult | null;
  startPartialEdit: () => Promise<void>;
  reset: () => void;

  // ── 历史选择 ──────────────────────────────────────────────────────────────
  selectedHistoryAsset: GenerationAsset | null;
  setSelectedHistoryAsset: (asset: GenerationAsset | null) => void;
  /** 任务提交后递增 — 用于触发 EditHistoryList 刷新 */
  historyRefreshTrigger: number;
}

const DEFAULT_BRUSH_SIZE = 20;

export function usePartialEdit(options: UsePartialEditOptions): UsePartialEditResult {
  const {
    sourceVideoAssetId,
    storyId,
    beatId,
    providerId,
    modelId,
    duration,
    onTaskSubmitted,
  } = options;

  // ── mask 状态 ──────────────────────────────────────────────────────────────
  const [mask, setMask] = useState<MaskConfig>(() => createEmptyMaskConfig(0));

  // 撤销/重做栈（与 mask 同步维护）
  const undoStackRef = useRef<MaskConfig[]>([mask]);
  const redoStackRef = useRef<MaskConfig[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // ── 工具状态 ──────────────────────────────────────────────────────────────
  const [activeTool, setActiveTool] = useState<MaskTool>("brush");
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH_SIZE);

  // ── 编辑指令 ──────────────────────────────────────────────────────────────
  const [editPrompt, setEditPrompt] = useState("");

  // ── 视频时间戳 ────────────────────────────────────────────────────────────
  const [videoTimestamp, setVideoTimestamp] = useState(0);

  // ── 提交状态 ──────────────────────────────────────────────────────────────
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<PartialEditServiceError | null>(null);
  const [lastResult, setLastResult] = useState<PartialEditResult | null>(null);
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);

  // ── 历史选择 ──────────────────────────────────────────────────────────────
  const [selectedHistoryAsset, setSelectedHistoryAsset] = useState<GenerationAsset | null>(null);

  // 保存最新的 onTaskSubmitted 回调，避免依赖变化导致 handleMaskChange 重建
  const onTaskSubmittedRef = useRef(onTaskSubmitted);
  useEffect(() => {
    onTaskSubmittedRef.current = onTaskSubmitted;
  }, [onTaskSubmitted]);

  // 更新 undo/redo 计数
  const updateUndoRedoFlags = useCallback(() => {
    setCanUndo(undoStackRef.current.length > 1);
    setCanRedo(redoStackRef.current.length > 0);
  }, []);

  // ── mask 变更处理（VideoMaskCanvas 调用） ──────────────────────────────────
  const handleMaskChange = useCallback((newMask: MaskConfig) => {
    setMask(newMask);
    undoStackRef.current.push(newMask);
    redoStackRef.current = [];
    updateUndoRedoFlags();
  }, [updateUndoRedoFlags]);

  // ── 撤销 ──────────────────────────────────────────────────────────────────
  const undo = useCallback(() => {
    if (undoStackRef.current.length <= 1) return;
    const current = undoStackRef.current.pop()!;
    redoStackRef.current.push(current);
    const prev = undoStackRef.current[undoStackRef.current.length - 1]!;
    setMask(prev);
    updateUndoRedoFlags();
  }, [updateUndoRedoFlags]);

  // ── 重做 ──────────────────────────────────────────────────────────────────
  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    const next = redoStackRef.current.pop()!;
    undoStackRef.current.push(next);
    setMask(next);
    updateUndoRedoFlags();
  }, [updateUndoRedoFlags]);

  // ── 清空 ──────────────────────────────────────────────────────────────────
  const clear = useCallback(() => {
    const cleared = clearShapes(mask);
    setMask(cleared);
    undoStackRef.current.push(cleared);
    redoStackRef.current = [];
    updateUndoRedoFlags();
  }, [mask, updateUndoRedoFlags]);

  // ── 反选 ──────────────────────────────────────────────────────────────────
  const toggleInverseMode = useCallback(() => {
    const inverted = toggleInverse(mask);
    setMask(inverted);
    undoStackRef.current.push(inverted);
    redoStackRef.current = [];
    updateUndoRedoFlags();
  }, [mask, updateUndoRedoFlags]);

  // ── 视频时间更新 ──────────────────────────────────────────────────────────
  const handleVideoTimeUpdate = useCallback((currentTime: number) => {
    setVideoTimestamp(currentTime);
  }, []);

  // ── 提交局部重绘任务 ──────────────────────────────────────────────────────
  const startPartialEdit = useCallback(async () => {
    if (isGenerating) return;

    // 同步 mask.videoTimestamp（确保提交时是最新值）
    const maskWithTimestamp: MaskConfig = {
      ...mask,
      videoTimestamp,
    };

    const request: PartialEditRequest = createPartialEditRequest({
      sourceVideoAssetId,
      mask: maskWithTimestamp,
      editPrompt,
      providerId,
      modelId,
      duration,
      storyId,
      beatId,
    });

    setIsGenerating(true);
    setError(null);

    try {
      const result = await startPartialEditTask(request, useVideoTaskStore.getState());
      if (result.ok) {
        setLastResult(result.value);
        setHistoryRefreshTrigger((n) => n + 1);
        emitToast(
          "success",
          t("video.partialEditTaskSubmittedTitle"),
          t("video.partialEditTaskSubmittedDetail", { taskId: result.value.taskId.slice(0, 8) }),
        );
        onTaskSubmittedRef.current?.(result.value);
      } else {
        setError(result.error);
        const errorMessage = formatServiceError(result.error);
        errorLogger.warn("[usePartialEdit] partial edit failed", {
          error: result.error,
          sourceVideoAssetId,
        });
        emitToast("error", t("video.partialEditFailed"), errorMessage);
      }
    } catch (e) {
      const unexpectedError: PartialEditServiceError = {
        kind: "provider_call_failed",
        message: e instanceof Error ? e.message : String(e),
        cause: e,
      };
      setError(unexpectedError);
      errorLogger.error("[usePartialEdit] unexpected error", { cause: e });
      emitToast(
        "error",
        t("video.partialEditFailed"),
        unexpectedError.message,
      );
    } finally {
      setIsGenerating(false);
    }
  }, [
    isGenerating,
    mask,
    videoTimestamp,
    sourceVideoAssetId,
    editPrompt,
    providerId,
    modelId,
    duration,
    storyId,
    beatId,
  ]);

  // ── 重置 ──────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    const empty = createEmptyMaskConfig(0);
    setMask(empty);
    undoStackRef.current = [empty];
    redoStackRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
    setActiveTool("brush");
    setBrushSize(DEFAULT_BRUSH_SIZE);
    setEditPrompt("");
    setVideoTimestamp(0);
    setIsGenerating(false);
    setError(null);
    setLastResult(null);
    setSelectedHistoryAsset(null);
  }, []);

  return {
    mask,
    handleMaskChange,
    activeTool,
    setActiveTool,
    brushSize,
    setBrushSize,
    canUndo,
    canRedo,
    undo,
    redo,
    clear,
    toggleInverseMode,
    editPrompt,
    setEditPrompt,
    videoTimestamp,
    handleVideoTimeUpdate,
    isGenerating,
    error,
    lastResult,
    startPartialEdit,
    reset,
    selectedHistoryAsset,
    setSelectedHistoryAsset,
    historyRefreshTrigger,
  };
}

/** 把 PartialEditServiceError 转换为用户可读的提示文案 */
function formatServiceError(error: PartialEditServiceError): string {
  // 所有 PartialEditServiceError 变体都包含 message 字段，提前提取避免在 default 分支访问 never
  const fallbackMessage = error.message;
  switch (error.kind) {
    case "validation":
      return t("video.partialEditValidationFailed");
    case "mask_encode":
      return t("video.partialEditMaskEmpty");
    case "mask_too_large":
      return t("video.partialEditMaskTooLarge");
    case "source_video_not_found":
      return t("video.partialEditSourceNotFound");
    case "provider_not_supported":
      return t("video.partialEditProviderNotSupported");
    case "provider_call_failed":
    case "asset_create_failed":
      return fallbackMessage;
    default:
      // 兜底：所有未识别的错误类型直接返回 message
      return fallbackMessage;
  }
}
