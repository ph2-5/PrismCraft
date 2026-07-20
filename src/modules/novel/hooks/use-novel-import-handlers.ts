/**
 * P1.5 细化拆分：导入与段落选中 Handlers Hook。
 *
 * 从 useNovelTools 进一步拆出，集中管理文本导入 + 段落选中相关 handlers：
 * - handleImport：调用 segmentNovelTextTool 实际分段，失败时降级到占位分段
 * - handleToggle / handleSelectAll：段落选中状态操作
 *
 * 这部分逻辑独立于 entity/shot/mode 等 handlers，单独拆出便于维护。
 */

import { useCallback } from "react";
import type { NovelSegment } from "../domain/types";
import { segmentNovelTextTool } from "../tools";
import { canTransition, transition } from "../import/services/pipeline-machine";
import { DEFAULT_PACING_CONFIG } from "../pacing";
import { NOVEL_TOOL_CTX } from "./pipeline-helpers";
import type { UsePipelineStateResult } from "./use-pipeline-state";

export interface UseNovelImportHandlersOptions {
  state: UsePipelineStateResult["state"];
  setState: UsePipelineStateResult["setState"];
  setSelectedSegmentIds: UsePipelineStateResult["setSelectedSegmentIds"];
  setIsProcessing: UsePipelineStateResult["setIsProcessing"];
  setStoryStructure: UsePipelineStateResult["setStoryStructure"];
  setTreatment: UsePipelineStateResult["setTreatment"];
  setShotContracts: UsePipelineStateResult["setShotContracts"];
  setPacingConfig: UsePipelineStateResult["setPacingConfig"];
  isMountedRef: UsePipelineStateResult["isMountedRef"];
}

export interface UseNovelImportHandlersResult {
  handleImport: (text: string) => Promise<void>;
  handleToggle: (id: string) => void;
  handleSelectAll: () => void;
}

/**
 * 导入与段落选中 Handlers Hook。
 */
export function useNovelImportHandlers({
  state,
  setState,
  setSelectedSegmentIds,
  setIsProcessing,
  setStoryStructure,
  setTreatment,
  setShotContracts,
  setPacingConfig,
  isMountedRef,
}: UseNovelImportHandlersOptions): UseNovelImportHandlersResult {
  // handleImport：导入文本 + 占位分段 + 调用 segmentNovelTextTool 实际分段
  const handleImport = useCallback(async (text: string) => {
    // H-1 修复：新项目导入时清空 structure 子域 state
    setStoryStructure(null);
    setTreatment(null);
    setShotContracts([]);
    setPacingConfig(DEFAULT_PACING_CONFIG);

    setState((prev) => {
      const next = canTransition(prev.stage, "content_import")
        ? transition(prev, "content_import")
        : prev;
      return { ...next, rawText: text };
    });

    // 先用占位分段填充 UI（即使后续工具调用失败也有降级内容）
    const placeholderSegments: NovelSegment[] = text
      .split(/\n\s*\n/)
      .filter((p) => p.trim().length > 0)
      .slice(0, 20)
      .map((para, i) => ({
        id: `seg-${i + 1}`,
        title: `段落 ${i + 1}`,
        summary: para.slice(0, 80) + (para.length > 80 ? "..." : ""),
        startChar: 0,
        endChar: para.length,
        estimatedDuration: Math.max(3, Math.min(15, Math.round(para.length / 50))),
        keyEvents: [],
        text: para,
      }));
    setState((prev) => ({ ...prev, segments: placeholderSegments }));
    setSelectedSegmentIds(placeholderSegments.map((s) => s.id));

    // 接入 segmentNovelTextTool 实际分段（失败时保留占位分段作为降级）
    setIsProcessing(true);
    try {
      const result = await segmentNovelTextTool.execute({ text }, NOVEL_TOOL_CTX);
      if (!isMountedRef.current) return;
      if (result.success && result.data) {
        const data = result.data as { segments: NovelSegment[] };
        if (Array.isArray(data.segments) && data.segments.length > 0) {
          const filledSegments = data.segments.map((seg) => {
            const startChar = seg.startChar ?? 0;
            const endChar = seg.endChar ?? text.length;
            const segText =
              startChar === 0 && endChar === text.length
                ? text
                : text.slice(startChar, endChar);
            return { ...seg, text: segText };
          });
          setState((prev) => ({ ...prev, segments: filledSegments }));
          setSelectedSegmentIds(filledSegments.map((s) => s.id));
        }
      }
    } finally {
      if (isMountedRef.current) setIsProcessing(false);
    }
  }, [
    setState,
    setSelectedSegmentIds,
    setIsProcessing,
    setStoryStructure,
    setTreatment,
    setShotContracts,
    setPacingConfig,
    isMountedRef,
  ]);

  // 段落选中 handlers
  const handleToggle = useCallback((id: string) => {
    setSelectedSegmentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, [setSelectedSegmentIds]);

  const handleSelectAll = useCallback(() => {
    setSelectedSegmentIds((prev) => {
      const allIds = state.segments.map((s) => s.id);
      const allSelected = allIds.length > 0 && prev.length === allIds.length;
      return allSelected ? [] : allIds;
    });
  }, [state.segments, setSelectedSegmentIds]);

  return { handleImport, handleToggle, handleSelectAll };
}
