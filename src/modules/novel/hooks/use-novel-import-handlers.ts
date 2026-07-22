/**
 * P1.5 细化拆分：导入与段落选中 Handlers Hook。
 *
 * 从 useNovelTools 进一步拆出，集中管理文本导入 + 段落选中相关 handlers：
 * - handleImport：调用 segmentNovelTextTool 实际分段，失败时降级到占位分段
 * - handleToggle / handleSelectAll：段落选中状态操作
 *
 * Q2-1: handleImport 增强：
 * - 调用 detectChapters 识别章节，填充 PipelineState.chapters
 * - 占位分段使用累计偏移计算真实 startChar/endChar（相对于全文 rawText）
 * - 每个 segment 填充 chapterIndex/chapterTitle（通过 findChapterByOffset 查找）
 * - 调用 segmentNovelTextTool 后保留工具返回的真实偏移，并补充章节归属
 *
 * 这部分逻辑独立于 entity/shot/mode 等 handlers，单独拆出便于维护。
 */

import { useCallback } from "react";
import type { NovelChapter, NovelSegment } from "../domain/types";
import { segmentNovelTextTool, detectChapters, findChapterByOffset } from "../tools";
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
 * 为 segments 填充章节归属，并更新 chapters 的 segmentIds。
 * Q2-1: 统一处理章节关联逻辑，避免占位分段和工具分段两处重复代码。
 */
function attachChaptersToSegments(
  segments: NovelSegment[],
  chapters: NovelChapter[],
): { segments: NovelSegment[]; chapters: NovelChapter[] } {
  if (chapters.length === 0) {
    return { segments, chapters };
  }
  const updatedSegments = segments.map((seg) => {
    const ch = findChapterByOffset(chapters, seg.startChar);
    return {
      ...seg,
      chapterIndex: ch?.index,
      chapterTitle: ch?.title,
    };
  });
  // 更新每个 chapter 的 segmentIds
  const updatedChapters = chapters.map((ch) => ({
    ...ch,
    segmentIds: updatedSegments
      .filter((s) => s.chapterIndex === ch.index)
      .map((s) => s.id),
  }));
  return { segments: updatedSegments, chapters: updatedChapters };
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

    // Q2-1: 章节识别（正则，零依赖，失败返回空数组）
    const chapters = detectChapters(text);

    setState((prev) => {
      const next = canTransition(prev.stage, "content_import")
        ? transition(prev, "content_import")
        : prev;
      return { ...next, rawText: text, chapters };
    });

    // Q2-1: 占位分段使用累计偏移计算真实 startChar/endChar（相对于全文 rawText）
    // 旧实现 startChar=0/endChar=para.length 是相对于单段，导致偏移错乱
    const placeholderSegments: NovelSegment[] = [];
    let placeholderCursor = 0;
    text
      .split(/\n\s*\n/)
      .filter((p) => p.trim().length > 0)
      .slice(0, 20)
      .forEach((para, i) => {
        // 在 placeholderCursor 之后查找段落真实起始（跳过空行/空白）
        const found = text.indexOf(para, placeholderCursor);
        const startChar = found >= 0 ? found : placeholderCursor;
        const endChar = startChar + para.length;
        placeholderCursor = endChar;
        placeholderSegments.push({
          id: `seg-${i + 1}`,
          title: `段落 ${i + 1}`,
          summary: para.slice(0, 80) + (para.length > 80 ? "..." : ""),
          startChar,
          endChar,
          estimatedDuration: Math.max(3, Math.min(15, Math.round(para.length / 50))),
          keyEvents: [],
          text: para,
        });
      });

    // Q2-1: 为占位分段填充章节归属
    const { segments: placeholderWithChapters, chapters: chaptersWithPlaceholderSegs } =
      attachChaptersToSegments(placeholderSegments, chapters);

    setState((prev) => ({
      ...prev,
      segments: placeholderWithChapters,
      chapters: chaptersWithPlaceholderSegs,
    }));
    setSelectedSegmentIds(placeholderWithChapters.map((s) => s.id));

    // 接入 segmentNovelTextTool 实际分段（失败时保留占位分段作为降级）
    setIsProcessing(true);
    try {
      const result = await segmentNovelTextTool.execute({ text }, NOVEL_TOOL_CTX);
      if (!isMountedRef.current) return;
      if (result.success && result.data) {
        const data = result.data as { segments: NovelSegment[] };
        if (Array.isArray(data.segments) && data.segments.length > 0) {
          // Q2-1: 工具已返回真实偏移，直接填充 text 并补充章节归属
          const filledSegments = data.segments.map((seg) => {
            const segText = text.slice(seg.startChar, seg.endChar);
            return { ...seg, text: segText };
          });
          // 为工具分段填充章节归属
          const { segments: filledWithChapters, chapters: chaptersWithFilledSegs } =
            attachChaptersToSegments(filledSegments, chapters);
          setState((prev) => ({
            ...prev,
            segments: filledWithChapters,
            chapters: chaptersWithFilledSegs,
          }));
          setSelectedSegmentIds(filledWithChapters.map((s) => s.id));
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
