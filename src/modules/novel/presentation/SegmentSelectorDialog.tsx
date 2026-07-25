/**
 * v5.2 角色管理重构 — 片段多选弹窗
 *
 * 用于"渐进式提取"模式：用户选择要做视频的片段（多选 segment），
 * AI 仅提取这些片段的角色，适合长篇小说"做哪段提取哪段"。
 *
 * 显示信息：
 * - 片段序号、标题、所属章节、字数
 * - 全选/全不选/按章选
 */

import { useState, useEffect, useMemo } from "react";
import { X, Layers, Check } from "lucide-react";
import { t } from "@/shared/constants";
import type { Segment } from "../domain/types";

export interface SegmentSelectorDialogProps {
  open: boolean;
  onClose: () => void;
  /** 全部片段列表 */
  segments: Segment[];
  /** 默认选中的片段 ID 列表 */
  defaultSelected?: string[];
  /** 提交回调（返回选中的 segment ID 列表） */
  onSubmit: (selectedIds: string[]) => void;
}

export function SegmentSelectorDialog({
  open,
  onClose,
  segments,
  defaultSelected = [],
  onSubmit,
}: SegmentSelectorDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 弹窗打开时重置选中状态
  useEffect(() => {
    if (open) {
      setSelectedIds(new Set(defaultSelected));
    }
  }, [open, defaultSelected]);

  // 按章节分组
  const groupedByChapter = useMemo(() => {
    const groups = new Map<string, { chapterTitle: string; segments: Segment[] }>();
    for (const seg of segments) {
      const key = seg.chapterIndex !== undefined
        ? `${seg.chapterIndex}-${seg.chapterTitle ?? ""}`
        : "no-chapter";
      if (!groups.has(key)) {
        groups.set(key, {
          chapterTitle: seg.chapterIndex !== undefined
            ? t("novel.character.segmentSelector.chapterLabel", {
                n: seg.chapterIndex,
                title: seg.chapterTitle ?? "",
              })
            : t("novel.character.segmentSelector.noChapter"),
          segments: [],
        });
      }
      groups.get(key)!.segments.push(seg);
    }
    return Array.from(groups.entries());
  }, [segments]);

  if (!open) return null;

  const toggleSegment = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleChapter = (_chapterKey: string, chapterSegments: Segment[]) => {
    const allSelected = chapterSegments.every((s) => selectedIds.has(s.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        // 全选 → 取消全选
        for (const s of chapterSegments) {
          next.delete(s.id);
        }
      } else {
        // 未全选 → 全选
        for (const s of chapterSegments) {
          next.add(s.id);
        }
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(segments.map((s) => s.id)));
  };

  const handleSelectNone = () => {
    setSelectedIds(new Set());
  };

  const handleSubmit = () => {
    onSubmit(Array.from(selectedIds));
    onClose();
  };

  const selectedCount = selectedIds.size;
  const totalChars = segments
    .filter((s) => selectedIds.has(s.id))
    .reduce((sum, s) => sum + s.text.length, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="card w-[560px] max-w-[90vw] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Layers size={14} />
            <span className="text-[13px] font-bold">
              {t("novel.character.segmentSelector.title")}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-xs"
            aria-label={t("common.close")}
          >
            <X size={14} />
          </button>
        </div>

        {/* 操作栏 */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border text-[11px]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSelectAll}
              className="btn btn-ghost btn-xs"
            >
              {t("novel.character.segmentSelector.selectAll")}
            </button>
            <button
              type="button"
              onClick={handleSelectNone}
              className="btn btn-ghost btn-xs"
            >
              {t("novel.character.segmentSelector.selectNone")}
            </button>
          </div>
          <div className="text-muted-foreground">
            {t("novel.character.segmentSelector.selectedStats", {
              count: selectedCount,
              total: segments.length,
              chars: totalChars,
            })}
          </div>
        </div>

        {/* 片段列表（按章节分组） */}
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
          {segments.length === 0 ? (
            <div className="text-center text-[12px] text-muted-foreground py-8">
              {t("novel.character.segmentSelector.empty")}
            </div>
          ) : (
            groupedByChapter.map(([chapterKey, group]) => {
              const allChapterSelected = group.segments.every((s) =>
                selectedIds.has(s.id),
              );
              return (
                <div key={chapterKey} className="flex flex-col gap-1">
                  {/* 章节标题 + 全选 */}
                  <button
                    type="button"
                    onClick={() => toggleChapter(chapterKey, group.segments)}
                    className="flex items-center gap-2 text-[11px] font-bold text-muted-foreground hover:text-foreground"
                  >
                    <div
                      className={[
                        "flex items-center justify-center w-3.5 h-3.5 rounded border",
                        allChapterSelected
                          ? "bg-[var(--primary)] border-[var(--primary)] text-primary-foreground"
                          : "border-border",
                      ].join(" ")}
                    >
                      {allChapterSelected && <Check size={10} />}
                    </div>
                    {group.chapterTitle}
                  </button>

                  {/* 章节下的片段 */}
                  <div className="flex flex-col gap-0.5 pl-5">
                    {group.segments.map((seg) => {
                      const isSelected = selectedIds.has(seg.id);
                      const globalIdx = segments.indexOf(seg);
                      return (
                        <button
                          key={seg.id}
                          type="button"
                          onClick={() => toggleSegment(seg.id)}
                          className={[
                            "flex items-start gap-2 p-2 rounded-md text-left transition-colors",
                            isSelected ? "bg-[var(--primary)]/10" : "hover:bg-muted/50",
                          ].join(" ")}
                        >
                          <div
                            className={[
                              "flex items-center justify-center w-3.5 h-3.5 rounded border mt-0.5 shrink-0",
                              isSelected
                                ? "bg-[var(--primary)] border-[var(--primary)] text-primary-foreground"
                                : "border-border",
                            ].join(" ")}
                          >
                            {isSelected && <Check size={10} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-medium">
                              {t("novel.character.segmentSelector.segmentLabel", {
                                n: globalIdx + 1,
                                title: seg.title,
                              })}
                            </div>
                            {seg.summary && (
                              <div className="text-[11px] text-muted-foreground line-clamp-1">
                                {seg.summary}
                              </div>
                            )}
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {t("novel.character.segmentSelector.charsCount", {
                                count: seg.text.length,
                              })}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 底部操作 */}
        <div className="flex justify-end gap-2 p-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={selectedCount === 0}
            className={[
              "btn btn-sm",
              selectedCount === 0
                ? "btn-muted cursor-not-allowed opacity-60"
                : "btn-primary",
            ].join(" ")}
          >
            {t("novel.character.segmentSelector.submit", { count: selectedCount })}
          </button>
        </div>
      </div>
    </div>
  );
}
